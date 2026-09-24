import { expect, test, type Page } from '@playwright/test';
import { runtimeAuthorization } from './resource-platform-mock';

function asUser(userId: string, revision = 'authz-1') {
  const context = runtimeAuthorization(true, userId === 'admin');
  context.principal.userId = userId;
  context.principal.identityScope = `user-union:preproduction-id:${userId}:${revision}`;
  context.environment.authzRevisionId = revision;
  context.subjectProfile.userId = userId;
  return context;
}

async function mount(page: Page) {
  let current = asUser('admin');
  let reads = 0;
  let release: (() => void) | undefined;
  let holdNext = false;
  let rejectNext = false;
  await page.route('**/native/authz/current?*', async route => {
    reads += 1;
    if (rejectNext) {
      rejectNext = false;
      await route.fulfill({ status: 401, json: { code: 401, errorCode: 'APPLICATION_AUTH_UNAUTHENTICATED', data: null } });
      return;
    }
    const response = current;
    if (holdNext) {
      holdNext = false;
      await new Promise<void>(resolve => { release = resolve; });
    }
    await route.fulfill({ json: { code: 200, data: response } });
  });
  await page.goto('/session-switch.e2e.html');
  await expect(page.getByTestId('current-user')).toHaveText('admin');
  return {
    reads: () => reads,
    switchTo: (userId: string, revision = 'authz-1') => { current = asUser(userId, revision); },
    hold: () => { holdNext = true; },
    reject: () => { rejectNext = true; },
    release: () => release?.(),
    waiting: () => Boolean(release),
  };
}

test('same identity focus recheck blocks old input then preserves unsaved draft', async ({ page }) => {
  const session = await mount(page);
  await page.getByTestId('draft').fill('尚未保存的合同');
  session.hold();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(session.waiting).toBe(true);
  await expect(page.getByText('正在核对当前登录身份与权限')).toBeVisible();
  await expect(page.getByTestId('draft')).toHaveValue('尚未保存的合同');
  session.release();
  await expect(page.getByText('正在核对当前登录身份与权限')).toBeHidden();
  await expect(page.getByTestId('draft')).toHaveValue('尚未保存的合同');
  expect(session.reads()).toBe(2);
});

test('failed current-session read removes the old protected form', async ({ page }) => {
  const session = await mount(page);
  session.reject();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('draft')).toHaveCount(0);
});

test('changed subject or authorization scope requires explicit continuation', async ({ page }) => {
  const session = await mount(page);
  await page.getByTestId('draft').fill('管理员未保存内容');
  session.switchTo('handler');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('登录身份或权限已变化')).toBeVisible();
  await expect(page.getByTestId('draft')).toHaveCount(0);
  await page.getByRole('button', { name: '以当前身份继续' }).click();
  await expect(page.getByTestId('current-user')).toHaveText('handler');
  await expect(page.getByTestId('draft')).toHaveValue('');
  session.switchTo('handler', 'authz-2');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('登录身份或权限已变化')).toBeVisible();
  await page.getByRole('button', { name: '以当前身份继续' }).click();
  session.switchTo('admin', 'authz-2');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('登录身份或权限已变化')).toBeVisible();
  await page.getByRole('button', { name: '以当前身份继续' }).click();
  await expect(page.getByTestId('current-user')).toHaveText('admin');
});

test('logout broadcast wins against an in-flight focus recheck', async ({ page }) => {
  const session = await mount(page);
  session.hold();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(session.waiting).toBe(true);
  await page.evaluate(() => {
    const channel = new BroadcastChannel('auth-session-v2');
    channel.postMessage({ type: 'logout', payload: { version: 2, ownerId: 'other-tab', reason: 'logout', at: Date.now() } });
    channel.close();
  });
  await expect(page.getByTestId('draft')).toHaveCount(0);
  session.release();
  await expect(page.getByTestId('draft')).toHaveCount(0);
  await expect(page.getByText('登录与权限服务暂时不可用')).toBeVisible();
});
