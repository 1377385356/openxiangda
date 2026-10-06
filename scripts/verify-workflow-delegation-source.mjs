import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createFreePortProbe } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Source-only component verification. Reuse the installed web-template tools,
// without publishing packages, activating an app or contacting a platform.
const root = resolve(import.meta.dirname, '..');
const web = createRequire(resolve(root, 'templates/application/apps/web/package.json'));
const { createServer } = await import(pathToFileURL(web.resolve('vite')));
const { chromium, expect } = web('@playwright/test');
const output = resolve(root, '.cache/workflow-delegation-source');
mkdirSync(output, { recursive: true });
const port = await new Promise((accept, reject) => {
  const probe = createFreePortProbe();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => accept(port));
  });
});
const server = await createServer({
  configFile: resolve(root, 'scripts/fixtures/platform-browser/vite.delegation-source.config.ts'),
  server: { port, host: '127.0.0.1' }, logLevel: 'error',
});
const source = 'membership:9aad8f64-d7b6-4488-9f37-9c9cafb7746c';
const target = 'membership:442e91ba-5a51-43a1-9ac4-94dc655f1e49';
const catalog = {
  appCode: 'delegation-fixture', environmentKey: 'preproduction', actorUserId: 'actor', canReadAll: false, canCreate: true,
  evaluatedAt: '2026-10-06T00:00:00Z', taskPolicy: 'future-assignments-only',
  workflows: [{ code: 'one', title: '工作证补办' }, { code: 'two', title: '继续教育' }],
  sources: [{ roleSubjectKey: source, roleSubjectRevision: 1, roleCode: 'reviewer', roleName: '人事审核', validFrom: null, validTo: null,
    nodeScopes: [{ workflowCode: 'one', nodeId: 'review', title: '人事初审' }, { workflowCode: 'one', nodeId: 'final', title: '人事终审' }, { workflowCode: 'two', nodeId: 'review', title: '继续教育初审' }] }],
};
let browser;
const checks = [], errors = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== `http://127.0.0.1:${port}`) {
        errors.push(`Unexpected external request: ${url.origin}`);
        return route.abort();
      }
      if (!url.pathname.startsWith('/service/')) return route.continue();
      const body = route.request().postDataJSON();
      requests.push({ path: url.pathname, query: url.searchParams, body });
      let data;
      if (url.pathname.endsWith('/catalog')) data = catalog;
      else if (url.pathname.endsWith('/candidates')) data = { items: [{ userId: 'delegate', displayName: '代理甲', roleSubjectKey: target, roleSubjectRevision: 1, roleCode: 'reviewer', roleName: '人事审核', validFrom: null, validTo: null }], total: 1, limit: 20, offset: 0, evaluatedAt: catalog.evaluatedAt };
      else if (url.pathname.endsWith('/auth/surface')) data = { csrfToken: 'fixture-csrf' };
      else if (url.pathname.endsWith('/preview')) data = { schemaVersion: 'openxiangda.workflow-delegation-preview/v2', operation: 'create', operationId: body.operationId, requestDigest: 'a'.repeat(64), before: null,
        after: { ...body, id: null, delegatorDisplayName: '申请甲', delegateDisplayName: '代理甲', roleName: '人事审核' }, taskPolicy: 'future-assignments-only' };
      else if (url.pathname.endsWith('/delegation-management')) data = { items: [], total: 0, limit: 20, offset: 0, evaluatedAt: catalog.evaluatedAt };
      else {
        errors.push(`Unexpected platform request: ${url.pathname}`);
        return route.abort();
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data }) });
    });
    try {
      await page.goto(`http://127.0.0.1:${port}/workflow-delegation.e2e.html`);
      await page.getByRole('button', { name: '设置我的代理', exact: true }).click();
      const node = page.getByRole('combobox', { name: '设置代理的限定审批节点', exact: true });
      await expect(node).toBeDisabled();
      await page.getByRole('combobox', { name: '设置代理的限定流程', exact: true }).click();
      await page.getByTitle('工作证补办', { exact: true }).click();
      await expect(node).toBeEnabled();
      await node.click();
      await expect(page.getByTitle('继续教育初审', { exact: true })).toHaveCount(0);
      await page.getByTitle('人事终审', { exact: true }).click();
      await expect.poll(() => requests.filter(row => row.path.endsWith('/candidates')).at(-1)?.query.get('nodeId')).toBe('final');
      await page.getByRole('combobox', { name: '选择合法代理人', exact: true }).click();
      await page.getByTitle('代理甲 · 人事审核', { exact: true }).click();
      await page.getByRole('textbox', { name: '代理维护原因', exact: true }).fill('节点代理组件验证');
      await page.getByRole('button', { name: '核对变更', exact: true }).click();
      await expect(page.getByText('核对本次变更', { exact: true })).toBeVisible();
      assert.deepEqual(Object.fromEntries(['workflowCode','nodeId','delegatorRoleSubjectKey','delegateRoleSubjectKey'].map(key => [key, requests.find(row => row.path.endsWith('/preview'))?.body[key]])),
        { workflowCode: 'one', nodeId: 'final', delegatorRoleSubjectKey: source, delegateRoleSubjectKey: target });
      await expect(page.getByText('流程：工作证补办 · 节点：人事终审', { exact: true })).toBeVisible();
      await page.screenshot({ path: resolve(output, `preview-${width}.png`), fullPage: true, animations: 'disabled' });
      await page.getByRole('combobox', { name: '设置代理的限定流程', exact: true }).click();
      await page.getByTitle('继续教育', { exact: true }).click();
      await expect(node).toHaveValue('');
      await expect(page.getByText('核对本次变更', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('combobox', { name: '选择合法代理人', exact: true })).toHaveValue('');
      assert.equal(requests.filter(row => row.path.endsWith('/execute')).length, 0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      checks.push({ width, passed: true, requests: requests.length });
    } catch (error) {
      console.error(JSON.stringify({ width, errors, requests: requests.map(row => row.path) }));
      await page.screenshot({ path: resolve(output, `failure-${width}.png`), fullPage: true });
      writeFileSync(resolve(output, `failure-${width}.txt`), await page.locator('body').innerText());
      throw error;
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, [], 'Browser errors');
  const report = { schema: 'openxiangda.workflow-delegation-source-verification/v1', verifiedAt: new Date().toISOString(), checks, errors,
    scope: 'Real React component, mocked platform requests only; not ordinary-role or business acceptance' };
  writeFileSync(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
