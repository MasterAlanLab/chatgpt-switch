import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  targetBrowsers: ['chrome', 'edge', 'firefox'],
  manifest: ({ browser }) => ({
    name: 'ChatGPT Switch',
    description:
      '在本机保存与切换 ChatGPT 登录态，支持 Session Token 和 Cookie JSON。无支付或订阅功能。',
    permissions: ['storage', 'cookies', 'activeTab', 'browsingData'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://*.chatgpt.com/*',
      'https://chat.openai.com/*',
    ],
    ...(browser === 'firefox'
      ? {
          incognito: 'spanning' as const,
          browser_specific_settings: {
            gecko: {
              id: 'chatgpt-switch@masteralanlab.github.com',
              strict_min_version: '109.0',
              data_collection_permissions: { required: ['none' as const] },
            },
          },
        }
      : {
          minimum_chrome_version: '116',
          incognito: 'split' as const,
        }),
    action: { default_title: 'ChatGPT Switch' },
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  }),
});
