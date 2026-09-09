import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { SwitchService } from '../lib/service';

export default defineBackground(() => {
  const service = new SwitchService(browser);
  // Restrict local credentials to extension pages, never content scripts.
  const ready = Promise.all([
    browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    browser.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('/popup.html'))
      return;
    void ready
      .then(() => service.dispatch(message))
      .then(sendResponse)
      .catch(() => {
        sendResponse({ ok: false, error: '扩展初始化未完成，请重新加载扩展后重试。' });
      });
    // Keep the MV3 response channel alive even after the popup loses focus.
    return true;
  });
});
