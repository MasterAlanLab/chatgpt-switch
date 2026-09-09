import { test, expect, chromium, type CDPSession } from '@playwright/test';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { WxtBrowser } from 'wxt/browser';

// Browser action popups are not ordinary Playwright tabs. Attach to the actual
// toolbar target via CDP; do not navigate a tab to popup.html or override its viewport.
class NativePopup {
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (reason: Error) => void }
  >();
  private constructor(
    private cdp: CDPSession,
    private sessionId: string,
  ) {
    cdp.on('Target.receivedMessageFromTarget', this.receive);
  }

  private receive = (event: { sessionId: string; message: string }) => {
    if (event.sessionId !== this.sessionId) return;
    const message = JSON.parse(event.message);
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  };

  static async attach(cdp: CDPSession, url: string) {
    let targetId: string | undefined;
    await expect
      .poll(async () => {
        const { targetInfos } = await cdp.send('Target.getTargets');
        targetId = targetInfos.find(
          (target) => target.type === 'page' && target.url === url,
        )?.targetId;
        return !!targetId;
      })
      .toBe(true);
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: targetId!,
      flatten: false,
    });
    return new NativePopup(cdp, sessionId);
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.nextId;
    let timer: ReturnType<typeof setTimeout>;
    return new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Native popup CDP timeout: ${method}`));
      }, 5000);
      this.pending.set(id, { resolve, reject });
      void this.cdp
        .send('Target.sendMessageToTarget', {
          sessionId: this.sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch(reject);
    }).finally(() => {
      clearTimeout(timer);
      this.pending.delete(id);
    });
  }

  async evaluate(expression: string): Promise<any> {
    const response = await this.call('Runtime.evaluate', { expression, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }

  async visible(selector: string) {
    await expect
      .poll(() =>
        this.evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight &&
        rect.left >= 0 && rect.right <= innerWidth &&
        node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    })()`),
      )
      .toBe(true);
  }

  async click(selector: string) {
    await this.visible(selector);
    const point = await this.evaluate(`(() => {
      const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await this.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      ...point,
    });
    await this.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      ...point,
    });
  }

  async screenshot(name: string) {
    const { data } = await this.call('Page.captureScreenshot');
    await writeFile(resolve('artifacts/screenshots', name), Buffer.from(data, 'base64'));
  }

  async detach() {
    this.cdp.off('Target.receivedMessageFromTarget', this.receive);
    await this.cdp.send('Target.detachFromTarget', { sessionId: this.sessionId });
  }
}

test('native toolbar popup cold-start, reopen, promotion and account dialogs', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'chatgpt-switch-native-'));
  const extension = resolve('.output/chrome-mv3');
  await access(join(extension, 'manifest.json'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: false,
    viewport: null,
    args: [
      '--window-size=1000,900',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    await mkdir(resolve('artifacts/screenshots'), { recursive: true });
    await context.route(/^https?:\/\//, (route) => route.fulfill({ body: 'Local fixture' }));
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const tab = context.pages()[0]!;
    await tab.goto('about:blank');
    const cdp = await context.browser()!.newBrowserCDPSession();
    const url = `chrome-extension://${new URL(worker.url()).host}/popup.html`;

    for (let pass = 0; pass < 3; pass++) {
      await tab.bringToFront();
      if (pass === 1) {
        await worker.evaluate(async () => {
          const api = (globalThis as unknown as { chrome: WxtBrowser }).chrome;
          await api.storage.local.set({
            'chatgpt-switch:v1': {
              version: 1,
              settings: { clearSiteData: false, openAfterSwitch: false },
              accounts: [
                {
                  id: 'native-fixture',
                  name: '工具栏测试账号',
                  token: 'native-synthetic-session-'.repeat(8),
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ],
            },
          });
        });
      }
      await worker.evaluate(async () => {
        await (globalThis as unknown as { chrome: WxtBrowser }).chrome.action.openPopup();
      });
      const popup = await NativePopup.attach(cdp, url);
      await expect.poll(() => popup.evaluate('[innerWidth, innerHeight]')).toEqual([420, 600]);
      await popup.visible('.brand');
      await popup.visible('.account-actions .primary');
      await popup.visible('.promotion');
      await expect
        .poll(() => popup.evaluate("document.querySelector('.loading-state') === null"))
        .toBe(true);
      expect(
        await popup.evaluate("document.querySelector('.app-scroll').clientHeight"),
      ).toBeGreaterThan(400);
      await popup.screenshot(`native-toolbar-${pass}.png`);

      if (pass === 1) {
        await popup.click('.account-menu button');
        await popup.visible('.menu-popover button:last-child');
        await popup.click('.menu-popover button:first-child');
        await popup.visible('dialog input');
        await popup.visible('dialog .primary');
        await popup.screenshot('native-toolbar-edit.png');
        await popup.click('dialog .modal-header button');
        await popup.click('.account-menu button');
        await popup.click('.menu-popover button:last-child');
        await popup.visible('dialog .destructive');
        await popup.screenshot('native-toolbar-delete.png');
        await popup.click('dialog .destructive');
        await expect
          .poll(() => popup.evaluate("document.querySelectorAll('.account-card').length"))
          .toBe(0);
      }
      await popup.detach();
      await tab.bringToFront();
      await expect
        .poll(async () => {
          const { targetInfos } = await cdp.send('Target.getTargets');
          return targetInfos.some((target) => target.url === url);
        })
        .toBe(false);
    }
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
