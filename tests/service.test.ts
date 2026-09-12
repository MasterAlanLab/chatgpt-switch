import { describe, expect, it } from 'vitest';
import { SwitchService } from '../lib/service';
import type { Fetch } from '../lib/usage-client';
import { cookie, mockBrowser } from './mock-browser';

const token = 'synthetic-session-'.repeat(8);
const profileFetch = (async () => ({
  ok: true,
  json: async () => ({
    accessToken: 'synthetic-access-token',
    expires: new Date(Date.now() + 3600000).toISOString(),
    user: { name: '真实账号名', email: 'user@example.com' },
  }),
})) as unknown as Fetch;

describe('Account service', () => {
  it('saves, deduplicates, renames, and deletes without exposing credentials', async () => {
    const mock = mockBrowser();
    const service = new SwitchService(mock.browser);
    const saved = await service.dispatch({ type: 'save', input: token, name: '个人', tabId: 1 });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const id = saved.state.accounts[0]!.id;
    expect(JSON.stringify(saved)).not.toContain(token);
    const duplicate = await service.dispatch({
      type: 'save',
      input: token,
      name: '工作',
      tabId: 1,
    });
    expect(duplicate.ok && duplicate.state.accounts.length).toBe(1);
    const renamed = await service.dispatch({ type: 'rename', id, name: '新备注', tabId: 1 });
    expect(renamed.ok && renamed.state.accounts[0]?.name).toBe('新备注');
    const deleted = await service.dispatch({ type: 'delete', id, tabId: 1 });
    expect(deleted.ok && deleted.state.accounts).toEqual([]);
    expect(mock.api.cookies.set).not.toHaveBeenCalled();
  });
  it('runs one-off login without persisting the token', async () => {
    const mock = mockBrowser();
    const result = await new SwitchService(mock.browser).dispatch({
      type: 'login',
      input: token,
      name: '',
      remember: false,
      tabId: 1,
    });
    expect(result.ok && result.state.hasSession).toBe(true);
    expect(JSON.stringify(mock.api.storage.local.data)).not.toContain(token);
    expect(JSON.stringify(mock.api.storage.session.data)).not.toContain(token);
    expect(mock.api.tabs.update).toHaveBeenCalledWith(1, {
      url: 'https://chatgpt.com/',
      active: true,
    });
  });
  it('serializes simultaneous account writes', async () => {
    const mock = mockBrowser();
    const service = new SwitchService(mock.browser);
    await Promise.all(
      ['a', 'b', 'c'].map((suffix) =>
        service.dispatch({ type: 'save', input: token + suffix, name: suffix, tabId: 1 }),
      ),
    );
    const result = await service.dispatch({ type: 'state' });
    expect(result.ok && result.state.accounts.length).toBe(3);
  });
  it('captures a session only after a capture command', async () => {
    const mock = mockBrowser([cookie(token)]);
    const service = new SwitchService(mock.browser, profileFetch);
    await service.dispatch({ type: 'state' });
    expect(mock.api.storage.local.set).not.toHaveBeenCalled();
    const result = await service.dispatch({ type: 'capture', name: '', tabId: 1 });
    expect(result.ok && result.state.activeAccountId).toBeTruthy();
    expect(result.ok && result.state.accounts[0]?.name).toBe('真实账号名');
    expect(result.ok && result.state.accounts[0]?.email).toBe('user@example.com');
  });
  it('keeps private accounts out of persistent storage and skips browsingData cleanup', async () => {
    const mock = mockBrowser([cookie(token, undefined, '1')]);
    mock.api.extension.inIncognitoContext = true;
    const service = new SwitchService(mock.browser);
    await service.dispatch({
      type: 'settings',
      settings: { clearSiteData: true, openAfterSwitch: false },
      tabId: 2,
    });
    const result = await service.dispatch({
      type: 'login',
      input: token,
      name: '临时',
      remember: true,
      tabId: 2,
    });
    expect(result.ok && result.state.context.incognito).toBe(true);
    expect(mock.api.storage.local.set).not.toHaveBeenCalled();
    expect(mock.api.browsingData.remove).not.toHaveBeenCalled();
    expect(JSON.stringify(mock.api.storage.session.data)).toContain(token);
  });
  it('never falls back to a default store or crosses environments', async () => {
    const mock = mockBrowser();
    const service = new SwitchService(mock.browser);
    expect(
      (await service.dispatch({ type: 'login', input: token, name: '', remember: false, tabId: 2 }))
        .ok,
    ).toBe(false);
    mock.api.cookies.getAllCookieStores.mockResolvedValue([]);
    expect(
      (await service.dispatch({ type: 'login', input: token, name: '', remember: false, tabId: 1 }))
        .ok,
    ).toBe(false);
    expect(mock.api.cookies.set).not.toHaveBeenCalled();
  });
  it('cleans only explicit ChatGPT origins when enabled in a normal window', async () => {
    const mock = mockBrowser();
    const service = new SwitchService(mock.browser);
    await service.dispatch({
      type: 'settings',
      settings: { clearSiteData: true, openAfterSwitch: false },
      tabId: 1,
    });
    await service.dispatch({ type: 'login', input: token, name: '', remember: false, tabId: 1 });
    expect(mock.api.browsingData.remove).toHaveBeenCalledWith(
      { origins: ['https://chatgpt.com', 'https://www.chatgpt.com', 'https://chat.openai.com'] },
      expect.not.objectContaining({ cookies: true }),
    );
    expect(mock.api.tabs.update).not.toHaveBeenCalled();
  });
  it('continues processing after an error without exposing secrets', async () => {
    const mock = mockBrowser();
    const service = new SwitchService(mock.browser);
    mock.api.cookies.set.mockRejectedValueOnce(new Error(token));
    const failed = await service.dispatch({
      type: 'login',
      input: token,
      name: '',
      remember: false,
      tabId: 1,
    });
    expect(failed.ok).toBe(false);
    expect(JSON.stringify(failed)).not.toContain(token);
    const next = await service.dispatch({ type: 'save', input: token, name: '继续', tabId: 1 });
    expect(next.ok).toBe(true);
    expect(JSON.stringify(next)).not.toContain(token);
  });
});
