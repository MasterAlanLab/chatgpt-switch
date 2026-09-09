import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Eye,
  EyeOff,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { parseSessionInput, splitSessionToken } from '../../lib/session';
import type { AccountSummary, AppState, Command, Response, Settings } from '../../lib/types';
import AccountMenu from './AccountMenu';
import Promotion from './Promotion';

type Modal =
  | { type: 'add' }
  | { type: 'rename' | 'delete'; account: AccountSummary }
  | { type: 'logout' }
  | null;
const dateLabel = (time?: number) =>
  time
    ? new Date(time).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
    : '尚未切换';

function ModalShell({
  title,
  children,
  onClose,
  busy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="关闭对话框" onClick={onClose} disabled={busy}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}

function SessionForm({
  mode,
  busy,
  onSubmit,
}: {
  mode: 'add' | 'login';
  busy: boolean;
  onSubmit: (input: string, name: string, remember: boolean) => Promise<boolean>;
}) {
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [remember, setRemember] = useState(false);
  const [visible, setVisible] = useState(false);
  const detected = useMemo(() => {
    if (!input.trim()) return null;
    try {
      const session = parseSessionInput(input);
      return {
        ok: true,
        text: `已识别 Session${session.email ? ` · ${session.email}` : ''} · ${splitSessionToken(session.token).length} 个 Cookie`,
      };
    } catch (error) {
      return { ok: false, text: error instanceof Error ? error.message : '请检查输入格式' };
    }
  }, [input]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onSubmit(input, name, mode === 'add' || remember)) {
      setInput('');
      setName('');
    }
  };
  return (
    <form onSubmit={submit} className="session-form">
      {(mode === 'add' || remember) && (
        <label className="field-label">
          账号备注 <span className="optional">选填</span>
          <input
            className="text-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="例如：个人账号、工作账号"
            disabled={busy}
          />
        </label>
      )}
      <div className="input-heading">
        <label htmlFor={`session-${mode}`}>Session Token / Cookie JSON</label>
        <div className="inline-actions">
          {input && (
            <button
              type="button"
              className="text-button"
              onClick={() => setInput('')}
              disabled={busy}
            >
              清空
            </button>
          )}
          <button
            type="button"
            className="icon-button small"
            aria-label={visible ? '隐藏 Session' : '显示 Session'}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <textarea
        id={`session-${mode}`}
        className={`session-input ${visible ? '' : 'masked'}`}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={'粘贴 Session Token，或包含登录 Cookie 的 JSON…'}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        maxLength={262144}
        disabled={busy}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div
        className={`input-hint ${detected ? (detected.ok ? 'valid' : 'invalid') : ''}`}
        aria-live="polite"
      >
        {detected?.ok ? <Check size={13} /> : <LockKeyhole size={13} />}
        <span>{detected?.text ?? '输入内容仅用于本次操作，不自动保存'}</span>
      </div>
      {mode === 'login' && (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            disabled={busy}
          />
          同时保存到本地账号列表
        </label>
      )}
      <button className="button primary full" type="submit" disabled={busy || !detected?.ok}>
        {busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : mode === 'add' ? (
          <Plus size={17} />
        ) : (
          <ArrowLeftRight size={17} />
        )}
        {busy ? '正在处理…' : mode === 'add' ? '保存账号' : '切换并登录'}
        {!busy && mode === 'login' && <kbd>⌘ / Ctrl ↵</kbd>}
      </button>
    </form>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>();
  const [tab, setTab] = useState<'accounts' | 'login'>('accounts');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ accountId: string; anchor: HTMLButtonElement }>();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const [modal, setModal] = useState<Modal>(null);
  const [rename, setRename] = useState('');
  const inFlight = useRef(false);

  const run = useCallback(async (command: Command): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      const response = (await browser.runtime.sendMessage(command)) as Response | undefined;
      if (!response) throw new Error('No background response');
      if (!response.ok) {
        setNotice({ text: response.error, error: true });
        return false;
      }
      setState(response.state);
      if (response.message) setNotice({ text: response.message, error: false });
      return true;
    } catch {
      setNotice({ text: '后台连接中断，请重新打开扩展或在扩展管理页重新加载。', error: true });
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const updateSettings = async (settings: Settings) => {
    if (!state || inFlight.current) return;
    const previous = state;
    setState({ ...state, settings });
    const ok = await run({ type: 'settings', tabId: state.context.tabId, settings });
    if (!ok) setState(previous);
  };

  useEffect(() => {
    void run({ type: 'state' });
  }, [run]);
  useEffect(() => closeMenu(), [tab, query, closeMenu]);

  const context = state?.context;
  const accounts =
    state?.accounts.filter((account) =>
      `${account.name} ${account.email ?? ''}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  const active = state?.accounts.find((account) => account.id === state.activeAccountId);
  const menuAccount = state?.accounts.find((account) => account.id === menu?.accountId);
  const modalTitle =
    modal?.type === 'add'
      ? '添加账号'
      : modal?.type === 'rename'
        ? '编辑账号备注'
        : modal?.type === 'delete'
          ? '移除这个账号？'
          : '清除当前登录？';

  return (
    <div className="app-shell">
      <div className="app-scroll">
        <header className="app-header">
          <div className="brand">
            <div className="brand-icon">
              <ArrowLeftRight size={23} strokeWidth={2.2} />
            </div>
            <div>
              <h1>
                ChatGPT <span>Switch</span>
              </h1>
              <p>你的账号，轻松切换。</p>
            </div>
          </div>
          <button
            className={`icon-button settings-trigger ${settingsOpen ? 'selected' : ''}`}
            aria-label="切换设置"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 size={19} />
          </button>
        </header>

        {context && (
          <section className="connection-card">
            <div className="connection-top">
              <span className="eyebrow">
                <span className={`status-dot ${state?.hasSession ? 'online' : ''}`} />
                {context.incognito ? '无痕窗口' : '当前浏览器环境'}
              </span>
              <span className="local-badge">
                <LockKeyhole size={10} />
                {context.incognito ? '临时存储' : '本地模式'}
              </span>
            </div>
            <div className="connection-main">
              <div>
                <strong>
                  {active?.name ?? (state?.hasSession ? '已检测到登录 Cookie' : '准备好切换账号')}
                </strong>
                <p>{context.isChatGPT ? context.hostname : '切换后即可前往 ChatGPT'}</p>
              </div>
              <button
                className="icon-button external-button"
                aria-label="打开 ChatGPT"
                title="打开 ChatGPT"
                disabled={busy}
                onClick={() => void run({ type: 'open', tabId: context.tabId })}
              >
                <ExternalLink size={18} />
              </button>
            </div>
          </section>
        )}

        {settingsOpen && state && context && (
          <section className="settings-panel">
            <h2>切换偏好</h2>
            <label className="setting-row">
              <span>
                切换后打开 ChatGPT<small>返回首页，避免延用其他账号的对话地址</small>
              </span>
              <input
                role="switch"
                type="checkbox"
                checked={state.settings.openAfterSwitch}
                disabled={busy}
                onChange={(event) =>
                  void updateSettings({ ...state.settings, openAfterSwitch: event.target.checked })
                }
              />
            </label>
            <label className="setting-row">
              <span>
                同时清理站点数据
                <small>
                  {context.incognito
                    ? '无痕窗口跳过清理，仅替换 Cookie'
                    : '清除本地草稿与缓存，不影响云端对话'}
                </small>
              </span>
              <input
                role="switch"
                type="checkbox"
                checked={state.settings.clearSiteData}
                disabled={busy || context.incognito}
                onChange={(event) =>
                  void updateSettings({ ...state.settings, clearSiteData: event.target.checked })
                }
              />
            </label>
            <button
              className="text-button danger logout-button"
              disabled={busy || !state.hasSession}
              onClick={() => setModal({ type: 'logout' })}
            >
              <LogOut size={14} />
              清除当前登录 Cookie
            </button>
          </section>
        )}

        <nav className="tabs" aria-label="功能导航">
          <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>
            <Users size={16} />
            我的账号<span className="count">{state?.accounts.length ?? 0}</span>
          </button>
          <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>
            <ArrowLeftRight size={16} />
            快捷登录
          </button>
        </nav>

        {notice && (
          <div
            className={`notice ${notice.error ? 'error' : 'success'}`}
            role={notice.error ? 'alert' : 'status'}
          >
            {notice.error ? <CircleHelp size={15} /> : <Check size={15} />}
            <span>{notice.text}</span>
            <button
              className="icon-button small"
              aria-label="关闭提示"
              onClick={() => setNotice(undefined)}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {!state ? (
          <section className="loading-state">
            {busy ? (
              <>
                <LoaderCircle className="spin" size={24} />
                <p>正在连接浏览器…</p>
              </>
            ) : (
              <>
                <CircleHelp size={26} />
                <p>扩展暂未就绪</p>
                <button className="button secondary" onClick={() => void run({ type: 'state' })}>
                  重新连接
                </button>
              </>
            )}
          </section>
        ) : (
          <main>
            {tab === 'accounts' ? (
              <>
                <div className="section-heading">
                  <h2>
                    账号列表{' '}
                    <span>
                      {state.accounts.length
                        ? `${state.accounts.length} 个已保存`
                        : '随时切换，无需反复粘贴'}
                    </span>
                  </h2>
                  <button
                    className="icon-button small"
                    aria-label="刷新账号状态"
                    disabled={busy}
                    onClick={() => void run({ type: 'state' })}
                  >
                    <RefreshCw size={14} className={busy ? 'spin' : ''} />
                  </button>
                </div>
                {state.accounts.length > 0 && (
                  <div className="search-input">
                    <Search size={15} />
                    <input
                      aria-label="搜索账号"
                      placeholder="搜索账号备注或邮箱"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                )}
                <div className="account-list">
                  {!state.accounts.length ? (
                    <div className="empty-state">
                      <div className="empty-illustration">
                        <div className="illustration-card back" />
                        <div className="illustration-card front">
                          <div className="mini-avatar">
                            <Users size={19} />
                          </div>
                          <div className="mini-lines">
                            <i />
                            <i />
                          </div>
                          <span>
                            <Check size={12} />
                          </span>
                        </div>
                        <div className="illustration-spark">
                          <Plus size={12} />
                        </div>
                      </div>
                      <h3>把常用账号放在这里</h3>
                      <p>
                        添加已有 Session，或保存当前登录态。
                        <br />
                        下次切换，只需轻轻一点。
                      </p>
                    </div>
                  ) : !accounts.length ? (
                    <div className="no-results">
                      <Search size={22} />
                      <p>没有找到匹配的账号</p>
                      <button className="text-button" onClick={() => setQuery('')}>
                        清空搜索
                      </button>
                    </div>
                  ) : (
                    accounts.map((account, index) => {
                      const current = account.id === state.activeAccountId;
                      const expired = !!account.expiresAt && account.expiresAt <= Date.now();
                      return (
                        <article
                          className={`account-card ${current ? 'current' : ''}`}
                          key={account.id}
                        >
                          <div className={`avatar avatar-${index % 4}`}>
                            {account.name.trim().slice(0, 1).toUpperCase()}
                          </div>
                          <div className="account-info">
                            <div className="account-name">
                              <h3 title={account.name}>{account.name}</h3>
                              {current && <span className="current-tag">当前</span>}
                            </div>
                            <p title={account.email}>
                              {account.email ??
                                (expired
                                  ? '记录已过期，请添加新 Session'
                                  : account.lastUsedAt
                                    ? `上次切换 ${dateLabel(account.lastUsedAt)}`
                                    : `添加于 ${dateLabel(account.createdAt)}`)}
                            </p>
                          </div>
                          <button
                            className={`switch-button ${current ? 'is-current' : ''}`}
                            disabled={busy || current || expired}
                            aria-label={`切换到 ${account.name}`}
                            onClick={() =>
                              void run({
                                type: 'switch',
                                id: account.id,
                                tabId: state.context.tabId,
                              })
                            }
                          >
                            {current ? <Check size={16} /> : <ArrowRight size={16} />}
                          </button>
                          <div className="account-menu">
                            <button
                              className="icon-button small"
                              aria-label={`管理 ${account.name}`}
                              aria-haspopup="menu"
                              aria-controls={
                                menu?.accountId === account.id ? 'account-actions-menu' : undefined
                              }
                              aria-expanded={menu?.accountId === account.id}
                              onClick={(event) =>
                                setMenu(
                                  menu?.accountId === account.id
                                    ? undefined
                                    : { accountId: account.id, anchor: event.currentTarget },
                                )
                              }
                              disabled={busy}
                            >
                              <MoreHorizontal size={17} />
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
                <div className="account-actions">
                  <button
                    className="button primary"
                    onClick={() => setModal({ type: 'add' })}
                    disabled={busy}
                  >
                    <Plus size={16} />
                    添加账号
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void run({ type: 'capture', name: '', tabId: state.context.tabId })
                    }
                  >
                    <ArrowDownToLine size={16} />
                    保存当前登录
                  </button>
                </div>
                <p className="small-note">
                  <Fingerprint size={12} />
                  同一浏览器环境共享登录态，切换会影响其他 ChatGPT 标签页。
                </p>
              </>
            ) : (
              <section className="quick-login">
                <div className="section-heading">
                  <h2>一次粘贴，即刻切换</h2>
                  <span className="eyebrow">SESSION</span>
                </div>
                <SessionForm
                  mode="login"
                  busy={busy}
                  onSubmit={(input, name, remember) =>
                    run({ type: 'login', input, name, remember, tabId: state.context.tabId })
                  }
                />
              </section>
            )}
            <details className="help">
              <summary>
                <CircleHelp size={14} />
                如何获取 Session？
                <ChevronDown size={14} />
              </summary>
              <div>
                <p>最简单的方式：在已登录 ChatGPT 的浏览器环境中，点击「保存当前登录」。</p>
                <p>
                  也可以直接打开{' '}
                  <a
                    href="https://chatgpt.com/api/auth/session"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    chatgpt.com/api/auth/session
                  </a>
                  ，按 <kbd>Ctrl+A</kbd> 全选，再按 <kbd>Ctrl+C</kbd> 复制，回来粘贴到输入框（macOS
                  使用 ⌘A / ⌘C）。
                </p>
                <p>
                  页面内容就是当前 Session。完整复制 JSON 后直接粘贴即可；Session
                  等同登录凭据，请妥善保管。
                </p>
              </div>
            </details>
          </main>
        )}
      </div>
      <footer className="app-footer">
        <Promotion />
        <div className="footer-meta">
          <span>
            <ShieldCheck size={13} />
            {context?.incognito
              ? '无痕账号仅临时保存于浏览器内存'
              : '登录态仅保存在本机 · 无第三方上传'}
          </span>
          <span>v{browser.runtime.getManifest().version}</span>
        </div>
      </footer>

      {menu && menuAccount && (
        <AccountMenu
          accountName={menuAccount.name}
          anchor={menu.anchor}
          onClose={closeMenu}
          onSelect={(type) => {
            setRename(menuAccount.name);
            setNotice(undefined);
            setModal({ type, account: menuAccount });
            closeMenu();
          }}
        />
      )}

      {modal && state && (
        <ModalShell title={modalTitle} busy={busy} onClose={() => setModal(null)}>
          {modal.type === 'add' ? (
            <>
              <p className="modal-description">
                为常用账号留一个位置。只保存 Session，不保存密码。
              </p>
              <SessionForm
                mode="add"
                busy={busy}
                onSubmit={async (input, name) => {
                  const ok = await run({ type: 'save', input, name, tabId: state.context.tabId });
                  if (ok) setModal(null);
                  return ok;
                }}
              />
              <p className="privacy-note">
                <LockKeyhole size={12} />
                {state.context.incognito
                  ? '保存在浏览器临时内存中，浏览器会话结束后清除。'
                  : 'Session 以明文保存在扩展本地存储中。请勿共享浏览器配置文件。'}
              </p>
            </>
          ) : modal.type === 'rename' ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  await run({
                    type: 'rename',
                    id: modal.account.id,
                    name: rename,
                    tabId: state.context.tabId,
                  })
                )
                  setModal(null);
              }}
            >
              <label className="field-label">
                账号备注
                <input
                  className="text-input"
                  autoFocus
                  value={rename}
                  maxLength={60}
                  onChange={(event) => setRename(event.target.value)}
                  disabled={busy}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setModal(null)}
                  disabled={busy}
                >
                  取消
                </button>
                <button className="button primary" disabled={busy || !rename.trim()}>
                  保存修改
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="modal-description">
                {modal.type === 'delete'
                  ? `「${modal.account.name}」的本地 Session 记录将被删除。当前网页的登录状态保持不变。`
                  : '将移除当前浏览器环境中的 ChatGPT 登录 Cookie，其他 ChatGPT 标签页也会受到影响。本地保存的账号仍然保留。'}
              </p>
              <div className="modal-actions">
                <button className="button secondary" onClick={() => setModal(null)} disabled={busy}>
                  取消
                </button>
                <button
                  className="button destructive"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await run(
                      modal.type === 'delete'
                        ? { type: 'delete', id: modal.account.id, tabId: state.context.tabId }
                        : { type: 'logout', tabId: state.context.tabId },
                    );
                    if (ok) setModal(null);
                  }}
                >
                  {busy ? '正在处理…' : modal.type === 'delete' ? '确认移除' : '清除登录'}
                </button>
              </div>
            </>
          )}
          {notice?.error && (
            <p className="modal-error" role="alert">
              {notice.text}
            </p>
          )}
        </ModalShell>
      )}
    </div>
  );
}
