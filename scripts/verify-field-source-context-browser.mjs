import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as portProbe } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..');
const web = createRequire(resolve(root, 'templates/application/apps/web/package.json'));
const { chromium, expect } = web('@playwright/test');
const output = resolve(process.env.OPENXIANGDA_LOOKUP_EVIDENCE_DIR || resolve(root, '.cache/field-source-contexts'));
mkdirSync(output, { recursive: true });
let server, browser;
let baseURL = process.env.OPENXIANGDA_LOOKUP_BASE_URL;
const checks = [], errors = [];
try {
  if (!baseURL) {
    const port = await new Promise((accept, reject) => { const probe = portProbe(); probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => accept(port)); }); });
    const { createServer } = await import(pathToFileURL(web.resolve('vite')));
    server = await createServer({ configFile: resolve(root, 'scripts/fixtures/platform-browser/vite.field-source-contexts.config.ts'),
      server: { port, host: '127.0.0.1' }, logLevel: 'error' });
    await server.listen(); baseURL = `http://127.0.0.1:${port}`;
  }
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    const record = { id: '11111111-1111-4111-8111-111111111111', expectedRevision: 5 };
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(baseURL).origin) { errors.push(`Unexpected external origin: ${url.origin}`); return route.abort(); }
      if (!url.pathname.startsWith('/service/')) return route.continue();
      const body = request.method() === 'POST' ? request.postDataJSON() : undefined;
      requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), body });
      let data;
      if (url.pathname.endsWith('/auth/surface')) data = { csrfToken: 'fixture-csrf' };
      else if (url.pathname.includes('/directory/users')) data = { schemaVersion: 'openxiangda.directory-entry-page/v2', kind: 'user',
        items: [{ id: 'former-user', label: '李老师', selectable: true, inactive: true, snapshot: { label: '李老师', value: 'former-user' } }], nextCursor: null };
      else if (url.pathname.endsWith('/source/query')) data = { schemaVersion: 'openxiangda.data-field-source-page/v2', operation: body.operation,
        resourceCode: 'orders', fieldCode: 'customer', sourceResourceCode: 'customers', environment: {},
        items: body.bindings?.team === null ? [] : [{ label: body.operation === 'filter' ? '停用历史项目' : body.bindings?.team ? '新范围候选' : '保存范围候选',
          value: '22222222-2222-4222-8222-222222222222', resourceCode: 'customers' }], nextCursor: null };
      else { errors.push(`Unexpected platform request: ${url.pathname}`); return route.abort(); }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data }) });
    });
    try {
      await page.goto(`${baseURL}/field-source-contexts.e2e.html${width === 390 ? '?mobile=1' : ''}`);
      const filter = page.locator('[data-reference-filter]').getByRole('combobox');
      await filter.click();
      await expect.poll(() => requests.find(item => item.body?.operation === 'filter')?.body).toEqual({
        schemaVersion: 'openxiangda.data-field-source-query/v2', operation: 'filter', environmentKey: 'preproduction' });
      await page.getByText('停用历史项目', { exact: true }).click();
      const member = page.locator('[data-directory-filter]').getByRole('combobox'); await member.fill('李');
      await expect(page.locator('.ant-select-dropdown').getByText('已停用', { exact: false })).toBeVisible();
      assert.equal(requests.find(item => item.path.includes('/directory/users'))?.query.purpose, 'filter');
      await page.locator('.ant-select-dropdown').getByText('李老师', { exact: true }).click();
      const openRecord = async () => width === 390
        ? page.locator('[data-record-form] .oxa-mobile-field-trigger button').first().click()
        : page.locator('[data-record-form]').getByRole('combobox').click();
      await openRecord();
      await expect.poll(() => requests.filter(item => item.body?.operation === 'update').at(-1)?.body).toEqual({
        schemaVersion: 'openxiangda.data-field-source-query/v2', operation: 'update', record, environmentKey: 'preproduction' });
      if (width === 390) await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
      else await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '修改绑定', exact: true }).click(); await openRecord();
      await expect.poll(() => requests.filter(item => item.body?.operation === 'update').at(-1)?.body.bindings).toEqual({ team: { label: '新范围', value: 'west' } });
      await expect(page.getByText('新范围候选', { exact: true })).toBeVisible();
      if (width === 390) await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
      else await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '清空绑定', exact: true }).click(); await openRecord();
      await expect.poll(() => requests.filter(item => item.body?.operation === 'update').at(-1)?.body.bindings).toEqual({ team: null });
      if (width === 390) await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
      else await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '切换版本', exact: true }).click(); await openRecord();
      await expect.poll(() => requests.filter(item => item.body?.operation === 'update').at(-1)?.body.record.expectedRevision).toBe(6);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: resolve(output, `lookup-${width}.png`), fullPage: true, animations: 'disabled' });
      checks.push({ width, readFilter: true, historicalDirectory: true, savedRecordContext: true, privateBindingAbsent: true,
        changedAndClearedBindings: true, revisedContext: true, requests });
    } catch (error) {
      await page.screenshot({ path: resolve(output, `failure-${width}.png`), fullPage: true });
      writeFileSync(resolve(output, `failure-${width}.txt`), await page.locator('body').innerText());
      writeFileSync(resolve(output, `failure-${width}.json`), JSON.stringify({ error: String(error), errors, requests }, null, 2)); throw error;
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  writeFileSync(resolve(output, 'receipt.json'), JSON.stringify({ sourceCommit: process.env.OPENXIANGDA_LOOKUP_SOURCE_COMMIT || 'working source',
    verifiedAt: new Date().toISOString(), scope: 'Actual PC/mobile Field Kit and mocked API traffic; no real tenant or business acceptance', checks, errors }, null, 2));
  console.log(JSON.stringify({ output, checks: checks.map(({ requests, ...check }) => check), errors }, null, 2));
} finally { await browser?.close(); await server?.close(); }
