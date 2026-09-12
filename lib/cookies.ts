import type { Browser, WxtBrowser } from 'wxt/browser';
import { CHATGPT_URL, isChatGPTHost } from './domains';
import { UserError } from './errors';
import { isSessionCookie, joinSessionCookies, splitSessionToken } from './session';

type Cookie = Browser.cookies.Cookie;

export class SessionCookies {
  constructor(private api: Pick<WxtBrowser, 'cookies'>) {}

  async list(storeId: string): Promise<Cookie[]> {
    const groups = await Promise.all(
      ['chatgpt.com', 'chat.openai.com'].map((domain) =>
        this.api.cookies.getAll({ domain, storeId }),
      ),
    );
    return groups
      .flat()
      .filter(
        (cookie) => isChatGPTHost(cookie.domain.replace(/^\./, '')) && isSessionCookie(cookie.name),
      );
  }

  async current(storeId: string): Promise<{ token?: string; expiresAt?: number }> {
    const cookies = (await this.api.cookies.getAll({ url: CHATGPT_URL, storeId })).filter(
      (cookie) => isSessionCookie(cookie.name) && !cookie.partitionKey,
    );
    // ChatGPT has migrated its session cookies between `.chatgpt.com` and the
    // host-only `chatgpt.com` scope. Both sets can remain in Chrome at once even
    // though the host-only set is the one selected for the current site. Keep the
    // scopes separate so stale domain cookies cannot make a valid login look
    // ambiguous.
    const hostOnly = cookies.filter(
      (cookie) => cookie.hostOnly && cookie.domain.replace(/^\./, '') === 'chatgpt.com',
    );
    const selected = hostOnly.length
      ? hostOnly
      : cookies.filter((cookie) => cookie.domain.replace(/^\./, '') === 'chatgpt.com');
    const expires = selected.flatMap((cookie) =>
      cookie.expirationDate ? [cookie.expirationDate * 1000] : [],
    );
    return {
      token: joinSessionCookies(selected),
      expiresAt: expires.length ? Math.min(...expires) : undefined,
    };
  }

  private details(cookie: Cookie) {
    return {
      url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
      name: cookie.name,
      storeId: cookie.storeId,
      ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
    };
  }

  async clear(storeId: string): Promise<void> {
    // Await every removal: stale .N chunks must be gone before writing a new session.
    // Iterate because domain and host-only cookies can share a name and path.
    for (let attempt = 0; attempt < 3; attempt++) {
      const cookies = await this.list(storeId);
      if (!cookies.length) return;
      for (const cookie of cookies) await this.api.cookies.remove(this.details(cookie));
    }
    if ((await this.list(storeId)).length)
      throw new UserError('旧登录 Cookie 清理未完成，请关闭 ChatGPT 页面后重试。');
  }

  private async restore(cookies: Cookie[]): Promise<void> {
    for (const cookie of cookies) {
      const result = await this.api.cookies.set({
        ...this.details(cookie),
        value: cookie.value,
        path: cookie.path,
        ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {}),
      });
      if (!result) throw new Error('Cookie restoration failed');
    }
  }

  async replace(token: string, storeId: string, expiresAt?: number): Promise<void> {
    const chunks = splitSessionToken(token);
    if (expiresAt !== undefined && expiresAt <= Date.now())
      throw new UserError('这份 Session 已超过记录的有效期，请重新获取。');
    const previous = await this.list(storeId);
    try {
      await this.clear(storeId);
      for (const chunk of chunks) {
        const cookie = await this.api.cookies.set({
          url: CHATGPT_URL,
          path: '/',
          storeId,
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
          ...(expiresAt ? { expirationDate: Math.floor(expiresAt / 1000) } : {}),
          ...chunk,
        });
        if (!cookie || cookie.value !== chunk.value) throw new Error('Cookie write failed');
      }
      if ((await this.current(storeId)).token !== token)
        throw new Error('Cookie verification failed');
    } catch {
      try {
        await this.clear(storeId);
        await this.restore(previous);
      } catch {
        throw new UserError('写入未完成，旧登录态恢复也未完成，请在 ChatGPT 页面重新登录。');
      }
      throw new UserError('Session 写入未完成，已恢复原来的登录 Cookie。');
    }
  }
}
