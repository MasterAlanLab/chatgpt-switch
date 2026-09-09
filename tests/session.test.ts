import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  isSessionCookie,
  joinSessionCookies,
  parseSessionInput,
  SESSION_COOKIE,
  splitSessionToken,
} from '../lib/session';
import { isChatGPTHost, isChatGPTUrl } from '../lib/domains';
import { publicError, UserError } from '../lib/errors';
import { validateCommand } from '../lib/commands';

const token = 'synthetic-session-'.repeat(10);

describe('Session parsing', () => {
  it('accepts an opaque token, quoted token, and JWE', () => {
    for (const input of [
      token,
      JSON.stringify(token),
      'eyJhbGciOiJkaXIifQ..synthetic-iv.synthetic-payload.synthetic-tag',
    ])
      expect(parseSessionInput(input).token).toBeTruthy();
  });
  it('extracts explicit session metadata without selecting the accessToken', () => {
    expect(
      parseSessionInput(
        JSON.stringify({
          sessionToken: token,
          accessToken: 'ignored',
          user: { name: '工作', email: 'demo@example.com' },
          expires: '2099-01-01',
        }),
      ),
    ).toEqual({
      token,
      name: '工作',
      email: 'demo@example.com',
      expiresAt: Date.parse('2099-01-01'),
    });
  });
  it.each([
    { [SESSION_COOKIE]: token },
    { [SESSION_COOKIE]: [{ value: token }] },
    { cookies: { [SESSION_COOKIE]: token } },
    [{ name: SESSION_COOKIE, value: token }],
    { cookies: [{ name: SESSION_COOKIE, value: token }] },
    { name: SESSION_COOKIE, value: token },
  ])('accepts cookie JSON: %j', (data) =>
    expect(parseSessionInput(JSON.stringify(data)).token).toBe(token),
  );
  it('accepts Cookie header strings', () =>
    expect(parseSessionInput(`Cookie: foo=bar; ${SESSION_COOKIE}=${token}; theme=dark`).token).toBe(
      token,
    ));
  it('joins many chunks in numeric order', () => {
    const long = 'x'.repeat(CHUNK_SIZE * 12 + 5);
    const parts = splitSessionToken(long).reverse();
    expect(parseSessionInput(JSON.stringify(parts)).token).toBe(long);
    expect(
      parseSessionInput(parts.map((part) => `${part.name}=${part.value}`).join('; ')).token,
    ).toBe(long);
  });
  it('accepts no more than the exact base name and numeric suffixes', () => {
    expect(isSessionCookie(SESSION_COOKIE + '.19')).toBe(true);
    expect(isSessionCookie(SESSION_COOKIE + '.backup')).toBe(false);
    expect(isSessionCookie(SESSION_COOKIE.replace('.', 'X'))).toBe(false);
  });
  it('rejects missing, conflicting and mixed chunks', () => {
    expect(() => joinSessionCookies([{ name: SESSION_COOKIE + '.1', value: token }])).toThrow(
      '分片不完整',
    );
    expect(() =>
      joinSessionCookies([
        { name: SESSION_COOKIE, value: token },
        { name: SESSION_COOKIE, value: token + 'x' },
      ]),
    ).toThrow('多组');
    expect(() =>
      joinSessionCookies([
        { name: SESSION_COOKIE, value: token },
        { name: SESSION_COOKIE + '.0', value: token },
      ]),
    ).toThrow('分片');
  });
  it('accepts the accessToken field returned by /api/auth/session', () => {
    const accessToken = 'eyJhbGciOiJIUzI1NiJ9.synthetic-payload.synthetic-signature';
    expect(parseSessionInput(JSON.stringify({ accessToken })).token).toBe(accessToken);
  });
  it.each([
    '',
    '{broken',
    'short',
    '<script>alert(1)</script>',
    'x'.repeat(70000),
    JSON.stringify({ unrelated: token }),
    'sk-' + 'x'.repeat(40),
  ])('rejects invalid or wrong credential input (%#)', (input) =>
    expect(() => parseSessionInput(input)).toThrow(UserError),
  );
  it('splits at the exact cookie boundary', () => {
    expect(splitSessionToken('x'.repeat(CHUNK_SIZE))).toHaveLength(1);
    const parts = splitSessionToken('x'.repeat(CHUNK_SIZE + 1));
    expect(parts.map((part) => part.name)).toEqual([SESSION_COOKIE + '.0', SESSION_COOKIE + '.1']);
    expect(parts[1]?.value).toBe('x');
  });
});

describe('Boundaries', () => {
  it('matches actual ChatGPT hosts only', () => {
    for (const host of ['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com'])
      expect(isChatGPTHost(host)).toBe(true);
    for (const host of [
      'fakechatgpt.com',
      'chatgpt.com.evil.test',
      'platform.openai.com',
      'openai.com',
    ])
      expect(isChatGPTHost(host)).toBe(false);
    expect(isChatGPTUrl('http://chatgpt.com/')).toBe(false);
    expect(isChatGPTUrl('https://chatgpt.com@evil.test/')).toBe(false);
  });
  it('redacts underlying browser failures', () =>
    expect(publicError(new Error(token))).not.toContain(token));
  it('validates the message boundary', () => {
    expect(validateCommand({ type: 'state' })).toEqual({ type: 'state' });
    for (const command of [
      { type: 'unknown', tabId: 1 },
      { type: 'switch', id: 'x' },
      { type: 'login', tabId: 1, input: token, name: '', remember: 'true' },
      { type: 'settings', tabId: 1, settings: {} },
    ])
      expect(() => validateCommand(command)).toThrow();
  });
});
