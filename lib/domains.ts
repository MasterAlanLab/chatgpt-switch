export const CHATGPT_URL = 'https://chatgpt.com/';
export const SITE_ORIGINS: [string, ...string[]] = [
  'https://chatgpt.com',
  'https://www.chatgpt.com',
  'https://chat.openai.com',
];

export function isChatGPTHost(host: string): boolean {
  return host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com';
}

export function isChatGPTUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && isChatGPTHost(parsed.hostname);
  } catch {
    return false;
  }
}
