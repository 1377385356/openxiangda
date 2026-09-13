import { expect, test } from '@playwright/test';
import { mockPlatform } from './resource-platform-mock';

// 复现 2.18.0 的发布盲区：rootEntry 直接别名资源 records 路由（登录落地即
// “我的记录”）。校验器曾把这当作路径冲突拒绝，导致整个应用渲染为空白。
const items = [
  { id: 'mine-1', name: '打印纸 A4', quantity: 2, created_by: 'acceptance-user' },
  { id: 'mine-2', name: '白板笔', quantity: 5, created_by: 'acceptance-user' },
];

test.beforeEach(async ({ page }) => {
  await mockPlatform(page, true, undefined, true, { 'resource-01': items });
  await page.goto('/user-surface.e2e.html');
});

test('aliased root entry mounts the generated records page instead of a blank app', async ({ page }) => {
  await expect(page).toHaveURL('/my/resource-01');
  await expect(page.getByRole('heading', { name: '我的物资领用' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建物资领用' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '打印纸 A4' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '白板笔' })).toBeVisible();
});

test('records rows only reflect the current user query and open read-only detail', async ({ page }) => {
  await expect(page).toHaveURL('/my/resource-01');
  const request = page.waitForRequest(
    request =>
      request.url().includes('/native/data/resource-01/query') &&
      request.method() === 'POST'
  );
  await page.getByRole('button', { name: '刷新数据' }).click();
  const payload = (await request).postDataJSON();
  expect(
    JSON.stringify(payload).includes('acceptance-user') ||
      JSON.stringify(payload).includes('created_by')
  ).toBe(true);
  await page.getByRole('cell', { name: '打印纸 A4' }).click();
  await expect(page.getByRole('dialog').getByText('打印纸 A4')).toBeVisible();
});

test('submit entry renders the generated create form and returns to records', async ({ page }) => {
  await expect(page).toHaveURL('/my/resource-01');
  await page.getByRole('button', { name: '新建物资领用' }).click();
  await expect(page).toHaveURL('/my/resource-01/submit');
  await expect(page.getByLabel('物资名称')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('/my/resource-01');
  await expect(page.getByRole('heading', { name: '我的物资领用' })).toBeVisible();
});

test('landing pair still negotiates between desktop and mobile surfaces', async ({ page }) => {
  await expect(page).toHaveURL('/my/resource-01');
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page).toHaveURL(/\/m\/my\/resource-01$/);
  await expect(page.getByRole('heading', { name: '我的物资领用' })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page).toHaveURL(/\/my\/resource-01$/);
});
