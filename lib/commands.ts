import { UserError } from './errors';
import { MAX_INPUT_LENGTH } from './session';
import type { Command } from './types';

export function validateCommand(value: unknown): Command {
  const fail = () => {
    throw new UserError('请求格式有误，请重新打开扩展。');
  };
  if (!value || typeof value !== 'object') return fail();
  const data = value as Record<string, unknown>;
  if (data.type === 'state') return { type: 'state' };
  if (!Number.isInteger(data.tabId) || (data.tabId as number) < 0) return fail();
  const hasString = (key: string, max: number) =>
    typeof data[key] === 'string' && data[key].length <= max;
  switch (data.type) {
    case 'save':
    case 'login':
      if (!hasString('input', MAX_INPUT_LENGTH) || !hasString('name', 60)) return fail();
      if (data.type === 'login' && typeof data.remember !== 'boolean') return fail();
      break;
    case 'capture':
      if (!hasString('name', 60)) return fail();
      break;
    case 'switch':
    case 'delete':
    case 'rename':
      if (!hasString('id', 80)) return fail();
      if (data.type === 'rename' && !hasString('name', 60)) return fail();
      break;
    case 'settings': {
      const settings = data.settings as Record<string, unknown> | undefined;
      if (
        !settings ||
        typeof settings.clearSiteData !== 'boolean' ||
        typeof settings.openAfterSwitch !== 'boolean'
      )
        return fail();
      break;
    }
    case 'usage':
      if (typeof data.details !== 'boolean') return fail();
      break;
    case 'logout':
    case 'open':
      break;
    default:
      return fail();
  }
  return data as Command;
}
