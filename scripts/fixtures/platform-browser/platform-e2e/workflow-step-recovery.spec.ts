import { expect, test, type Page } from '@playwright/test';
import { mockPlatform } from './resource-platform-mock';

async function recovery(page: Page, failures: number[]) {
  await mockPlatform(page, true, '/guard');
  await page.route('**/auth/surface**', route => route.fulfill({ json: { code: 200, data: { csrfToken: 'step-ui-csrf' } } }));
  const bodies: string[] = [];
  await page.route('**/admin/workflow-instances/step-instance/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/options')) return route.fulfill({ json: { code: 200, data: { status: 'running', canRetryBusinessStep: true, businessStep: { handlerCode: 'calculate-v1', handlerVersion: 1, status: 'result_ready' } } } });
    if (path.endsWith('/preview')) return route.fulfill({ json: { code: 200, data: { action: 'admin_retry_step', canCommit: true, commandToken: 'original-step-token', expiresAt: new Date(Date.now() + 60_000).toISOString(), target: { title: '金额计算', executionId: 'original-execution' } } } });
    bodies.push(route.request().postData()!);
    const status = failures.shift() ?? 200;
    if (status === 0) return route.abort('failed');
    return route.fulfill({ status, json: status === 200 ? { code: 200, data: { advanced: true } } : { code: status, errorCode: 'STEP_TEST_FAILURE', message: 'controlled failure' } });
  });
  await page.goto('/guard-navigation.e2e.html');
  await page.getByRole('button', { name: '业务步骤恢复', exact: true }).click();
  await page.getByRole('textbox', { name: '业务步骤恢复原因' }).fill('后续人员配置已修复');
  await page.getByRole('button', { name: '预览步骤恢复', exact: true }).click();
  return bodies;
}

test('uncertain recovery retains original request through navigation and repeated rejection', async ({ page }) => {
  const bodies = await recovery(page, [503, 409, 200]);
  await page.getByRole('button', { name: '使用已收结果继续' }).click();
  await expect(page.getByText('提交结果待确认', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重新读取并预览' })).toBeDisabled();
  await page.getByRole('link', { name: '离开步骤恢复' }).click();
  const guard = page.getByRole('dialog', { name: '请先完成当前操作' });
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: '返回处理' }).click();
  await expect(page).toHaveURL('/guard/recovery');
  await page.getByRole('button', { name: '父级重绘' }).click();
  await page.getByRole('button', { name: '重试原恢复请求' }).click();
  await expect(page.getByText('提交结果待确认', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重试原恢复请求' }).click();
  await expect(page.getByRole('button', { name: '预览步骤恢复' })).toBeVisible();
  expect(bodies).toHaveLength(3);
  expect(new Set(bodies).size).toBe(1);
  await page.getByRole('link', { name: '离开步骤恢复' }).click();
  await expect(page).toHaveURL('/guard/link');
});

test('first definite rejection retains reason and permits a new preview', async ({ page }) => {
  await recovery(page, [409]);
  await page.getByRole('button', { name: '使用已收结果继续' }).click();
  await expect(page.getByRole('textbox', { name: '业务步骤恢复原因' })).toHaveValue('后续人员配置已修复');
  await expect(page.getByRole('button', { name: '预览步骤恢复' })).toBeEnabled();
  await expect(page.getByText('提交结果待确认', { exact: true })).toHaveCount(0);
});

test('host refresh failure preserves confirmed success on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bodies = await recovery(page, []);
  await page.getByRole('button', { name: '模拟刷新失败' }).click();
  await page.getByRole('button', { name: '使用已收结果继续' }).click();
  await expect(page.getByText('恢复操作已成功，但页面刷新失败', { exact: true })).toBeVisible();
  await expect(page.getByText('提交结果待确认', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重试原恢复请求' })).toHaveCount(0);
  expect(bodies).toHaveLength(1);
  await page.getByRole('link', { name: '离开步骤恢复' }).click();
  await expect(page).toHaveURL('/guard/link');
});
