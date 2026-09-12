import { describe, expect, it } from 'vitest';
import { SessionCookies } from '../lib/cookies';
import { CHUNK_SIZE, SESSION_COOKIE } from '../lib/session';
import { cookie, mockBrowser } from './mock-browser';

const oldToken = 'old-synthetic-session-'.repeat(5);
const token = 'new-synthetic-session-'.repeat(5);

describe('Cookie replacement', () => {
  it('prefers the active host-only session when a stale domain-scoped session remains', async () => {
    const current = 'current-host-session-'.repeat(6);
    const stale = 'stale-domain-session-'.repeat(6);
    const mock = mockBrowser([
      { ...cookie(current, SESSION_COOKIE + '.0'), domain: 'chatgpt.com', hostOnly: true },
      { ...cookie(current, SESSION_COOKIE + '.1'), domain: 'chatgpt.com', hostOnly: true },
      { ...cookie(stale, SESSION_COOKIE + '.0'), domain: '.chatgpt.com', hostOnly: false },
      { ...cookie(stale, SESSION_COOKIE + '.1'), domain: '.chatgpt.com', hostOnly: false },
    ]);

    const session = await new SessionCookies(mock.browser).current('0');

    expect(session.token).toBe(current + current);
  });
  it('awaits removal of all old chunks, including high suffixes, before writing', async () => {
    const mock = mockBrowser([
      cookie(oldToken, SESSION_COOKIE + '.0'),
      cookie(oldToken, SESSION_COOKIE + '.18'),
      cookie('challenge', 'cf_clearance'),
      cookie(oldToken, SESSION_COOKIE, '1'),
    ]);
    await new SessionCookies(mock.browser).replace(token, '0');
    expect(
      mock.jar().find((item) => item.name === SESSION_COOKIE && item.storeId === '0')?.value,
    ).toBe(token);
    expect(mock.jar().some((item) => item.name.endsWith('.18'))).toBe(false);
    expect(mock.jar().find((item) => item.name === 'cf_clearance')?.value).toBe('challenge');
    expect(mock.jar().find((item) => item.storeId === '1')?.value).toBe(oldToken);
    expect(Math.max(...mock.api.cookies.remove.mock.invocationCallOrder)).toBeLessThan(
      mock.api.cookies.set.mock.invocationCallOrder[0]!,
    );
  });
  it('writes secure HttpOnly session cookies and verifies them', async () => {
    const mock = mockBrowser();
    await new SessionCookies(mock.browser).replace('x'.repeat(CHUNK_SIZE + 100), '0');
    expect(mock.jar()).toHaveLength(2);
    for (const item of mock.jar())
      expect(item).toMatchObject({
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        storeId: '0',
      });
    expect(mock.jar()[0]).not.toHaveProperty('expirationDate');
  });
  it('restores old cookies after a partial write failure', async () => {
    const mock = mockBrowser([cookie(oldToken)]);
    const write = mock.api.cookies.set.getMockImplementation()!;
    mock.api.cookies.set.mockImplementation(async (details) => {
      if (details.name === SESSION_COOKIE + '.1') throw new Error('Synthetic write failure');
      return write(details);
    });
    await expect(
      new SessionCookies(mock.browser).replace('x'.repeat(CHUNK_SIZE + 1), '0'),
    ).rejects.toThrow('已恢复');
    expect(mock.jar()).toEqual([
      expect.objectContaining({ name: SESSION_COOKIE, value: oldToken }),
    ]);
  });
  it('treats an empty set response as failure', async () => {
    const mock = mockBrowser([cookie(oldToken)]);
    mock.api.cookies.set.mockResolvedValueOnce(undefined as never);
    await expect(new SessionCookies(mock.browser).replace(token, '0')).rejects.toThrow('已恢复');
    expect(mock.jar()[0]?.value).toBe(oldToken);
  });
  it('clears expired sessions only after validating new input', async () => {
    const mock = mockBrowser([cookie(oldToken)]);
    await expect(new SessionCookies(mock.browser).replace(token, '0', 1)).rejects.toThrow('有效期');
    expect(mock.api.cookies.remove).not.toHaveBeenCalled();
  });
  it('uses each cookie path rather than always removing at the root', async () => {
    const mock = mockBrowser([{ ...cookie(oldToken), path: '/legacy' }]);
    await new SessionCookies(mock.browser).clear('0');
    expect(mock.api.cookies.remove).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://chatgpt.com/legacy' }),
    );
  });
});
