import type { WxtBrowser } from 'wxt/browser';
import { validateCommand } from './commands';
import { SessionCookies } from './cookies';
import { CHATGPT_URL, isChatGPTUrl, SITE_ORIGINS } from './domains';
import { publicError, UserError } from './errors';
import { parseSessionInput, validateToken, type SessionInput } from './session';
import {
  DEFAULT_SETTINGS,
  type AccountAuth,
  type AppState,
  type Command,
  type Response,
  type SavedAccount,
  type TabContext,
  type UsageSnapshot,
  type Vault,
} from './types';
import { isAuthUsable } from './usage';
import { readAuth, readUsage, type Fetch } from './usage-client';

const VAULT_KEY = 'chatgpt-switch:v1';
const PRIVATE_VAULT_KEY = 'chatgpt-switch:private:v1';
const DEFAULT_CAPTURE_NAME = '当前 ChatGPT 账号';

type UsageUpdate = { auth?: AccountAuth; usage?: UsageSnapshot };

export class SwitchService {
  private queue: Promise<unknown> = Promise.resolve();
  private sessions: SessionCookies;

  constructor(
    private api: WxtBrowser,
    private fetchImpl: Fetch = (...args) => fetch(...args),
  ) {
    this.sessions = new SessionCookies(api);
  }

  dispatch(input: unknown): Promise<Response> {
    let command: Command;
    try {
      command = validateCommand(input);
    } catch (error) {
      return Promise.resolve({ ok: false, error: publicError(error) });
    }
    // A quota refresh waits on the network, so it only enters the queue to write.
    if (command.type === 'usage') return this.usage(command);
    return this.serialize(() => this.execute(command));
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }

  private execute(command: Command): Promise<Response> {
    return (async (): Promise<Response> => {
      let context: TabContext | undefined;
      try {
        context = await this.context(command.type === 'state' ? undefined : command.tabId);
        const vault = await this.readVault(context);
        let message: string | undefined;
        const getAccount = (id: string) => {
          const account = vault.accounts.find((item) => item.id === id);
          if (!account) throw new UserError('这条账号记录已被移除，请刷新列表。');
          return account;
        };
        switch (command.type) {
          case 'state':
            break;
          case 'save': {
            this.upsert(vault, parseSessionInput(command.input), command.name);
            await this.writeVault(context, vault);
            message = '账号已保存到本机';
            break;
          }
          case 'capture': {
            const session = await this.sessions.current(context.storeId);
            if (!session.token)
              throw new UserError('当前浏览器环境没有 ChatGPT 登录 Cookie，请先登录。');
            const auth = await readAuth(this.fetchImpl);
            const account = this.upsert(
              vault,
              {
                ...session,
                token: session.token,
                name: auth?.name ?? auth?.email ?? DEFAULT_CAPTURE_NAME,
                email: auth?.email,
              },
              command.name,
            );
            if (auth) account.auth = auth;
            await this.writeVault(context, vault);
            message = '当前登录态已保存，可编辑备注名称';
            break;
          }
          case 'login':
          case 'switch': {
            const account = command.type === 'switch' ? getAccount(command.id) : undefined;
            const session =
              account ?? parseSessionInput(command.type === 'login' ? command.input : '');
            // Validate the vault update before touching browser cookies.
            const saved =
              account ??
              (command.type === 'login' && command.remember
                ? this.upsert(vault, session, command.name)
                : undefined);
            await this.sessions.replace(session.token, context.storeId, session.expiresAt);
            if (saved) {
              saved.lastUsedAt = Date.now();
              try {
                await this.writeVault(context, vault);
              } catch {
                throw new UserError(
                  'Cookie 已切换，但本地账号记录保存未完成，请检查扩展存储空间。',
                );
              }
            }
            message = '登录 Cookie 已切换；登录结果以 ChatGPT 页面为准';
            if (vault.settings.clearSiteData && !context.incognito) {
              try {
                await this.api.browsingData.remove(
                  { origins: SITE_ORIGINS },
                  {
                    localStorage: true,
                    indexedDB: true,
                    cacheStorage: true,
                    serviceWorkers: true,
                  },
                );
              } catch {
                // Cookie switching already completed; cache cleanup is optional.
              }
            }
            if (vault.settings.openAfterSwitch) {
              try {
                await this.open(context);
              } catch {
                /* The user can open ChatGPT manually. */
              }
            }
            break;
          }
          case 'rename': {
            const name = command.name.trim();
            if (!name) throw new UserError('请输入账号备注名称。');
            const account = getAccount(command.id);
            account.name = name;
            account.updatedAt = Date.now();
            await this.writeVault(context, vault);
            message = '账号备注已更新';
            break;
          }
          case 'delete':
            getAccount(command.id);
            vault.accounts = vault.accounts.filter((account) => account.id !== command.id);
            await this.writeVault(context, vault);
            message = '本地账号记录已移除；当前页面登录态保持不变';
            break;
          case 'settings':
            vault.settings = {
              clearSiteData: command.settings.clearSiteData,
              openAfterSwitch: command.settings.openAfterSwitch,
            };
            await this.writeVault(context, vault);
            break;
          case 'logout':
            await this.sessions.clear(context.storeId);
            message = '当前环境的登录 Cookie 已清除，保存的账号仍然保留';
            if (context.isChatGPT) {
              try {
                await this.api.tabs.reload(context.tabId);
              } catch {
                /* The user can refresh manually. */
              }
            }
            break;
          case 'open':
            await this.open(context);
            break;
        }
        return { ok: true, state: await this.state(context, vault), message };
      } catch (error) {
        const message = publicError(error);
        return { ok: false, error: message };
      }
    })();
  }

  private async usage(command: Extract<Command, { type: 'usage' }>): Promise<Response> {
    try {
      const context = await this.context(command.tabId);
      // Firefox shares one background cookie jar across windows, so reading the
      // session of a private-window account could pick up the wrong login.
      const updates = context.incognito
        ? new Map<string, UsageUpdate>()
        : await this.collectUsage(context, command.details);
      return await this.serialize(async (): Promise<Response> => {
        // Re-read: the list may have changed while the refresh was in flight.
        const vault = await this.readVault(context);
        let changed = false;
        for (const account of vault.accounts) {
          const update = updates.get(account.id);
          if (!update) continue;
          if (update.auth) {
            account.auth = update.auth;
            account.email = update.auth.email ?? account.email;
            if (account.name === DEFAULT_CAPTURE_NAME) {
              account.name = update.auth.name ?? update.auth.email ?? account.name;
            }
          }
          if (update.usage) account.usage = update.usage;
          changed ||= !!(update.auth ?? update.usage);
        }
        if (changed) await this.writeVault(context, vault);
        const message =
          command.details && !changed ? '没有可读取额度的账号，请先切换到目标账号。' : undefined;
        return { ok: true, state: await this.state(context, vault), message };
      });
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  }

  private async collectUsage(
    context: TabContext,
    details: boolean,
  ): Promise<Map<string, UsageUpdate>> {
    const vault = await this.readVault(context);
    const updates = new Map<string, UsageUpdate>();
    // Only the account whose cookie is installed can mint a fresh bearer token.
    const active = await this.activeAccount(context, vault);
    if (active) {
      const needsProfile = active.name === DEFAULT_CAPTURE_NAME && !active.auth?.name;
      const auth =
        isAuthUsable(active.auth) && !needsProfile ? active.auth : await readAuth(this.fetchImpl);
      if (auth) updates.set(active.id, { auth });
    }
    await Promise.all(
      vault.accounts.map(async (account) => {
        const auth = updates.get(account.id)?.auth ?? account.auth;
        if (!isAuthUsable(auth)) return;
        const usage = await readUsage(this.fetchImpl, auth, details);
        if (usage) updates.set(account.id, { ...updates.get(account.id), usage });
      }),
    );
    return updates;
  }

  private async activeAccount(
    context: TabContext,
    vault: Vault,
  ): Promise<SavedAccount | undefined> {
    try {
      const { token } = await this.sessions.current(context.storeId);
      return token ? vault.accounts.find((account) => account.token === token) : undefined;
    } catch (error) {
      // A damaged cookie set is repairable from the UI; it must not fail a refresh.
      if (error instanceof UserError) return undefined;
      throw error;
    }
  }

  private async context(tabId?: number): Promise<TabContext> {
    const tab =
      tabId === undefined
        ? (await this.api.tabs.query({ active: true, currentWindow: true }))[0]
        : await this.api.tabs.get(tabId);
    if (tab?.id === undefined) throw new UserError('请在浏览器窗口中打开扩展。');
    if (Boolean(tab.incognito) !== Boolean(this.api.extension.inIncognitoContext)) {
      throw new UserError('窗口环境不一致，请在目标窗口重新打开扩展。');
    }
    const stores = await this.api.cookies.getAllCookieStores();
    const store = stores.find((item) => item.tabIds.includes(tab.id!));
    if (!store) throw new UserError('未找到当前窗口的 Cookie 存储区，请检查无痕访问设置后重试。');
    let hostname = '浏览器页面';
    try {
      hostname = new URL(tab.url ?? '').hostname || hostname;
    } catch {
      /* Internal browser page. */
    }
    return {
      tabId: tab.id,
      windowId: tab.windowId,
      storeId: store.id,
      incognito: !!tab.incognito,
      hostname,
      isChatGPT: isChatGPTUrl(tab.url ?? ''),
    };
  }

  private storage(context: TabContext) {
    return context.incognito
      ? { area: this.api.storage.session, key: PRIVATE_VAULT_KEY }
      : { area: this.api.storage.local, key: VAULT_KEY };
  }

  private async readVault(context: TabContext): Promise<Vault> {
    const { area, key } = this.storage(context);
    const raw = (await area.get(key))[key];
    if (raw === undefined) return { version: 1, accounts: [], settings: { ...DEFAULT_SETTINGS } };
    const vault = raw as Vault;
    if (
      vault?.version !== 1 ||
      !Array.isArray(vault.accounts) ||
      vault.accounts.length > 50 ||
      !vault.settings ||
      typeof vault.settings.clearSiteData !== 'boolean' ||
      typeof vault.settings.openAfterSwitch !== 'boolean'
    ) {
      throw new UserError('本地数据格式异常，原始记录已保留，请检查扩展存储。');
    }
    const ids = new Set<string>();
    for (const account of vault.accounts) {
      if (
        !account ||
        typeof account.id !== 'string' ||
        ids.has(account.id) ||
        typeof account.name !== 'string' ||
        typeof account.createdAt !== 'number' ||
        typeof account.updatedAt !== 'number' ||
        (account.email !== undefined && typeof account.email !== 'string') ||
        (account.expiresAt !== undefined && !Number.isFinite(account.expiresAt))
      ) {
        throw new UserError('本地账号记录格式异常，原始记录已保留。');
      }
      validateToken(account.token);
      // Quota data is decoration: drop anything malformed instead of locking the vault.
      if (
        account.auth &&
        (typeof account.auth.accessToken !== 'string' ||
          !Number.isFinite(account.auth.expiresAt) ||
          (account.auth.name !== undefined && typeof account.auth.name !== 'string') ||
          (account.auth.email !== undefined && typeof account.auth.email !== 'string'))
      ) {
        account.auth = undefined;
      }
      if (account.usage && !Number.isFinite(account.usage.fetchedAt)) account.usage = undefined;
      ids.add(account.id);
    }
    return vault;
  }

  private async writeVault(context: TabContext, vault: Vault) {
    const { area, key } = this.storage(context);
    await area.set({ [key]: vault });
  }

  private upsert(vault: Vault, session: SessionInput, name: string): SavedAccount {
    if (session.expiresAt !== undefined && session.expiresAt <= Date.now())
      throw new UserError('这份 Session 已超过记录的有效期，请重新获取。');
    const existing = vault.accounts.find((account) => account.token === session.token);
    if (existing) {
      existing.name = name.trim() || existing.name;
      existing.email = session.email ?? existing.email;
      existing.expiresAt = session.expiresAt ?? existing.expiresAt;
      existing.updatedAt = Date.now();
      return existing;
    }
    if (vault.accounts.length >= 50)
      throw new UserError('最多保存 50 个账号，请先移除暂时不用的记录。');
    const account: SavedAccount = {
      ...session,
      name: name.trim() || session.name || session.email || `账号 ${vault.accounts.length + 1}`,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    vault.accounts.unshift(account);
    return account;
  }

  private async state(context: TabContext, vault: Vault): Promise<AppState> {
    // Existing conflicting chunks should not prevent opening the UI to repair a session.
    let token: string | undefined;
    try {
      token = (await this.sessions.current(context.storeId)).token;
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
    }
    return {
      context,
      settings: vault.settings,
      accounts: vault.accounts.map(({ token: _token, auth, ...summary }) => ({
        ...summary,
        canRefreshUsage: isAuthUsable(auth),
      })),
      hasSession: !!token,
      activeAccountId: token
        ? vault.accounts.find((account) => account.token === token)?.id
        : undefined,
    };
  }

  private async open(context: TabContext) {
    // Re-read URL: the user may have navigated while a background operation ran.
    const tab = await this.api.tabs.get(context.tabId);
    if (isChatGPTUrl(tab.url ?? '')) {
      await this.api.tabs.update(context.tabId, { url: CHATGPT_URL, active: true });
    } else {
      await this.api.tabs.create({ url: CHATGPT_URL, active: true, windowId: context.windowId });
    }
  }
}
