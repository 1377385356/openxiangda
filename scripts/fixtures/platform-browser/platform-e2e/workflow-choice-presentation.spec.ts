import { expect, test } from '@playwright/test';

test('canvas condition pills and tooltips show Chinese options without changing raw expressions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/workflow-choice-presentation.e2e.html');
  const known = page.getByRole('button', { name: /分支：.*自定义重大分支.*是否重大合同 等于 重大/ });
  await expect(known).toBeVisible();
  await expect(known).toHaveAttribute('title', '自定义重大分支：是否重大合同 等于 重大');
  await expect(page.getByRole('button', { name: /分支：.*历史条件分支.*"legacy"/ })).toBeVisible();
  await expect(page.getByLabel('原始条件值')).toContainText('"value":"yes"');
});

test('accessible node list uses the same Chinese conditions and retains custom branch titles', async ({ page }) => {
  await page.goto('/workflow-choice-presentation.e2e.html');
  await page.getByText('节点列表', { exact: true }).click();
  const list = page.getByRole('list', { name: '流程节点列表', exact: true });
  await expect(list.getByRole('button', { name: /自定义重大分支：是否重大合同 等于 重大/ })).toBeVisible();
  await expect(list.getByRole('button', { name: /历史条件分支：是否重大合同 等于 "legacy"/ })).toBeVisible();
  await expect(page.getByLabel('原始条件值')).toContainText('"value":"yes"');
});

test('incompatible option metadata does not falsely translate stored values', async ({ page }) => {
  await page.goto('/workflow-choice-presentation.e2e.html?choices=invalid');
  await expect(page.getByRole('button', { name: /分支：.*自定义重大分支.*"yes"/ })).toBeVisible();
  await expect(page.getByText('错误布尔选项', { exact: true })).toHaveCount(0);
});
