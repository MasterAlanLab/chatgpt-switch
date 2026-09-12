import { describe, expect, it, vi } from 'vitest';
import { SwitchService } from '../lib/service';
import type { Fetch } from '../lib/usage-client';
import { cookie, mockBrowser } from './mock-browser';

// Mirrors the private key in lib/service.ts so a vault can be seeded directly.
const VAULT_KEY = 'chatgpt-switch:v1';
const token = (suffix = '') => 'synthetic-session-'.repeat(8) + suffix;
const HOUR = 3600000;

const jwt = (expiresAt: number) =>
  [
    'header',
    btoa(
      JSON.stringify({
        exp: Math.floor(expiresAt / 1000),
        'https://api.openai.com/auth': { chatgpt_account_id: 'acct_live' },
      }),
    )
      .replaceAll('+', '-')
      .replaceAll('/', '_'),
    'sig',
  ].join('.');

const USAGE_BODY = {
  rate_limit: {
    primary_window: { used_percent: 37, limit_window_seconds: 18000, reset_at: 1789000000 },
    secondary_window: { used_percent: 62, limit_window_seconds: 604800, reset_at: 1789500000 },
  },
  rate_limit_reset_credits: { available_count: 2 },
};
const CREDITS_BODY = {
  available_count: 2,
  credits: [
    { id: 'a', status: 'available', expires_at: '2026-09-20T00:00:00Z' },
    { id: 'spent', status: 'redeemed', expires_at: '2026-09-14T00:00:00Z' },
    { id: 'b', status: 'available', expires_at: null },
  ],
};

function mockFetch(overrides: { authToken?: string; usageOk?: boolean } = {}) {
  const requests: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: unknown, init: RequestInit = {}) => {
    const href = String(url);
    requests.push({ url: href, init });
    const reply = (ok: boolean, body: unknown) => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    });
    if (href.includes('/api/auth/session')) {
      return reply(true, {
        accessToken: overrides.authToken ?? jwt(Date.now() + 6 * HOUR),
        expires: new Date(Date.now() + 24 * HOUR).toISOString(),
        user: { id: 'acct_live', name: 'Live User', email: 'live@example.com' },
      });
    }
    if (href.includes('/wham/rate-limit-reset-credits')) return reply(true, CREDITS_BODY);
    if (href.includes('/wham/usage')) return reply(overrides.usageOk !== false, USAGE_BODY);
    return reply(false, {});
  });
  return {
    impl: impl as unknown as Fetch,
    requests,
    calls: (part: string) => requests.filter((r) => r.url.includes(part)),
  };
}

async function withAccount(fetchImpl: Fetch, extra?: Record<string, unknown>) {
  const mock = mockBrowser([cookie(token())]);
  const service = new SwitchService(mock.browser, fetchImpl);
  await service.dispatch({ type: 'capture', name: '主号', tabId: 1 });
  if (extra) {
    const vault = mock.api.storage.local.data[VAULT_KEY] as { accounts: Record<string, unknown>[] };
    vault.accounts.push({
      id: 'second',
      name: '备用号',
      token: token('b'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...extra,
    });
  }
  return { mock, service };
}

describe('Quota refresh', () => {
  it('stores quota for the signed-in account without exposing the bearer token', async () => {
    const net = mockFetch();
    const { mock, service } = await withAccount(net.impl);
    const result = await service.dispatch({ type: 'usage', details: false, tabId: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const account = result.state.accounts[0]!;
    expect(account.usage?.session?.usedPercent).toBe(37);
    expect(account.usage?.weekly?.usedPercent).toBe(62);
    expect(account.usage?.resetCredits).toBe(2);
    expect(account.canRefreshUsage).toBe(true);
    // The popup must never receive a credential it could forward.
    expect(JSON.stringify(result)).not.toContain('accessToken');
    expect(JSON.stringify(result)).not.toContain(token());
    expect(JSON.stringify(mock.api.storage.local.data)).toContain('accessToken');
  });

  it('replaces the old capture placeholder with the ChatGPT profile name', async () => {
    const net = mockFetch();
    const { mock, service } = await withAccount(net.impl);
    const vault = mock.api.storage.local.data[VAULT_KEY] as { accounts: Record<string, unknown>[] };
    vault.accounts[0]!.name = '当前 ChatGPT 账号';
    vault.accounts[0]!.auth = undefined;

    const result = await service.dispatch({ type: 'usage', details: false, tabId: 1 });

    expect(result.ok && result.state.accounts[0]!.name).toBe('Live User');
    expect(result.ok && result.state.accounts[0]!.email).toBe('live@example.com');
  });

  it('sends bearer auth with no cookies and skips the details request', async () => {
    const net = mockFetch();
    const { service } = await withAccount(net.impl);
    await service.dispatch({ type: 'usage', details: false, tabId: 1 });

    const usage = net.calls('/wham/usage')[0]!;
    expect(usage.init.credentials).toBe('omit');
    expect((usage.init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
    expect((usage.init.headers as Record<string, string>)['ChatGPT-Account-Id']).toBe('acct_live');
    expect(net.calls('/api/auth/session')[0]!.init.credentials).toBe('include');
    expect(net.calls('/rate-limit-reset-credits')).toHaveLength(0);
  });

  it('fetches credit expiry only on a manual refresh', async () => {
    const net = mockFetch();
    const { service } = await withAccount(net.impl);
    const result = await service.dispatch({ type: 'usage', details: true, tabId: 1 });

    expect(net.calls('/rate-limit-reset-credits')).toHaveLength(1);
    if (!result.ok) return;
    const details = result.state.accounts[0]!.usage?.resetCreditDetails;
    expect(details?.map((credit) => credit.id)).toEqual(['a', 'b']);
    expect(details?.[1]?.expiresAt).toBeUndefined();
  });

  it('refreshes a stored account from its cached token without reading its cookie', async () => {
    const net = mockFetch();
    const { service } = await withAccount(net.impl, {
      auth: { accessToken: 'cached-token', accountId: 'acct_b', expiresAt: Date.now() + HOUR },
    });
    const result = await service.dispatch({ type: 'usage', details: false, tabId: 1 });

    if (!result.ok) return;
    expect(result.state.accounts.every((account) => account.usage?.session)).toBe(true);
    // One session read for the installed cookie; the other account needs no jar access.
    expect(net.calls('/api/auth/session')).toHaveLength(1);
    expect(net.calls('/wham/usage')).toHaveLength(2);
    expect(
      net
        .calls('/wham/usage')
        .map((call) => (call.init.headers as Record<string, string>).Authorization),
    ).toContain('Bearer cached-token');
  });

  it('skips an account whose cached token has expired', async () => {
    const net = mockFetch();
    const { service } = await withAccount(net.impl, {
      auth: { accessToken: 'stale-token', expiresAt: Date.now() - 1 },
    });
    const result = await service.dispatch({ type: 'usage', details: false, tabId: 1 });

    if (!result.ok) return;
    const stale = result.state.accounts.find((account) => account.id === 'second')!;
    expect(stale.usage).toBeUndefined();
    expect(stale.canRefreshUsage).toBe(false);
    expect(net.calls('/wham/usage')).toHaveLength(1);
  });

  it('never reads quota from a private window', async () => {
    const net = mockFetch();
    const mock = mockBrowser([cookie(token(), undefined, '1')]);
    mock.api.extension.inIncognitoContext = true;
    const service = new SwitchService(mock.browser, net.impl);
    const result = await service.dispatch({ type: 'usage', details: true, tabId: 2 });

    expect(result.ok).toBe(true);
    expect(net.requests).toHaveLength(0);
  });

  it('keeps the previous snapshot when a refresh fails', async () => {
    const good = mockFetch();
    const { mock, service } = await withAccount(good.impl);
    await service.dispatch({ type: 'usage', details: false, tabId: 1 });

    const failing = mockFetch({ usageOk: false });
    const retry = new SwitchService(mock.browser, failing.impl);
    const result = await retry.dispatch({ type: 'usage', details: false, tabId: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.accounts[0]!.usage?.session?.usedPercent).toBe(37);
  });

  it('reports when nothing could be refreshed', async () => {
    const net = mockFetch({ authToken: '' });
    const { service } = await withAccount(net.impl);
    const result = await service.dispatch({ type: 'usage', details: true, tabId: 1 });

    expect(result.ok && result.state.accounts[0]!.usage).toBeUndefined();
    expect(result.ok && result.message).toContain('没有可读取额度的账号');
  });

  it('rejects a malformed usage command', async () => {
    const net = mockFetch();
    const { service } = await withAccount(net.impl);
    const before = net.requests.length;
    const result = await service.dispatch({ type: 'usage', tabId: 1 });
    expect(result.ok).toBe(false);
    expect(net.requests).toHaveLength(before);
  });
});
