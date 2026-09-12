import type { AccountAuth, UsageSnapshot } from './types';
import {
  AUTH_SESSION_URL,
  RESET_CREDITS_URL,
  USAGE_URL,
  mergeUsage,
  parseAuthSession,
  parseResetCredits,
  parseUsage,
} from './usage';

const AUTH_TIMEOUT = 8000;
const USAGE_TIMEOUT = 15000;
// Credit details only add expiry dates, so they are dropped rather than waited on.
const DETAILS_TIMEOUT = 5000;

export type Fetch = typeof fetch;

/**
 * Usage is decoration around account switching, so every failure here is silent:
 * a missing snapshot renders as "额度未知" instead of blocking the popup.
 */
async function json(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
  timeout: number,
): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  try {
    const response = await fetchImpl(url, { ...init, signal: abort.signal, cache: 'no-store' });
    if (!response.ok) return undefined;
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Reads the bearer token the ChatGPT web app uses. Requires the account's cookie. */
export async function readAuth(fetchImpl: Fetch): Promise<AccountAuth | undefined> {
  return parseAuthSession(
    await json(fetchImpl, AUTH_SESSION_URL, { credentials: 'include' }, AUTH_TIMEOUT),
  );
}

/**
 * Reads quota for one account. Bearer-only and `credentials: 'omit'`, so this works
 * for any account with a live token without touching the browser's cookie jar.
 */
export async function readUsage(
  fetchImpl: Fetch,
  auth: AccountAuth,
  details: boolean,
): Promise<UsageSnapshot | undefined> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${auth.accessToken}`,
  };
  if (auth.accountId) headers['ChatGPT-Account-Id'] = auth.accountId;
  const init: RequestInit = { credentials: 'omit', headers };
  const usage = parseUsage(await json(fetchImpl, USAGE_URL, init, USAGE_TIMEOUT));
  if (!usage) return undefined;
  if (!details) return mergeUsage(usage, undefined);
  const raw = await json(fetchImpl, RESET_CREDITS_URL, init, DETAILS_TIMEOUT);
  return mergeUsage(usage, raw === undefined ? undefined : parseResetCredits(raw));
}
