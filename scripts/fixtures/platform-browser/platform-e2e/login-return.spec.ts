import { test, expect } from '@playwright/test';
import { mockPlatform } from './resource-platform-mock';
for (const device of ['desktop', 'mobile']) {
  test(`已恢复登录 ${device} 经平台校验返回原路径与 query/hash，不先跳首页`, async ({ page }) => {
    await mockPlatform(page, false, undefined, true);
    const requested: string[] = [];
    let release: (() => void) | undefined;
    await page.route('**/auth/surface?*', async route => {
      const target = new URL(route.request().url()).searchParams.get('returnTo')!;
      requested.push(target);
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ json: { code: 200, data: { returnTo: target, csrfToken: 'return-token', methods: [] } } });
    });
    await page.goto(`/login-return.e2e.html?device=${device}`);
    await expect.poll(() => requested.length).toBe(1);
    await expect(page.getByTestId('current-route')).toContainText('/login?');
    await expect(page.getByTestId('current-route')).not.toContainText('/home');
    release!();
    await expect(page.getByTestId('current-route')).toHaveText('/m/recuperation?section=routes#details');
    await expect(page.getByText('原业务页面', { exact: true })).toBeVisible();
  });
}

test('原目标被平台拒绝时停留可重试，不静默跳首页或外站', async ({ page }) => {
  await mockPlatform(page, false, undefined, true);
  let reads = 0;
  await page.route('**/auth/surface?*', async route => {
    reads++;
    await route.fulfill({ status: 400, json: { code: 400, errorCode: 'APPLICATION_AUTH_RETURN_TO_INVALID' } });
  });
  await page.goto('/login-return.e2e.html?device=mobile&target=https%3A%2F%2Fexample.invalid');
  await expect(page.getByText('暂时无法返回原页面', { exact: true })).toBeVisible();
  await expect(page.getByTestId('current-route')).toContainText('/m/login?');
  // Ant Design inserts spacing between a two-character Chinese button label.
  await page.getByRole('button', { name: /^重\s*试$/ }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(page.getByTestId('current-route')).toContainText('/m/login?');
});
