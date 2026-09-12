import { describe, expect, it } from 'vitest';
import {
  ageLabel,
  bindingWindow,
  expiryLabel,
  isAuthUsable,
  mergeUsage,
  parseAuthSession,
  parseResetCredits,
  parseUsage,
  resetLabel,
  usageBand,
  usageTooltip,
} from '../lib/usage';

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0);
const seconds = (ms: number) => Math.floor(ms / 1000);
const window = (usedPercent: number, windowSeconds?: number, resetAt?: number) => ({
  used_percent: usedPercent,
  limit_window_seconds: windowSeconds,
  reset_at: resetAt,
});
const usage = (primary?: unknown, secondary?: unknown, credits?: unknown) => ({
  rate_limit: { primary_window: primary, secondary_window: secondary },
  rate_limit_reset_credits: credits,
});

const jwt = (payload: Record<string, unknown>) =>
  ['header', btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_'), 'sig'].join(
    '.',
  );

describe('Usage payload parsing', () => {
  it('labels windows by duration rather than position', () => {
    const straight = parseUsage(usage(window(20, 18000), window(60, 604800)));
    expect(straight?.session?.usedPercent).toBe(20);
    expect(straight?.weekly?.usedPercent).toBe(60);
    // Same data, windows reported in the opposite order.
    const swapped = parseUsage(usage(window(60, 604800), window(20, 18000)));
    expect(swapped?.session?.usedPercent).toBe(20);
    expect(swapped?.weekly?.usedPercent).toBe(60);
  });
  it('swaps on a known secondary even when the primary duration is missing', () => {
    const parsed = parseUsage(usage(window(60), window(20, 18000)));
    expect(parsed?.session?.usedPercent).toBe(20);
    expect(parsed?.weekly?.usedPercent).toBe(60);
  });
  it('keeps declared positions when neither duration is known', () => {
    const parsed = parseUsage(usage(window(20), window(60)));
    expect(parsed?.session?.usedPercent).toBe(20);
    expect(parsed?.weekly?.usedPercent).toBe(60);
  });
  it('reads a lone undated window as the session window', () => {
    expect(parseUsage(usage(undefined, window(20)))?.session?.usedPercent).toBe(20);
    expect(parseUsage(usage(undefined, window(20)))?.weekly).toBeUndefined();
    expect(parseUsage(usage(undefined, window(20, 604800)))?.weekly?.usedPercent).toBe(20);
  });
  it('clamps percentages and converts reset seconds to milliseconds', () => {
    const parsed = parseUsage(usage(window(140, 18000, seconds(NOW)), window(-10, 604800)));
    expect(parsed?.session?.usedPercent).toBe(100);
    expect(parsed?.session?.resetsAt).toBe(NOW);
    expect(parsed?.session?.windowMinutes).toBe(300);
    expect(parsed?.weekly?.usedPercent).toBe(0);
  });
  it('separates an unusable payload from an account that never used Codex', () => {
    expect(parseUsage({})).toBeUndefined();
    expect(parseUsage(null)).toBeUndefined();
    const empty = parseUsage(usage(null, null));
    expect(empty).toEqual({ session: undefined, weekly: undefined, resetCredits: undefined });
  });
  it('reads the reset credit count from the usage payload alone', () => {
    expect(parseUsage(usage(window(20, 18000), null, { available_count: 2 }))?.resetCredits).toBe(
      2,
    );
  });
});

describe('Reset credit details', () => {
  const expiry = (days: number) => new Date(NOW + days * 86400000).toISOString();
  it('drops spent credits and sorts by expiry with undated ones last', () => {
    const parsed = parseResetCredits({
      available_count: 3,
      credits: [
        { id: 'undated', status: 'available', expires_at: null },
        { id: 'late', status: 'available', expires_at: expiry(11) },
        { id: 'spent', status: 'redeemed', expires_at: expiry(1) },
        { id: 'soon', status: 'AVAILABLE', expires_at: expiry(3) },
      ],
    });
    expect(parsed.credits.map((credit) => credit.id)).toEqual(['soon', 'late', 'undated']);
    expect(parsed.availableCount).toBe(3);
  });
  it('accepts unix seconds as well as RFC 3339 strings', () => {
    const parsed = parseResetCredits({
      credits: [{ id: 'epoch', status: 'available', expires_at: seconds(NOW) }],
    });
    expect(parsed.credits[0]?.expiresAt).toBe(NOW);
  });
  it('survives a malformed payload', () => {
    expect(parseResetCredits(null)).toEqual({ availableCount: undefined, credits: [] });
    expect(parseResetCredits({ credits: [{ id: 5 }, null, 'x'] }).credits).toEqual([]);
  });
});

describe('Merging both endpoints', () => {
  const base = { session: { usedPercent: 20 }, resetCredits: 2 };
  it('prefers the detail count, then the usage count, then the list length', () => {
    const credits = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(mergeUsage(base, { availableCount: 3, credits }, NOW).resetCredits).toBe(3);
    expect(mergeUsage(base, { credits }, NOW).resetCredits).toBe(2);
    expect(mergeUsage({ session: base.session }, { credits }, NOW).resetCredits).toBe(3);
  });
  it('truncates the detail list to the authoritative count', () => {
    const merged = mergeUsage(base, { credits: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, NOW);
    expect(merged.resetCreditDetails?.map((credit) => credit.id)).toEqual(['a', 'b']);
  });
  it('keeps the usage-only snapshot untouched when details were skipped', () => {
    const merged = mergeUsage(base, undefined, NOW);
    expect(merged).toEqual({ ...base, fetchedAt: NOW });
    expect(merged.resetCreditDetails).toBeUndefined();
  });
});

describe('Access token extraction', () => {
  it('prefers the token expiry over the session expiry', () => {
    const auth = parseAuthSession({
      accessToken: jwt({ exp: seconds(NOW + 3600000) }),
      expires: new Date(NOW + 86400000).toISOString(),
      user: { id: 'user-1', name: ' Alice ', email: 'a@example.com' },
    });
    expect(auth?.expiresAt).toBe(NOW + 3600000);
    expect(auth?.name).toBe('Alice');
    expect(auth?.email).toBe('a@example.com');
  });
  it('takes the workspace id from the token claim, never from the user id', () => {
    const claimed = parseAuthSession({
      accessToken: jwt({
        exp: seconds(NOW + 3600000),
        'https://api.openai.com/auth': { chatgpt_account_id: 'acct_ws', user_id: 'user-1' },
      }),
    });
    expect(claimed?.accountId).toBe('acct_ws');
    // A wrong workspace header is rejected where an absent one is accepted.
    const unclaimed = parseAuthSession({
      accessToken: jwt({ exp: seconds(NOW + 3600000) }),
      user: { id: 'user-1' },
    });
    expect(unclaimed?.accountId).toBeUndefined();
  });
  it('falls back to the session expiry for an opaque token', () => {
    const auth = parseAuthSession({
      accessToken: 'opaque-token',
      expires: new Date(NOW + 86400000).toISOString(),
    });
    expect(auth?.expiresAt).toBe(NOW + 86400000);
  });
  it('rejects a logged-out session', () => {
    expect(parseAuthSession({})).toBeUndefined();
    expect(parseAuthSession({ accessToken: '' })).toBeUndefined();
  });
  it('treats an elapsed expiry as unusable', () => {
    expect(isAuthUsable({ accessToken: 'x', expiresAt: Date.now() + 60000 })).toBe(true);
    expect(isAuthUsable({ accessToken: 'x', expiresAt: Date.now() - 1 })).toBe(false);
    expect(isAuthUsable(undefined)).toBe(false);
  });
});

describe('Presentation helpers', () => {
  it('shows whichever window is closest to its cap', () => {
    const snapshot = {
      session: { usedPercent: 37 },
      weekly: { usedPercent: 62 },
      fetchedAt: NOW,
    };
    expect(bindingWindow(snapshot)?.label).toBe('周');
    expect(bindingWindow({ ...snapshot, session: { usedPercent: 90 } })?.label).toBe('5h');
    expect(bindingWindow({ weekly: { usedPercent: 5 }, fetchedAt: NOW })?.label).toBe('周');
    expect(bindingWindow({ fetchedAt: NOW })).toBeUndefined();
  });
  it('bands usage at the 50 and 80 boundaries', () => {
    expect(usageBand(49.9)).toBe('low');
    expect(usageBand(50)).toBe('mid');
    expect(usageBand(80)).toBe('mid');
    expect(usageBand(80.1)).toBe('high');
  });
  it('formats countdowns at the unit it can actually resolve', () => {
    expect(resetLabel(NOW + 45 * 60000, NOW)).toBe('45 分钟后重置');
    expect(resetLabel(NOW + 3 * 3600000, NOW)).toBe('3 小时后重置');
    expect(resetLabel(NOW + 4 * 86400000, NOW)).toBe('4 天后重置');
    expect(resetLabel(NOW - 1000, NOW)).toBe('即将重置');
    expect(resetLabel(undefined, NOW)).toBeUndefined();
    expect(expiryLabel(undefined, NOW)).toBe('无到期时间');
    expect(ageLabel(NOW - 30000, NOW)).toBe('刚刚更新');
    expect(ageLabel(NOW - 12 * 60000, NOW)).toBe('12 分钟前');
  });
  it('builds a tooltip that degrades when details are missing', () => {
    const full = usageTooltip(
      {
        session: { usedPercent: 37, resetsAt: NOW + 3 * 3600000 },
        weekly: { usedPercent: 62, resetsAt: NOW + 4 * 86400000 },
        resetCredits: 2,
        resetCreditDetails: [{ id: 'a', expiresAt: NOW + 3 * 86400000 }, { id: 'b' }],
        fetchedAt: NOW - 2 * 60000,
      },
      NOW,
    );
    expect(full.split('\n')).toEqual([
      '5h\t37%\t3 小时后重置',
      '周\t62%\t4 天后重置',
      '重置额度  2 个可用',
      '  · 3 天后过期',
      '  · 无到期时间',
      '更新于 2 分钟前',
    ]);
    const lean = usageTooltip(
      { session: { usedPercent: 37 }, resetCredits: 2, fetchedAt: NOW },
      NOW,
    );
    expect(lean.split('\n')).toEqual(['5h\t37%', '重置额度  2 个可用', '更新于 刚刚更新']);
  });
});
