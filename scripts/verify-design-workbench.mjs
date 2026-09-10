import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const web = createRequire(resolve(root, 'templates/application/apps/web/package.json'));
const { createServer } = await import(pathToFileURL(web.resolve('vite')));
const { chromium, expect } = web('@playwright/test');
const output = resolve(process.env.OPENXIANGDA_DESIGN_EVIDENCE_DIR || resolve(root, '.cache/design-workbench-evidence'));
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: resolve(root, 'scripts/fixtures/design-workbench/vite.config.mjs'), server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
let browser;
const checks = [];
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const url = server.resolvedUrls.local[0];
  async function pageAt(viewport, path = '') {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}${path}`, { waitUntil: 'networkidle' });
    return page;
  }
  async function screenshot(page, name, fullPage = true) {
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage, animations: 'disabled' });
  }
  async function scenario(page, label) {
    const details = page.locator('details');
    if (await details.getAttribute('open') === null) await page.locator('summary').click();
    await page.getByRole('combobox', { name: '状态演练' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: label }).click();
  }
  const desktop = await pageAt({ width: 1440, height: 1080 });
  await expect(desktop.getByRole('heading', { name: '把每一件事，办妥。' })).toBeVisible();
  assert.equal(await desktop.locator('vite-error-overlay').count(), 0);
  await screenshot(desktop, 'desktop');
  await desktop.getByRole('textbox', { name: '搜索事项' }).fill('没有匹配的事项');
  await expect(desktop.getByText('没有找到“没有匹配的事项”')).toBeVisible();
  await desktop.getByRole('button', { name: '查看全部示例' }).click();
  await scenario(desktop, '载入失败');
  await expect(desktop.getByText('事项暂时无法载入')).toBeVisible();
  await desktop.getByRole('button', { name: '重新加载' }).click();
  await scenario(desktop, '无权限');
  await expect(desktop.getByText('暂时没有查看权限')).toBeVisible();
  await expect(desktop.getByRole('button', { name: '填写办理记录', exact: true })).toBeDisabled();
  await desktop.getByRole('button', { name: '返回可访问示例' }).click();
  await scenario(desktop, '长标题');
  await expect.poll(() => desktop.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await scenario(desktop, '保存失败');
  await desktop.getByRole('button', { name: '填写办理记录', exact: true }).click();
  const title = desktop.getByPlaceholder('请输入事项名称');
  await title.fill('');
  await desktop.getByRole('button', { name: '保存办理记录', exact: true }).click();
  await expect(desktop.getByText('请填写或选择事项名称')).toBeVisible();
  await title.fill('更新后的示例事项');
  await desktop.getByPlaceholder('请输入办理说明').fill('浏览器验证填写，失败必须保留这段说明。');
  await desktop.getByRole('button', { name: '保存办理记录', exact: true }).click();
  await expect(title).toBeDisabled();
  await expect(desktop.getByText('演练服务暂时不可用，输入已保留。恢复示例服务后可再次提交。')).toBeVisible();
  await expect(title).toHaveValue('更新后的示例事项');
  await screenshot(desktop, 'form-recovery', false);
  assert.ok(await desktop.locator('.ant-drawer').evaluate(node => Boolean(node.closest('.design-workbench'))));
  await desktop.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(desktop.locator('.ant-modal-confirm-title')).toHaveText('放弃未保存的内容？');
  assert.ok(await desktop.locator('.ant-modal-root').evaluate(node => Boolean(node.closest('.design-workbench'))));
  await desktop.getByRole('button', { name: '继续填写', exact: true }).click();
  await expect(title).toHaveValue('更新后的示例事项');
  await desktop.getByRole('button', { name: '恢复示例服务', exact: true }).click();
  await desktop.getByRole('button', { name: '保存办理记录', exact: true }).click();
  await expect(desktop.getByText('示例记录已保存', { exact: true })).toBeVisible();
  await expect(desktop.getByRole('heading', { name: '更新后的示例事项', exact: true })).toBeVisible();
  checks.push('PC list/search/empty/load error/denied/long title/validation/pending/recovery/unsaved input/submit');

  const mobile = await pageAt({ width: 390, height: 844 });
  await expect(mobile.getByRole('heading', { name: '我的事项', exact: true })).toBeVisible();
  await screenshot(mobile, 'mobile-list');
  await mobile.locator('.record').first().click();
  await expect(mobile.getByRole('heading', { name: '更新项目协作信息', exact: true })).toBeVisible();
  await screenshot(mobile, 'mobile-detail');
  await mobile.getByRole('button', { name: '返回事项', exact: true }).click();
  await expect(mobile.getByRole('heading', { name: '我的事项', exact: true })).toBeVisible();
  await mobile.locator('.record').first().click();
  await mobile.getByRole('button', { name: '填写办理记录', exact: true }).click();
  await mobile.getByRole('textbox', { name: '事项名称', exact: true }).fill('移动办理验证');
  await mobile.getByRole('button', { name: '选择优先级', exact: true }).click();
  await expect(mobile.getByRole('dialog', { name: '选择优先级', exact: true })).toBeVisible();
  assert.ok(await mobile.locator('.adm-popup-body').evaluate(node => Boolean(node.closest('.design-workbench .oxa-mobile-scope'))));
  await mobile.getByText('优先处理', { exact: true }).click();
  await mobile.getByRole('button', { name: '确定', exact: true }).click();
  await expect(mobile.getByRole('dialog', { name: '选择优先级', exact: true })).toBeHidden();
  await screenshot(mobile, 'mobile-form', false);
  await expect.poll(() => mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await mobile.getByRole('button', { name: '保存办理记录', exact: true }).click();
  await expect(mobile.getByText('示例记录已保存', { exact: true })).toBeVisible();
  checks.push('Mobile list/detail/back, real mobile fields, option sheet scope, save, no horizontal overflow');

  const probe = await pageAt({ width: 1200, height: 800 }, '?provider-probe=1');
  const owned = probe.getByRole('region', { name: '被测应用' });
  const neighbor = probe.getByRole('region', { name: '相邻应用' });
  await owned.getByRole('textbox', { name: '保留输入' }).fill('正在填写的内容');
  const baseline = await neighbor.getByLabel('实际主色').textContent();
  const mobileColor = surface => surface.getByRole('button', { name: '移动主操作' }).evaluate(node => getComputedStyle(node).backgroundColor);
  const mobileBaseline = await mobileColor(neighbor);
  await probe.getByRole('button', { name: '更换视觉参数' }).click();
  await expect(owned.getByRole('textbox', { name: '保留输入' })).toHaveValue('正在填写的内容');
  await expect(owned.getByLabel('实际主色')).toHaveText('#245a49');
  await expect(neighbor.getByLabel('实际主色')).toHaveText(baseline);
  assert.equal(await mobileColor(owned), 'rgb(36, 90, 73)');
  assert.equal(await mobileColor(neighbor), mobileBaseline);
  await owned.getByRole('combobox', { name: '作用域选项' }).click();
  await expect(owned.locator('.ant-select-dropdown')).toBeVisible();
  await probe.getByText('作用域内选项', { exact: true }).last().click();
  await owned.getByRole('button', { name: '打开确认' }).click();
  await expect(owned.getByRole('dialog', { name: '作用域确认', exact: true })).toBeVisible();
  assert.equal(await owned.getByRole('dialog', { name: '作用域确认', exact: true }).evaluate(node => getComputedStyle(node).getPropertyValue('--probe-marker').trim()), 'owned');
  await owned.getByRole('button', { name: '确认操作', exact: true }).click();
  await owned.getByRole('button', { name: '显示消息' }).click();
  await expect(owned.getByText('作用域消息')).toBeVisible();
  await owned.getByRole('button', { name: '显示通知' }).click();
  await expect(owned.getByText('作用域通知')).toBeVisible();
  await probe.getByRole('button', { name: '更换视觉参数' }).click();
  await expect(owned.getByRole('textbox', { name: '保留输入' })).toHaveValue('正在填写的内容');
  await expect(owned.getByLabel('实际主色')).toHaveText(baseline);
  assert.equal(await mobileColor(owned), mobileBaseline);
  assert.equal(await probe.locator('body').evaluate(node => getComputedStyle(node).getPropertyValue('--probe-marker')), '');
  checks.push('Default/custom/default theme preserves input; select/modal/message/notification stay scoped; neighboring app and body unchanged');
  assert.deepEqual(errors, [], 'Browser errors');
  const report = { schema: 'openxiangda.design-sample-verification/v1', verifiedAt: new Date().toISOString(), checks, browserErrors: errors,
    screenshots: ['desktop', 'form-recovery', 'mobile-list', 'mobile-detail', 'mobile-form'],
    scope: 'Local component and design integration only; no remote business or user visual approval claimed' };
  writeFileSync(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
