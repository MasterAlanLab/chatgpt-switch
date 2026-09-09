import { vi } from 'vitest';
import type { Browser, WxtBrowser } from 'wxt/browser';
import { SESSION_COOKIE } from '../lib/session';

export function cookie(
  value: string,
  name = SESSION_COOKIE,
  storeId = '0',
): Browser.cookies.Cookie {
  return {
    domain: 'chatgpt.com',
    hostOnly: true,
    httpOnly: true,
    path: '/',
    secure: true,
    session: true,
    sameSite: 'lax',
    storeId,
    name,
    value,
  };
}

function storageArea() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: vi.fn(async (key: string) => structuredClone({ [key]: data[key] })),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(data, structuredClone(values));
    }),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
  };
}

export function mockBrowser(initial: Browser.cookies.Cookie[] = []) {
  let jar = structuredClone(initial);
  const api = {
    extension: { inIncognitoContext: false },
    cookies: {
      getAllCookieStores: vi.fn(async () => [
        { id: '0', tabIds: [1] },
        { id: '1', tabIds: [2] },
      ]),
      getAll: vi.fn(async (query: { storeId?: string; domain?: string; url?: string }) =>
        jar.filter((item) => {
          const host = item.domain.replace(/^\./, '');
          if (query.storeId && item.storeId !== query.storeId) return false;
          if (query.domain && host !== query.domain && !host.endsWith('.' + query.domain))
            return false;
          if (query.url) {
            const url = new URL(query.url);
            if (url.hostname !== host && (item.hostOnly || !url.hostname.endsWith('.' + host)))
              return false;
            if (!url.pathname.startsWith(item.path)) return false;
          }
          return true;
        }),
      ),
      remove: vi.fn(async (details: { name: string; url: string; storeId: string }) => {
        const url = new URL(details.url);
        const index = jar.findIndex(
          (item) =>
            item.name === details.name &&
            item.storeId === details.storeId &&
            url.hostname === item.domain.replace(/^\./, '') &&
            url.pathname === item.path,
        );
        if (index >= 0) jar.splice(index, 1);
        return index >= 0 ? details : undefined;
      }),
      set: vi.fn(async (details: Browser.cookies.SetDetails) => {
        const result = {
          ...cookie(details.value ?? '', details.name, details.storeId),
          ...details,
          domain: details.domain ?? new URL(details.url).hostname,
          hostOnly: !details.domain,
        };
        jar = jar.filter(
          (item) =>
            !(
              item.name === result.name &&
              item.storeId === result.storeId &&
              item.path === result.path &&
              item.domain === result.domain
            ),
        );
        jar.push(result);
        return result;
      }),
    },
    tabs: {
      query: vi.fn(async () => [
        { id: 1, windowId: 10, url: 'https://example.com/', incognito: false },
      ]),
      get: vi.fn(async (id: number) => ({
        id,
        windowId: id === 2 ? 20 : 10,
        incognito: id === 2,
        url: 'https://chatgpt.com/c/old-conversation',
      })),
      update: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
      reload: vi.fn(async () => {}),
    },
    storage: { local: storageArea(), session: storageArea() },
    browsingData: { remove: vi.fn(async () => {}) },
  };
  return { api, browser: api as unknown as WxtBrowser, jar: () => jar };
}
