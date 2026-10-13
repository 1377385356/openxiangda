import { test, expect } from '@playwright/test';
import { configurations } from './workflow-conditional-data';

test('opening retains the complete rule without making it dirty, and readonly cannot edit', async ({ page }) => {
  await page.goto('/workflow-conditional.e2e.html');
  await expect(page.getByLabel('规则 1 名称')).toHaveValue('高额');
  await expect(page.getByLabel('配置状态')).toContainText('"dirty":false');
  await page.goto('/workflow-conditional.e2e.html?readonly');
  await expect(page.getByLabel('规则 1 名称')).toBeDisabled();
  await expect(page.getByRole('button', { name: /添加人员规则/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: '保存办理设置' })).toHaveCount(0);
});

test('ordered rules save as a whole and an unknown result retries exactly the original mutation', async ({ page }) => {
  const bodies: any[] = [];
  await page.route('**/node-configurations/review', async route => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: bodies.length === 1 ? 503 : 200, json: bodies.length === 1 ? { code: 'UNAVAILABLE', message: '结果未知' } : { code: 200, data: { revision: 1 } } });
  });
  await page.goto('/workflow-conditional.e2e.html');
  await page.getByRole('button', { name: '下移', exact: true }).first().click();
  await expect(page.getByLabel('规则 1 名称')).toHaveValue('一般');
  await page.getByLabel('修改说明').fill('调整顺序');
  await page.getByRole('button', { name: '保存办理设置' }).click();
  await expect(page.getByLabel('配置状态')).toContainText('"unknown":true');
  await expect(page.getByLabel('规则 1 名称')).toBeDisabled();
  await page.getByRole('button', { name: '保存办理设置' }).click();
  await expect(page.getByLabel('保存回执')).toContainText('"revision":1');
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[0].patch.assignee.cases.map((item: any) => item.label)).toEqual(['一般', '高额']);
  expect(bodies[0].patch.assignee.otherwise).toEqual(configurations.nodes[0].effective.binding.otherwise);
});

test('conflict refresh preserves all local assignment rules rather than merging individual fields', async ({ page }) => {
  const bodies: any[] = [];
  await page.route('**/node-configurations/review', async route => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: bodies.length === 1 ? 409 : 200, json: bodies.length === 1 ? { code: 'WORKFLOW_V2_NODE_CONFIGURATION_REVISION_CONFLICT', message: '已更新' } : { code: 200, data: { revision: 3 } } });
  });
  const newer = structuredClone(configurations); newer.nodes[0].configuration.revision = 2; newer.nodes[0].effective.binding.cases[1].label = '他人的第二条';
  await page.route('**/node-configurations?*', route => route.fulfill({ json: { code: 200, data: newer } }));
  await page.route('**/admin/context?*', route => route.fulfill({ json: { code: 200, data: { headRevision: 2 } } }));
  await page.goto('/workflow-conditional.e2e.html');
  await page.getByLabel('规则 1 名称').fill('我的第一条');
  await page.getByLabel('修改说明').fill('保留整份输入');
  await page.getByRole('button', { name: '保存办理设置' }).click();
  await page.getByRole('button', { name: '载入最新设置并保留输入' }).click();
  await expect(page.getByLabel('规则 1 名称')).toHaveValue('我的第一条');
  await expect(page.getByLabel('规则 2 名称')).toHaveValue('一般');
  await page.getByRole('button', { name: '保存办理设置' }).click();
  await expect(page.getByLabel('保存回执')).toContainText('"revision":3');
  expect(bodies[1].expectedRevision).toBe(2); expect(bodies[1].expectedHeadRevision).toBe(2);
  expect(bodies[1].patch.assignee).toEqual(bodies[0].patch.assignee);
});

test('older platform context does not offer a conditional authoring control', async ({ page }) => {
  await page.goto('/workflow-conditional.e2e.html?old');
  await expect(page.getByRole('radio', { name: '按条件选择' })).toHaveCount(0);
  await expect(page.getByText('当前平台未提供条件编辑上下文，原规则保持不变')).toBeVisible();
  await expect(page.getByLabel('配置状态')).toContainText('"dirty":false');
});
