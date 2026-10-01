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
  let unavailableNext = false;
  await page.route('**/service/api/auth/refresh', route => route.fulfill({
    status: 401, json: { code: 401, errorCode: 'HTTP_401', data: null },
  }));
  await page.route('**/native/authz/current?*', async route => {
    reads += 1;
    if (unavailableNext) {
      unavailableNext = false;
      await route.fulfill({ status: 503, json: { code: 503, errorCode: 'DEPENDENCY_UNAVAILABLE', data: null } });
      return;
    }
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
    unavailable: () => { unavailableNext = true; },
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

test('focus and visible coalesce while original-key result recovery remains usable', async ({ page }) => {
  const session = await mount(page);
  let releaseResult!: () => void;
  let requestBody: unknown;
  await page.route('**/native/concurrency/commands/result', async route => {
    requestBody = route.request().postDataJSON();
    await new Promise<void>(resolve => { releaseResult = resolve; });
    await route.fulfill({ json: { code: 200, data: { state: 'accepted', requestKey: 'original-request-key' } } });
  });
  await page.getByTestId('draft').fill('保留输入和原申请');
  await page.getByRole('button', { name: '查询原申请' }).click();
  await expect.poll(() => Boolean(releaseResult)).toBe(true);
  session.hold();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(session.waiting).toBe(true);
  expect(session.reads()).toBe(2);
  releaseResult();
  await expect(page.getByTestId('recovery')).toHaveText('已恢复原申请');
  expect(requestBody).toEqual({ command: 'claim', requestKey: 'original-request-key', environmentKey: 'preproduction' });
  session.release();
  await expect(page.getByText('正在核对当前登录身份与权限')).toBeHidden();
  await expect(page.getByTestId('draft')).toHaveValue('保留输入和原申请');
});

test('temporary check failure preserves the page and keyboard retry verifies the same identity', async ({ page }) => {
  const session = await mount(page);
  await page.getByTestId('draft').fill('网络失败时保留输入');
  session.unavailable();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('暂时无法核对登录状态')).toBeVisible();
  await expect(page.getByTestId('draft')).toHaveValue('网络失败时保留输入');
  const retry = page.getByRole('button', { name: '重新检查' });
  await retry.focus(); await retry.press('Enter');
  await expect(page.getByText('暂时无法核对登录状态')).toBeHidden();
  await expect(page.getByTestId('draft')).toHaveValue('网络失败时保留输入');
  expect(session.reads()).toBe(3);
});

test('busy startup waits in Chinese and recovers the existing current endpoint', async ({ page }) => {
  let reads = 0;
  await page.addInitScript(() => {
    sessionStorage.setItem(`oxa-entry-wait:${location.pathname}`, JSON.stringify({ started: Date.now(), attempt: 1 }));
    sessionStorage.setItem('oxa-entry-wait:/another-page', 'another-deadline');
  });
  await page.route('**/native/authz/current?*', async route => {
    reads++;
    await route.fulfill(reads === 1 ? { status: 429,
      headers: { 'Retry-After': '2' }, json: { code: 429, errorCode: 'CONCURRENCY_BOOTSTRAP_BUSY', data: { retryAfterMs: 2000 } },
    } : { json: { code: 200, data: asUser('admin') } });
  });
  await page.goto('/session-switch.e2e.html');
  await expect(page.getByText('正在连接应用，访问较多时将自动等待，请稍候')).toBeVisible();
  await expect(page.getByTestId('current-user')).toHaveText('admin', { timeout: 10_000 });
  expect(reads).toBe(2);
  expect(await page.evaluate(() => sessionStorage.getItem(`oxa-entry-wait:${location.pathname}`))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('oxa-entry-wait:/another-page'))).toBe('another-deadline');
});
