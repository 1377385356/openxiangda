import { expect, test } from '@playwright/test';
import { mockPlatform } from './resource-platform-mock';

test('mobile measurement CSS precedes Ant Design Mobile module evaluation', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await mockPlatform(page.context(), true, undefined, true);
  await page.goto('/mobile-reference.e2e.html');
  await expect(page.getByRole('heading', { name: '未命名表单' })).toBeVisible();

  expect(consoleErrors.filter(message => message.includes('[antd-mobile: Global]'))).toEqual([]);
  const testers = page.locator('.adm-px-tester');
  await expect(testers).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    await expect(testers.nth(index)).toHaveCSS('position', 'fixed');
  }
  const tenPxTester = page.locator('.adm-px-tester[style*="--size: 10"]');
  await expect(tenPxTester).toHaveCount(1);
  expect(await tenPxTester.evaluate(element => element.getBoundingClientRect().height)).toBe(10);
  await expect(page.locator('#openxiangda-antd-mobile-runtime-global')).toHaveCount(1);
});
