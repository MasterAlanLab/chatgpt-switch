import { UserError } from './errors';

export const SESSION_COOKIE = '__Secure-next-auth.session-token';
export const CHUNK_SIZE = 3800;
export const MAX_TOKEN_LENGTH = 64 * 1024;
export const MAX_INPUT_LENGTH = 256 * 1024;

export interface SessionInput {
  token: string;
  email?: string;
  name?: string;
  expiresAt?: number;
}

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isSessionCookie(name: string): boolean {
  return (
    name === SESSION_COOKIE ||
    new RegExp(`^${SESSION_COOKIE.replaceAll('.', '\\.')}\\.\\d+$`).test(name)
  );
}

export function validateToken(value: unknown): string {
  if (typeof value !== 'string') throw new UserError('Session Token 应为文本。');
  const token = value.trim();
  if (
    token.length < 32 ||
    token.length > MAX_TOKEN_LENGTH ||
    !/^[A-Za-z0-9._~+\/=\-]+$/.test(token)
  ) {
    throw new UserError('Session 格式有误：请粘贴完整的登录 Cookie 值，或包含它的 JSON。');
  }
  // A JWT is the Session value returned by /api/auth/session. API keys are not.
  if (token.startsWith('sk-')) {
    throw new UserError('这是 API Key，请使用 /api/auth/session 页面返回的 Session。');
  }
  return token;
}

function cookieValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length === 1) return cookieValue(value[0]);
  if (object(value) && typeof value.value === 'string') return value.value;
}

export function joinSessionCookies(cookies: { name: string; value: string }[]): string | undefined {
  const parts = cookies.filter((c) => isSessionCookie(c.name));
  if (!parts.length) return;
  const unique = new Map<string, string>();
  for (const part of parts) {
    if (unique.has(part.name) && unique.get(part.name) !== part.value) {
      throw new UserError('存在多组不同的 Session，请仅保留一个账号的 Cookie。');
    }
    unique.set(part.name, part.value);
  }
  const base = unique.get(SESSION_COOKIE);
  if (base !== undefined) {
    if (unique.size > 1)
      throw new UserError('存在完整 Cookie 和分片 Cookie，请仅保留当前使用的一组。');
    return validateToken(base);
  }
  const chunks = [...unique]
    .map(([name, value]) => ({ index: Number(name.slice(SESSION_COOKIE.length + 1)), value }))
    .sort((a, b) => a.index - b.index);
  if (chunks.some((chunk, index) => chunk.index !== index)) {
    throw new UserError('Session Cookie 分片不完整，请从 .0 开始复制全部连续分片。');
  }
  return validateToken(chunks.map((chunk) => chunk.value).join(''));
}

function readCookies(data: unknown): string | undefined {
  if (Array.isArray(data)) {
    return joinSessionCookies(
      data.flatMap((item) =>
        object(item) && typeof item.name === 'string' && typeof item.value === 'string'
          ? [{ name: item.name, value: item.value }]
          : [],
      ),
    );
  }
  if (object(data)) {
    if (typeof data.name === 'string' && typeof data.value === 'string') {
      return joinSessionCookies([{ name: data.name, value: data.value }]);
    }
    return joinSessionCookies(
      Object.entries(data).flatMap(([name, value]) => {
        const resolved = cookieValue(value);
        return isSessionCookie(name) && resolved !== undefined ? [{ name, value: resolved }] : [];
      }),
    );
  }
}

export function parseSessionInput(input: string): SessionInput {
  const text = input.trim();
  if (!text) throw new UserError('请先粘贴 Session Token 或 Cookie JSON。');
  if (text.length > MAX_INPUT_LENGTH)
    throw new UserError('输入内容过长，请只粘贴当前账号的 Session 数据。');
  if (text.startsWith('{') || text.startsWith('[') || text.startsWith('"')) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new UserError('JSON 格式有误，请检查括号、引号和逗号。');
    }
    if (typeof data === 'string') return { token: validateToken(data) };
    const token =
      object(data) && data.sessionToken !== undefined
        ? validateToken(data.sessionToken)
        : (readCookies(data) ??
          (object(data) ? readCookies(data.cookies) : undefined) ??
          (object(data) && data.accessToken !== undefined
            ? validateToken(data.accessToken)
            : undefined));
    if (!token) {
      throw new UserError('JSON 中未找到 Session。请从 /api/auth/session 页面复制完整内容。');
    }
    const user = object(data) && object(data.user) ? data.user : undefined;
    const expiresAt =
      object(data) && typeof data.expires === 'string' ? Date.parse(data.expires) : NaN;
    return {
      token,
      email: typeof user?.email === 'string' ? user.email.slice(0, 160) : undefined,
      name: typeof user?.name === 'string' ? user.name.slice(0, 60) : undefined,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
    };
  }
  if (text.includes(SESSION_COOKIE + '=') || text.includes(SESSION_COOKIE + '.')) {
    const cookies = text
      .replace(/^Cookie:\s*/i, '')
      .split(/;|\r?\n/)
      .flatMap((part) => {
        const eq = part.indexOf('=');
        return eq > 0 ? [{ name: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim() }] : [];
      });
    const token = joinSessionCookies(cookies);
    if (!token) throw new UserError('未找到完整的 Session Cookie。');
    return { token };
  }
  return { token: validateToken(text) };
}

export function splitSessionToken(value: string): { name: string; value: string }[] {
  const token = validateToken(value);
  if (token.length <= CHUNK_SIZE) return [{ name: SESSION_COOKIE, value: token }];
  return Array.from({ length: Math.ceil(token.length / CHUNK_SIZE) }, (_, index) => ({
    name: `${SESSION_COOKIE}.${index}`,
    value: token.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
  }));
}
