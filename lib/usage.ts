import type { AccountAuth, ResetCredit, UsageSnapshot, UsageWindow } from './types';

export const AUTH_SESSION_URL = 'https://chatgpt.com/api/auth/session';
export const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
export const RESET_CREDITS_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits';

// Codex reports both quota windows in one payload and the order is not contractual,
// so the role is decided by the window's own duration.
const SESSION_WINDOW_MINUTES = 300;
const WEEKLY_WINDOW_MINUTES = 10080;
export const USAGE_TTL = 5 * 60 * 1000;
const FALLBACK_AUTH_TTL = 60 * 60 * 1000;

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Mirrors the upstream clamp: NaN collapses to 0 and the API may report past 100. */
function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Reads the claims of an access token. A non-JWT token is still usable, just opaque. */
function decodeJwtClaims(token: string): RecordValue | undefined {
  const payload = token.split('.')[1];
  if (!payload) return;
  try {
    const padded = payload.replaceAll('-', '+').replaceAll('_', '/');
    const data: unknown = JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
    return object(data) ? data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `ChatGPT-Account-Id` selects a workspace and is not the user id. It lives in the
 * token's OpenAI auth claim; when it is absent the header must be omitted entirely,
 * because a wrong value is rejected where no value is accepted.
 */
function accountIdFrom(claims?: RecordValue): string | undefined {
  const auth = claims && claims['https://api.openai.com/auth'];
  if (!object(auth)) return undefined;
  const id = auth.chatgpt_account_id;
  return typeof id === 'string' && id ? id : undefined;
}

/** Reads `/api/auth/session`, the only place a bearer token is available to the browser. */
export function parseAuthSession(data: unknown): AccountAuth | undefined {
  if (!object(data)) return;
  const accessToken = data.accessToken;
  if (typeof accessToken !== 'string' || !accessToken) return;
  const sessionExpiry = typeof data.expires === 'string' ? Date.parse(data.expires) : NaN;
  const claims = decodeJwtClaims(accessToken);
  const exp = claims ? finite(claims.exp) : undefined;
  const user = object(data.user) ? data.user : undefined;
  const profileText = (value: unknown, limit: number) => {
    if (typeof value !== 'string') return undefined;
    const text = value.trim();
    return text ? text.slice(0, limit) : undefined;
  };
  return {
    accessToken,
    accountId: accountIdFrom(claims),
    name: profileText(user?.name, 60),
    email: profileText(user?.email, 160),
    expiresAt:
      exp !== undefined
        ? exp * 1000
        : Number.isFinite(sessionExpiry)
          ? sessionExpiry
          : Date.now() + FALLBACK_AUTH_TTL,
  };
}

export const isAuthUsable = (auth?: AccountAuth): auth is AccountAuth =>
  !!auth && auth.expiresAt > Date.now();

function parseWindow(value: unknown): UsageWindow | undefined {
  if (!object(value)) return;
  const usedPercent = finite(value.used_percent);
  if (usedPercent === undefined) return;
  const seconds = finite(value.limit_window_seconds);
  const resetAt = finite(value.reset_at);
  return {
    usedPercent: clampPercent(usedPercent),
    windowMinutes: seconds === undefined ? undefined : Math.round(seconds / 60),
    // The API reports unix seconds here, unlike the RFC 3339 strings used for credits.
    resetsAt: resetAt === undefined ? undefined : resetAt * 1000,
  };
}

function assignWindows(
  primary?: UsageWindow,
  secondary?: UsageWindow,
): { session?: UsageWindow; weekly?: UsageWindow } {
  const role = (window?: UsageWindow) =>
    window?.windowMinutes === SESSION_WINDOW_MINUTES
      ? 'session'
      : window?.windowMinutes === WEEKLY_WINDOW_MINUTES
        ? 'weekly'
        : 'unknown';
  const [first, second] = [role(primary), role(secondary)];
  // Only swap on positive evidence; an unknown duration keeps its declared position.
  if (first === 'weekly' && second !== 'weekly') return { session: secondary, weekly: primary };
  if (second === 'session' && first !== 'session') return { session: secondary, weekly: primary };
  // A lone window with no duration hint is read as the session window, as upstream does.
  if (!primary && secondary && second === 'unknown') return { session: secondary };
  return { session: primary, weekly: secondary };
}

/** Parses `/wham/usage`. Returns undefined only when the payload is unusable. */
export function parseUsage(data: unknown): Omit<UsageSnapshot, 'fetchedAt'> | undefined {
  if (!object(data) || !object(data.rate_limit)) return;
  const { session, weekly } = assignWindows(
    parseWindow(data.rate_limit.primary_window),
    parseWindow(data.rate_limit.secondary_window),
  );
  const credits = object(data.rate_limit_reset_credits) ? data.rate_limit_reset_credits : undefined;
  const available = credits && finite(credits.available_count);
  return { session, weekly, resetCredits: available === undefined ? undefined : available };
}

function creditExpiry(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const seconds = finite(value);
  return seconds === undefined ? undefined : seconds * 1000;
}

/**
 * Parses `/wham/rate-limit-reset-credits`. The response also carries spent credits,
 * so anything but `available` is dropped before counting.
 */
export function parseResetCredits(data: unknown): {
  availableCount?: number;
  credits: ResetCredit[];
} {
  const source = object(data) ? data : {};
  const credits = (Array.isArray(source.credits) ? source.credits : [])
    .flatMap((entry: unknown) => {
      if (!object(entry) || typeof entry.id !== 'string') return [];
      if (typeof entry.status !== 'string' || entry.status.toLowerCase() !== 'available') return [];
      return [{ id: entry.id, expiresAt: creditExpiry(entry.expires_at) }];
    })
    .sort((left, right) => {
      if (left.expiresAt === undefined) return right.expiresAt === undefined ? 0 : 1;
      if (right.expiresAt === undefined) return -1;
      return left.expiresAt - right.expiresAt;
    });
  const availableCount = finite(source.available_count);
  return { availableCount: availableCount === undefined ? undefined : availableCount, credits };
}

/**
 * Merges both endpoints. The count is authoritative over the list length, matching
 * upstream precedence: details count, then the usage payload, then the list itself.
 */
export function mergeUsage(
  usage: Omit<UsageSnapshot, 'fetchedAt'>,
  details: { availableCount?: number; credits: ResetCredit[] } | undefined,
  now = Date.now(),
): UsageSnapshot {
  if (!details) return { ...usage, fetchedAt: now };
  const resetCredits = details.availableCount ?? usage.resetCredits ?? details.credits.length;
  return {
    ...usage,
    resetCredits,
    resetCreditDetails: details.credits.slice(0, Math.max(0, Math.trunc(resetCredits))),
    fetchedAt: now,
  };
}

/** The window that will run out first is the one worth showing in a one-line meter. */
export function bindingWindow(
  usage?: UsageSnapshot,
): { label: string; window: UsageWindow } | undefined {
  const candidates = [
    usage?.session && { label: '5h', window: usage.session },
    usage?.weekly && { label: '周', window: usage.weekly },
  ].filter((entry): entry is { label: string; window: UsageWindow } => !!entry);
  return candidates.sort((left, right) => right.window.usedPercent - left.window.usedPercent)[0];
}

export type UsageBand = 'low' | 'mid' | 'high';
export const usageBand = (usedPercent: number): UsageBand =>
  usedPercent > 80 ? 'high' : usedPercent >= 50 ? 'mid' : 'low';

function relative(target: number, now: number): string {
  const minutes = Math.round((target - now) / 60000);
  if (minutes <= 0) return '即将';
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时后`;
  return `${Math.round(hours / 24)} 天后`;
}

export const resetLabel = (resetsAt?: number, now = Date.now()): string | undefined =>
  resetsAt === undefined ? undefined : `${relative(resetsAt, now)}重置`;

export const expiryLabel = (expiresAt?: number, now = Date.now()): string =>
  expiresAt === undefined ? '无到期时间' : `${relative(expiresAt, now)}过期`;

export function ageLabel(fetchedAt: number, now = Date.now()): string {
  const minutes = Math.floor((now - fetchedAt) / 60000);
  if (minutes < 1) return '刚刚更新';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} 小时前` : `${Math.floor(hours / 24)} 天前`;
}

export const isStale = (usage?: UsageSnapshot, now = Date.now()): boolean =>
  !usage || now - usage.fetchedAt > USAGE_TTL;

/** Multi-line text for the account row's native tooltip. */
export function usageTooltip(usage: UsageSnapshot, now = Date.now()): string {
  const line = (label: string, window?: UsageWindow) =>
    window
      ? `${label}\t${Math.round(window.usedPercent)}%\t${resetLabel(window.resetsAt, now) ?? ''}`.trimEnd()
      : undefined;
  const lines = [line('5h', usage.session), line('周', usage.weekly)].filter(Boolean) as string[];
  if (usage.resetCredits !== undefined) {
    lines.push(`重置额度  ${usage.resetCredits} 个可用`);
    for (const credit of usage.resetCreditDetails ?? []) {
      lines.push(`  · ${expiryLabel(credit.expiresAt, now)}`);
    }
  }
  lines.push(`更新于 ${ageLabel(usage.fetchedAt, now)}`);
  return lines.join('\n');
}
