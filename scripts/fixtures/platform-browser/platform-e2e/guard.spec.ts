import { test, expect } from '@playwright/test';
import { mockPlatform } from './resource-platform-mock';
test.beforeEach(async ({ page }) => {
  await mockPlatform(page, true, '/guard');
  await page.goto('/guard-navigation.e2e.html');
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('textbox', { name: '主题' }).fill('季度会议');
});
test('link cancellation preserves input and component through parent rerender', async ({ page }) => {
  const mount = await page.getByTestId('mount').textContent();
  await page.getByRole('button', { name: '父级重绘' }).click();
  await expect(page.getByTestId('mount')).toHaveText(mount!);
  await page.getByRole('link', { name: '站内链接' }).click();
  await page.getByRole('button', { name: '继续编辑' }).click();
  await expect(page.getByRole('textbox', { name: '主题' })).toHaveValue('季度会议');
  await expect(page).toHaveURL('/guard/edit');
  await page.getByRole('link', { name: '站内链接' }).click();
  await page.getByRole('button', { name: /^离\s*开$/ }).click();
  await expect(page).toHaveURL('/guard/link');
});
test('repeated push and replace preserve the first pending destination', async ({ page }) => {
  await page.getByRole('link', { name: '站内链接' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => window.fixtureNavigate('/later', { replace: true }));
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: /^离\s*开$/ }).click();
  await expect(page).toHaveURL('/guard/link');
});
test('repeated POP stays on original route then proceeds the original back once', async ({ page }) => {
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL('/guard/edit');
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL('/guard/edit');
  await page.getByRole('button', { name: '继续编辑' }).click();
  await expect(page.getByRole('textbox', { name: '主题' })).toHaveValue('季度会议');
  await page.evaluate(() => window.history.back());
  await page.getByRole('button', { name: /^离\s*开$/ }).click();
  await expect(page).toHaveURL('/guard/home');
});
test('save clears blocking and native beforeunload is only dirty', async ({ page }) => {
  const isBlocked = () => page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
  expect(await isBlocked()).toBe(true);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect(await isBlocked()).toBe(false);
  await page.getByRole('link', { name: '站内链接' }).click();
  await expect(page).toHaveURL('/guard/link');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('replace commits once and back skips the replaced edit page', async ({ page }) => {
  await page.getByRole('button', { name: '替换跳转' }).click();
  await page.getByRole('button', { name: /^离\s*开$/ }).click();
  await expect(page).toHaveURL('/guard/replace');
  await page.goBack();
  await expect(page).toHaveURL('/guard/home');
});

test('Escape cancels with focus restored, and reload uses the real native prompt', async ({ page }) => {
  await page.getByRole('link', { name: '站内链接' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '站内链接' })).toBeFocused();
  const native = page.waitForEvent('dialog');
  const reload = page.evaluate(() => window.location.reload());
  const dialog = await native;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await reload;
  await expect(page.getByRole('textbox', { name: '主题' })).toHaveValue('季度会议');
});

test('multistep POP and forward preserve the original position on cancellation', async ({ page }) => {
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.evaluate(() => window.fixtureNavigate('/one'));
  await expect(page).toHaveURL('/guard/one');
  await page.evaluate(() => window.fixtureNavigate('/two'));
  await expect(page).toHaveURL('/guard/two');
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('textbox', { name: '主题' }).fill('多步保留');
  await page.evaluate(() => window.fixtureNavigate(-2));
  await page.getByRole('button', { name: '继续编辑' }).click();
  await expect(page).toHaveURL('/guard/edit');
  await page.evaluate(() => window.fixtureNavigate(-2));
  await page.getByRole('button', { name: /^离\s*开$/ }).click();
  await expect(page).toHaveURL('/guard/one');
  await page.goForward();
  await expect(page).toHaveURL('/guard/two');
  await page.goForward();
  await expect(page).toHaveURL('/guard/edit');
});

test('multiple guards aggregate once and unmount removes only its own registration', async ({ page }) => {
  await page.getByRole('button', { name: '切换第二表单' }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('link', { name: '站内链接' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toContainText('第二表单尚未保存');
  await page.getByRole('button', { name: '继续编辑' }).click();
  await page.getByRole('button', { name: '切换第二表单' }).click();
  await page.getByRole('link', { name: '站内链接' }).click();
  await expect(page).toHaveURL('/guard/link');
});

test('submission success clears registration before the navigation effect', async ({ page }) => {
  await page.getByRole('button', { name: '提交并跳转' }).click();
  await expect(page).toHaveURL('/guard/saved');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('mobile cancellation keeps the form and one visible accessible dialog', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: '站内链接' }).click();
  const dialog = page.getByRole('dialog', { name: '离开当前页面？' });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => { const b = await dialog.boundingBox(); return Boolean(b && b.x >= 0 && b.x + b.width <= 390); }).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile-navigation-guard.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: '继续编辑' }).click();
  await expect(page.getByRole('textbox', { name: '主题' })).toHaveValue('季度会议');
});
