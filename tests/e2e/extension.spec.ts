import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Locator,
} from '@playwright/test';
import type { WxtBrowser } from 'wxt/browser';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { access } from 'node:fs/promises';

let context: BrowserContext;
let popup: Page;
let profile: string;
const cookieName = '__Secure-next-auth.session-token';
const firstToken = 'synthetic-personal-session-'.repeat(8);
const secondToken = 'synthetic-work-session-'.repeat(8);

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'chatgpt-switch-test-'));
  const extension = resolve('dist/chrome-mv3');
  await access(join(extension, 'manifest.json'));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 420, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  // All website requests are synthetic; no live ChatGPT account is used.
  await context.route(/^https?:\/\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Local ChatGPT fixture</h1>' }),
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await mkdir('artifacts/screenshots', { recursive: true });
});

test.afterAll(async () => {
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});

// A visible DOM node can still be clipped by overflow. Do hit-testing BEFORE
// Playwright's click/scroll helpers, which otherwise conceal this regression.
async function expectUnobstructed(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return [
          [rect.left + 3, rect.top + 3],
          [rect.right - 3, rect.top + 3],
          [rect.left + 3, rect.bottom - 3],
          [rect.right - 3, rect.bottom - 3],
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
        ].every(([x, y]) => element.contains(document.elementFromPoint(x!, y!)));
      }),
    )
    .toBe(true);
}

async function seedAccounts(count: number) {
  const worker = context.serviceWorkers()[0]!;
  await worker.evaluate(async (count) => {
    const api = (globalThis as unknown as { chrome: WxtBrowser }).chrome;
    await api.storage.local.clear();
    await api.storage.session.clear();
    await api.storage.local.set({
      'chatgpt-switch:v1': {
        version: 1,
        settings: { clearSiteData: false, openAfterSwitch: false },
        accounts: Array.from({ length: count }, (_, index) => ({
          id: `fixture-${index + 1}`,
          name: `测试账号 ${index + 1}`,
          token: `synthetic-fixture-${index + 1}-`.repeat(8),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })),
      },
    });
  }, count);
  await popup.reload();
  await expect(popup.locator('.account-card')).toHaveCount(count);
}

test('real MV3 extension: save, switch, capture, rename, delete and one-off login', async () => {
  const errors: string[] = [];
  popup.on('pageerror', (error) => errors.push(error.message));
  await expect(popup.getByText('把常用账号放在这里')).toBeVisible();
  await popup.screenshot({ path: 'artifacts/screenshots/empty.png', fullPage: true });
  await popup.getByRole('button', { name: '切换设置', exact: true }).click();
  await popup.getByRole('switch', { name: /切换后打开 ChatGPT/ }).uncheck();
  await popup.getByRole('button', { name: '切换设置', exact: true }).click();

  async function add(name: string, token: string) {
    await popup.getByRole('button', { name: '添加账号', exact: true }).click();
    await popup.getByPlaceholder('例如：个人账号、工作账号').fill(name);
    await popup.getByLabel('Session Token / Cookie JSON', { exact: true }).fill(token);
    await popup.getByRole('button', { name: '保存账号', exact: true }).click();
    await expect(popup.getByRole('dialog')).not.toBeVisible();
  }
  await add('个人账号', firstToken);
  await add('工作账号', secondToken);
  await expect(popup.locator('.account-card')).toHaveCount(2);
  await popup.getByRole('button', { name: '切换到 个人账号', exact: true }).click();
  await expect(popup.locator('.connection-main strong')).toHaveText('个人账号');
  expect(
    (await context.cookies('https://chatgpt.com/')).find((item) => item.name === cookieName)?.value,
  ).toBe(firstToken);
  await popup.getByRole('button', { name: '切换到 工作账号', exact: true }).click();
  await expect(popup.locator('.connection-main strong')).toHaveText('工作账号');
  expect(
    (await context.cookies('https://chatgpt.com/')).find((item) => item.name === cookieName)?.value,
  ).toBe(secondToken);
  await popup.screenshot({ path: 'artifacts/screenshots/accounts.png', fullPage: true });

  await popup.getByRole('button', { name: '保存当前登录', exact: true }).click();
  await expect(popup.getByRole('status')).toContainText('当前登录态已保存');
  await expect(popup.locator('.account-card')).toHaveCount(2);
  await popup.getByRole('button', { name: '管理 工作账号', exact: true }).click();
  await popup.getByRole('menuitem', { name: '编辑备注', exact: true }).click();
  await popup.getByRole('textbox', { name: '账号备注', exact: true }).fill('团队账号');
  await popup.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(popup.getByRole('dialog')).not.toBeVisible();
  await popup.getByRole('textbox', { name: '搜索账号' }).fill('团队');
  await expect(popup.locator('.account-card')).toHaveCount(1);
  await popup.getByRole('textbox', { name: '搜索账号' }).fill('');

  await popup.getByRole('button', { name: '管理 个人账号', exact: true }).click();
  await popup.getByRole('menuitem', { name: '移除账号', exact: true }).click();
  await popup.getByRole('button', { name: '确认移除', exact: true }).click();
  await expect(popup.locator('.account-card')).toHaveCount(1);
  await popup.getByRole('button', { name: '快捷登录', exact: true }).click();
  const input = popup.getByLabel('Session Token / Cookie JSON', { exact: true });
  await input.fill(JSON.stringify({ accessToken: firstToken }));
  await expect(popup.getByRole('button', { name: /切换并登录/ })).toBeEnabled();
  await popup.getByText('如何获取 Session？', { exact: true }).click();
  await expect(popup.getByText(/页面内容就是当前 Session/)).toBeVisible();
  await input.fill('x'.repeat(8000));
  await popup.screenshot({ path: 'artifacts/screenshots/quick-login.png', fullPage: true });
  await popup.getByRole('button', { name: /切换并登录/ }).click();
  await expect(input).toHaveValue('');
  const cookies = (await context.cookies('https://chatgpt.com/')).filter((item) =>
    item.name.startsWith(cookieName),
  );
  expect(cookies).toHaveLength(3);
  expect(cookies.map((item) => item.value).join('')).toBe('x'.repeat(8000));
  await popup.reload();
  await expect(popup.locator('.account-card')).toHaveCount(1);
  await popup.getByRole('button', { name: '切换设置', exact: true }).click();
  await popup.getByRole('button', { name: '清除当前登录 Cookie', exact: true }).click();
  await popup.getByRole('button', { name: '清除登录', exact: true }).click();
  await expect(popup.getByRole('dialog')).not.toBeVisible();
  expect(
    (await context.cookies('https://chatgpt.com/')).filter((item) =>
      item.name.startsWith(cookieName),
    ),
  ).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('single-account edit/delete menu is not clipped by the account list', async () => {
  await seedAccounts(1);
  await popup.getByRole('button', { name: '管理 测试账号 1', exact: true }).click();
  await popup.screenshot({ path: 'artifacts/screenshots/single-account-menu.png' });
  await expectUnobstructed(popup.getByRole('menuitem', { name: '编辑备注', exact: true }));
  await expectUnobstructed(popup.getByRole('menuitem', { name: '移除账号', exact: true }));
  await popup.getByRole('menuitem', { name: '编辑备注', exact: true }).click();
  await expectUnobstructed(popup.getByRole('textbox', { name: '账号备注', exact: true }));
  await expectUnobstructed(popup.getByRole('button', { name: '保存修改', exact: true }));
  await popup.getByRole('button', { name: '取消', exact: true }).click();
  await popup.getByRole('button', { name: '管理 测试账号 1', exact: true }).click();
  await popup.getByRole('menuitem', { name: '移除账号', exact: true }).click();
  await expectUnobstructed(popup.getByRole('button', { name: '确认移除', exact: true }));
  await popup.screenshot({ path: 'artifacts/screenshots/delete-dialog.png' });
  await popup.getByRole('button', { name: '确认移除', exact: true }).click();
  await expect(popup.locator('.account-card')).toHaveCount(0);
});

test('scrolled last-row menu supports keyboard control, resizing and dismissal', async () => {
  await seedAccounts(8);
  const trigger = popup.getByRole('button', { name: '管理 测试账号 8', exact: true });
  await trigger.click();
  const edit = popup.getByRole('menuitem', { name: '编辑备注', exact: true });
  const remove = popup.getByRole('menuitem', { name: '移除账号', exact: true });
  await expectUnobstructed(edit);
  await expectUnobstructed(remove);
  expect(
    await popup.getByRole('menu').evaluate((node) => node.parentElement === document.body),
  ).toBe(true);
  await expect(edit).toBeFocused();
  await popup.keyboard.press('ArrowDown');
  await expect(remove).toBeFocused();
  await popup.keyboard.press('Home');
  await expect(edit).toBeFocused();
  await popup.keyboard.press('End');
  await expect(remove).toBeFocused();
  await popup.screenshot({ path: 'artifacts/screenshots/last-account-menu.png' });
  await popup.setViewportSize({ width: 380, height: 420 });
  await expectUnobstructed(edit);
  await expectUnobstructed(remove);
  await popup.keyboard.press('Escape');
  await expect(popup.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await popup.setViewportSize({ width: 420, height: 600 });
  await trigger.click();
  await popup.locator('.account-list').evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(popup.getByRole('menu')).toHaveCount(0);
  const firstTrigger = popup.getByRole('button', { name: '管理 测试账号 1', exact: true });
  await firstTrigger.click();
  await popup.mouse.click(5, 5);
  await expect(popup.getByRole('menu')).toHaveCount(0);
  await popup.getByRole('textbox', { name: '搜索账号' }).fill('测试账号 1');
  await firstTrigger.click();
  await expectUnobstructed(remove);
  await popup.keyboard.press('Escape');
});

test('promotion stays visible and opens only the fixed URL without session data', async () => {
  await seedAccounts(0);
  const requests: { url: string; referer?: string }[] = [];
  const listen = (request: import('@playwright/test').Request) => {
    if (request.url().startsWith('https://ai.corouter.cc/')) {
      requests.push({ url: request.url(), referer: request.headers().referer });
    }
  };
  context.on('request', listen);
  try {
    const link = popup.getByRole('link', { name: /AI 订阅代付/ });
    await expectUnobstructed(link);
    await expect(link).toHaveAttribute('href', 'https://ai.corouter.cc/');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer sponsored');
    await expect(popup.getByText('推广', { exact: true })).toHaveCount(0);
    await popup.getByRole('button', { name: '快捷登录', exact: true }).click();
    await popup.getByLabel('Session Token / Cookie JSON', { exact: true }).fill(firstToken);
    await popup.locator('.app-scroll').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expectUnobstructed(link);
    expect(requests).toEqual([]);
    await popup.screenshot({ path: 'artifacts/screenshots/promotion.png' });
    const opened = context.waitForEvent('page');
    await link.click();
    const page = await opened;
    await expect(page).toHaveURL('https://ai.corouter.cc/');
    await page.waitForLoadState();
    expect(await page.evaluate(() => window.opener === null)).toBe(true);
    expect(requests).toEqual([{ url: 'https://ai.corouter.cc/', referer: undefined }]);
    await page.close();
    await popup.bringToFront();
  } finally {
    context.off('request', listen);
  }
});
