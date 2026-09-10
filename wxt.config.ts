import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  targetBrowsers: ['chrome', 'edge', 'firefox'],
  manifest: ({ browser }) => ({
    name: 'ChatGPT Switch',
    description:
      '在本机保存、管理并快速切换多个 ChatGPT 登录状态，支持 Session Token、Cookie JSON 导入和无痕窗口隔离。',
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
    action: {
      default_title: 'ChatGPT Switch',
      default_icon: 'icons/128.png',
    },
    icons: { 128: 'icons/128.png' },
  }),
});
