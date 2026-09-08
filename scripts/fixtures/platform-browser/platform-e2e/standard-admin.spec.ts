import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockPlatform } from './resource-platform-mock';

async function chooseOption(page: Page, control: Locator, name: string) {
  await control.click();
  const listId = await control.getAttribute('aria-controls');
  expect(listId).toBeTruthy();
  // Closing overlays can coexist during animation; select only this input's list.
  await page.locator(`[id="${listId}"]`).getByRole('option', { name, exact: true }).click();
}

async function editablePlatform(page: Page, fixtureMode = 'business') {
  const context = page.context();
  await mockPlatform(context, true, undefined, true);
  await context.route(/\/(?:admin|m\/admin)\/resources\//, async route => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const url = new URL(route.request().url()); url.pathname = '/resource-experience.e2e.html'; url.search = `?primary=${fixtureMode}`;
    const response = await route.fetch({ url: url.href }); await route.fulfill({ response });
  });
  const records = Array.from({ length: 21 }, (_, index) => ({
    id: `record-${index + 1}`, revision: 1, name: `业务记录 ${index + 1}`,
    code: `R${index + 1}`, description: '', enabled: true, displayOrder: index,
    created_at: '2026-09-05T00:00:00.000Z', updated_at: '2026-09-05T00:00:00.000Z',
  }));
  const state = {
    records, writes: [] as any[], queries: [] as any[], reads: 0,
    preferences: new Map<string, any>(),
    failNextWrite: false, failReads: false, preference: null as any, failPreference: false, failDraft: false, drafts: [] as any[], draftWrites: [] as any[],
  };
  await context.route('**/native/admin-list/preferences/**', async route => {
    const key = new URL(route.request().url()).pathname;
    if (route.request().method() === 'PUT' && state.failPreference) return route.fulfill({ status: 500, json: { code: 500, message: '设置保存失败' } });
    if (route.request().method() === 'PUT') { state.preference = route.request().postDataJSON(); state.preferences.set(key, state.preference); }
    if (route.request().method() === 'DELETE') { state.preference = null; state.preferences.delete(key); }
    await route.fulfill({ json: { code: 200, data: state.preferences.get(key) || null } });
  });
  await context.route('**/native/form-drafts/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : {};
    const ok = (data: any) => route.fulfill({ json: { code: 200, data } });
    const conflict = () => route.fulfill({ status: 409, json: { code: 409, message: '草稿版本冲突' } });
    if (path.endsWith('/save')) {
      state.draftWrites.push(body);
      if (state.failDraft) return route.fulfill({ status: 500, json: { code: 500, message: '暂存服务暂时不可用' } });
      const current = state.drafts.find(item => item.id === body.id);
      if ((current?.revision || 0) !== body.expectedRevision || (current && (current.viewCode || '') !== (body.viewCode || ''))) return conflict();
      const draft = { ...body, revision: (current?.revision || 0) + 1, updatedAt: '2026-09-05T07:06:00.000Z', expiresAt: '2026-12-04T07:06:00.000Z' };
      state.drafts = [draft, ...state.drafts.filter(item => item.id !== body.id)]; return ok(draft);
    }
    if (path.endsWith('/delete')) { state.drafts = state.drafts.filter(item => item.id !== body.id); return ok({ deleted: true }); }
    if (path.endsWith('/submit')) {
      const draft = state.drafts.find(item => item.id === body.id);
      if (!draft || draft.revision !== body.expectedRevision || (draft.viewCode || '') !== (body.viewCode || '')) return conflict();
      const operation = body.operations[0]; state.writes.push(operation);
      const existing = records.find(item => item.id === operation.id);
      if (existing && existing.revision !== operation.expectedRevision) return conflict();
      const record = existing || { ...records[0], id: `record-${records.length + 1}` };
      Object.assign(record, operation.data, { revision: (existing?.revision || 0) + 1 }); if (!existing) records.push(record);
      state.drafts = state.drafts.filter(item => item.id !== body.id);
      return ok({ items: [{ operation: operation.operation, id: record.id, revision: record.revision }] });
    }
    const query = new URL(route.request().url()).searchParams;
    return ok({ items: state.drafts.filter(item => item.mode === query.get('mode') && (item.recordId || '') === (query.get('recordId') || '') && (item.viewCode || '') === (query.get('viewCode') || '')), limit: 20, retentionDays: 90 });
  });
  await context.route('**/native/data/resource-01/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/query')) {
      const body = request.postDataJSON();
      state.queries.push(body);
      return route.fulfill({ json: { code: 200, data: {
        schemaVersion: 'openxiangda.data-page/v2', resourceCode: 'resource-01',
        items: records.slice(body.offset, body.offset + body.limit), total: records.length,
        offset: body.offset, limit: body.limit,
      } } });
    }
    const recordId = path.match(/\/records\/([^/]+)/)?.[1];
    const current = records.find(record => record.id === recordId);
    if (request.method() === 'GET' && current) {
      state.reads += 1;
      if (state.failReads) {
        return route.fulfill({ status: 500, json: { code: 500, message: '暂时无法读取，请重试' } });
      }
      return route.fulfill({ json: { code: 200, data: { schemaVersion: 'openxiangda.data-record/v2', data: current } } });
    }
    if (request.method() === 'POST' && (path.endsWith('/records') || path.endsWith('/update'))) {
      const body = request.postDataJSON();
      state.writes.push(body);
      if (state.failNextWrite || (current && body.expectedRevision !== current.revision)) {
        state.failNextWrite = false;
        return route.fulfill({ status: 409, json: { code: 409, message: '记录有冲突，请检查后重试' } });
      }
      // Keep the request in flight long enough to exercise double submission.
      await new Promise(resolve => setTimeout(resolve, 350));
      const saved = current || { ...records[0], id: `record-${records.length + 1}` };
      Object.assign(saved, body.data, { revision: current ? current.revision + 1 : 1 });
      if (!current) records.push(saved);
      return route.fulfill({ json: { code: 200, data: { schemaVersion: 'openxiangda.data-record/v2', data: saved } } });
    }
    return route.fallback();
  });
  return state;
}

for (const mobile of [false, true]) {
  for (const auditAllowed of [false, true]) {
    test(`detail history follows authorized metadata (${mobile ? 'mobile' : 'desktop'}, ${auditAllowed})`, async ({page}) => {
      if (mobile) await page.setViewportSize({width:390,height:844});
      const state = await editablePlatform(page);
      for (const row of state.records) {
        if (auditAllowed) Object.assign(row, {created_by:'authorized-actor',updated_by:'authorized-actor'});
        else { delete (row as any).created_at; delete (row as any).updated_at; }
      }
      await page.goto(`${mobile ? '/m' : ''}/admin/resources/resource-01/record-1`);
      await expect(page.locator('.oxa-record-detail-sections')).toBeVisible();
      await expect(page.locator('.oxa-audit-collapse')).toHaveCount(auditAllowed ? 1 : 0);
      if (!auditAllowed) await expect(page.locator('.oxa-record-detail')).not.toContainText('authorized-actor');
    });
  }
}

test('named views share records while keeping columns, drawer routes and drafts separate', async ({ page }, testInfo) => {
  const state = await editablePlatform(page, 'named');
  const base = '/admin/resources/resource-01/views';
  await page.goto(`${base}/quick`);
  await expect(page.getByRole('columnheader', { name: '栏目名称' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '启用状态' })).toHaveCount(0);
  await page.getByRole('button', { name: '显示列', exact: true }).click();
  const settings = page.getByRole('region', { name: '显示列设置' });
  await settings.getByRole('checkbox', { name: '创建时间', exact: true }).check();
  await page.getByRole('button', { name: '显示列', exact: true }).click();
  await page.getByRole('button', { name: '保存显示列配置' }).click();
  await expect(page.getByText('你调整了显示列配置')).toHaveCount(0);
  expect([...state.preferences.keys()]).toHaveLength(1);
  expect(decodeURIComponent([...state.preferences.keys()][0])).toContain(':view:quick');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '新增数据' });
  await expect(drawer.getByRole('heading', { name: '登记信息' })).toBeVisible();
  await expect(drawer.getByLabel('栏目说明', { exact: true })).toHaveCount(0);
  await drawer.getByLabel('栏目名称', { exact: true }).fill('简要登记的草稿');
  await drawer.getByRole('button', { name: '暂存', exact: true }).click();
  await expect.poll(() => state.drafts.length).toBe(1);
  expect(state.drafts[0].viewCode).toBe('quick');
  await drawer.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.oxa-sider').getByText('完整管理', { exact: true }).click();
  await expect(page).toHaveURL(`${base}/complete`);
  await expect(page.getByRole('columnheader', { name: '启用状态' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '创建时间' })).toHaveCount(0);
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(drawer.getByLabel('栏目名称', { exact: true })).toBeEmpty();
  await expect(drawer.getByLabel('栏目说明', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '暂存数据导入' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('named-complete-drawer.png'), animations: 'disabled' });
  await drawer.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.oxa-sider').getByText('简要登记', { exact: true }).click();
  await expect(page.getByRole('columnheader', { name: '创建时间' })).toBeVisible();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByRole('button', { name: '载入草稿' }).click();
  await expect(drawer.getByLabel('栏目名称', { exact: true })).toHaveValue('简要登记的草稿');
  const opened = page.context().waitForEvent('page');
  await drawer.getByRole('button', { name: '新开页面' }).click();
  const nextPage = await opened;
  await expect(nextPage).toHaveURL(/\/views\/quick\/new\?draft=/);
  await expect(nextPage.getByLabel('栏目名称', { exact: true })).toHaveValue('简要登记的草稿');
  await expect(nextPage.getByLabel('栏目说明', { exact: true })).toHaveCount(0);
  await nextPage.screenshot({ path: testInfo.outputPath('named-quick-new-page.png'), fullPage: true, animations: 'disabled' });
  await nextPage.getByRole('button', { name: '提交', exact: true }).click();
  await expect(nextPage).toHaveURL(`${base}/quick/record-22`);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].resourceCode).toBe('resource-01');
  expect(state.records.at(-1)?.name).toBe('简要登记的草稿');
  expect(state.drafts).toHaveLength(0);
});

test('mobile named forms retain their grouping and return to the same view after submit', async ({ page }, testInfo) => {
  const state = await editablePlatform(page, 'named');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/m/admin/resources/resource-01/views/complete/new');
  const form = page.locator('.oxa-mobile-form');
  await expect(form.getByRole('heading', { name: '栏目信息' })).toBeVisible();
  await expect(form.getByRole('heading', { name: '管理设置' })).toBeVisible();
  await expect(page.getByRole('button', { name: '返回列表' })).toHaveCount(0);
  await form.getByRole('textbox', { name: '栏目名称', exact: true }).fill('移动端完整登记');
  await form.getByRole('textbox', { name: '栏目说明', exact: true }).fill('和简要登记共用一份数据');
  await form.getByRole('button', { name: '暂存', exact: true }).click();
  await expect.poll(() => state.drafts.length).toBe(1);
  expect(state.drafts[0].viewCode).toBe('complete');
  await page.reload();
  await page.getByRole('button', { name: '载入草稿' }).click();
  await expect(form.getByRole('textbox', { name: '栏目名称', exact: true })).toHaveValue('移动端完整登记');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('named-mobile-complete-form.png'), fullPage: true, animations: 'disabled' });
  await form.getByRole('button', { name: '提交', exact: true }).click();
  await expect(page).toHaveURL('/m/admin/resources/resource-01/views/complete/record-22');
  expect(state.writes).toHaveLength(1);
  expect(state.drafts).toHaveLength(0);
});

test('uses a collapsible menu and a single list toolbar with optional audit columns', async ({ page }, testInfo) => {
  const state = await editablePlatform(page);
  await page.goto('/resource-experience.e2e.html?primary=business');
  await expect(page.locator('.oxa-list-toolbar')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: '页面访问历史' })).toHaveCount(0);
  await expect(page.locator('.oxa-main h1, .oxa-main h2')).toHaveCount(0);
  const group = page.locator('.ant-menu-submenu-title').filter({ hasText: '数据管理' });
  await group.click();
  await expect(page.locator('.oxa-sider').getByText('内容栏目', { exact: true })).toBeHidden();
  await group.click();
  await expect(page.locator('.oxa-sider').getByText('内容栏目', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '创建时间' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: '栏目名称' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('standard-list.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '显示列', exact: true }).click();
  const settings = page.getByRole('region', { name: '显示列设置' });
  await settings.getByRole('checkbox', { name: '创建时间', exact: true }).check();
  await settings.getByRole('button', { name: '冻结栏目名称', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: '栏目名称' })).toHaveClass(/ant-table-cell-fix-start/);
  await settings.getByRole('button', { name: '上移创建时间' }).click();
  state.failPreference = true;
  await page.getByRole('button', { name: '显示列', exact: true }).click();
  await page.getByRole('button', { name: '保存显示列配置' }).click();
  await expect(page.getByText('你调整了显示列配置')).toBeVisible();
  state.failPreference = false;
  await page.getByRole('button', { name: '保存显示列配置' }).click();
  await expect(page.getByText('你调整了显示列配置')).toHaveCount(0);
  expect(state.preference.columns.find((column: any) => column.key === 'created_at').visible).toBe(true);
  expect(state.preference.columns.find((column: any) => column.key === 'name').fixed).toBe('left');
  await page.reload();
  await expect(page.getByRole('columnheader', { name: '创建时间' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '栏目名称' })).toHaveClass(/ant-table-cell-fix-start/);
  await page.getByRole('button', { name: '显示列', exact: true }).click();
  await settings.getByRole('button', { name: '恢复默认' }).click();
  await expect(page.getByRole('columnheader', { name: '创建时间' })).toHaveCount(0);

});

test('grouped drawer validates, preserves input after failure and refreshes the same list after one retry', async ({ page }, testInfo) => {
  const state = await editablePlatform(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/resource-experience.e2e.html?primary=business');
  const search = page.getByRole('searchbox', { name: '搜索数据' });
  await search.fill('业务');
  await search.press('Enter');
  await page.locator('.ant-pagination-item-2').click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '新增数据' });
  await expect(drawer.getByRole('heading', { name: '栏目设置' })).toBeVisible();
  await expect(drawer.getByRole('heading', { name: '管理信息' })).toBeVisible();
  await expect(drawer.locator('.oxa-section-card')).toHaveCount(0);
  await drawer.getByRole('button', { name: '提交', exact: true }).click();
  await expect(drawer.locator('.ant-form-item-explain-error')).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await drawer.getByLabel('栏目名称', { exact: true }).fill('业务新增记录');
  await drawer.getByLabel('栏目编码', { exact: true }).fill('NEW-1');
  await drawer.getByLabel('栏目说明', { exact: true }).fill('失败后仍保留的内容');
  await expect(drawer.locator('.ant-form-item-explain-error')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('standard-grouped-drawer.png'), animations: 'disabled' });
  state.failNextWrite = true;
  await drawer.getByRole('button', { name: '提交', exact: true }).click();
  await expect(drawer.getByText('保存失败', { exact: true })).toBeVisible();
  await expect(drawer.getByLabel('栏目名称', { exact: true })).toHaveValue('业务新增记录');
  await expect(drawer.getByLabel('栏目说明', { exact: true })).toHaveValue('失败后仍保留的内容');
  await drawer.getByRole('button', { name: '提交', exact: true }).dblclick({ delay: 30 });
  await expect(drawer).toBeHidden();
  expect(state.writes).toHaveLength(2);
  expect(state.records.at(-1)?.name).toBe('业务新增记录');
  await expect(search).toHaveValue('业务');
  await expect(page.locator('.ant-pagination-item-2')).toHaveClass(/ant-pagination-item-active/);
  await expect.poll(() => state.queries.at(-1)?.offset).toBe(10);
  expect(JSON.stringify(state.queries.at(-1)?.where)).toContain('业务');
  expect(errors).toEqual([]);
});

test('drawer full screen preserves input, close discards edits and new page restores a saved draft', async ({ page }, testInfo) => {
  const state = await editablePlatform(page);
  await page.goto('/resource-experience.e2e.html?primary=business');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  let drawer = page.getByRole('dialog', { name: '新增数据' });
  await drawer.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(drawer).toBeHidden();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  drawer = page.getByRole('dialog', { name: '新增数据' });
  await drawer.getByLabel('栏目名称', { exact: true }).fill('新页面继续填写');
  await drawer.getByRole('button', { name: '全屏', exact: true }).click();
  await expect.poll(async () => (await drawer.boundingBox())!.width).toBe(page.viewportSize()!.width);
  await drawer.getByRole('button', { name: '退出全屏', exact: true }).click();
  await drawer.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: '继续填写' })).toHaveCount(0);
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await drawer.getByLabel('栏目名称', { exact: true }).fill('新页面继续填写');
  const opened = page.context().waitForEvent('page');
  await drawer.getByRole('button', { name: '新开页面' }).click();
  const nextPage = await opened;
  await expect(nextPage).toHaveURL(/\/admin\/resources\/resource-01\/new\?draft=/);
  await expect(nextPage.locator('.oxa-topbar, .oxa-sider')).toHaveCount(0);
  await expect(nextPage.locator('.oxa-independent-form-header')).toContainText('内容栏目');
  await expect(nextPage.getByLabel('栏目名称', { exact: true })).toHaveValue('新页面继续填写');
  await expect(drawer).toBeHidden();
  expect(state.writes).toHaveLength(0);
  expect(state.drafts).toHaveLength(1);
  await nextPage.screenshot({ path: testInfo.outputPath('standard-new-page-draft.png'), fullPage: true, animations: 'disabled' });
  await nextPage.getByRole('button', { name: '提交', exact: true }).click();
  await expect(nextPage).toHaveURL('/admin/resources/resource-01/record-22');
  expect(state.writes).toHaveLength(1); expect(state.drafts).toHaveLength(0);
});

test('record reads can retry and reconnect refresh does not overwrite an edit or its revision', async ({ page }) => {
  const state = await editablePlatform(page);
  await page.goto('/resource-experience.e2e.html?primary=business');
  state.failReads = true;
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  const drawer = page.getByRole('dialog', { name: '编辑数据' });
  await expect(drawer.getByText('数据读取失败', { exact: true })).toBeVisible();
  state.failReads = false;
  await drawer.getByRole('button', { name: '重试' }).click();
  await expect(drawer.getByLabel('栏目名称', { exact: true })).toHaveValue('业务记录 1');
  await drawer.getByLabel('栏目名称', { exact: true }).fill('我的修改');
  state.records[0].name = '另一个用户的修改';
  state.records[0].revision = 2;
  const reads = state.reads;
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await expect.poll(() => state.reads).toBeGreaterThan(reads);
  await expect(drawer.getByLabel('栏目名称', { exact: true })).toHaveValue('我的修改');
  await drawer.getByRole('button', { name: '保存' }).click();
  await expect(drawer.getByText('保存失败', { exact: true })).toBeVisible();
  expect(state.writes.at(-1).expectedRevision).toBe(1);
  await expect(drawer.getByLabel('栏目名称', { exact: true })).toHaveValue('我的修改');
});

test('mobile grouped entry keeps one column and saves through the same Data API', async ({ page }, testInfo) => {
  const state = await editablePlatform(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/resource-experience.e2e.html?primary=business');
  await page.evaluate(() => {
    history.pushState({}, '', '/m/admin/resources/resource-01/new');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const form = page.locator('.oxa-mobile-form');
  await expect(form.getByRole('heading', { name: '栏目设置' })).toBeVisible();
  await expect(page.getByRole('button', { name: '返回列表' })).toHaveCount(0);
  await expect(form.getByRole('button', { name: '取消', exact: true })).toHaveCount(0);
  await form.getByRole('textbox', { name: '栏目名称', exact: true }).fill('移动端新增记录');
  await form.getByRole('textbox', { name: '栏目说明', exact: true }).fill('使用平台移动输入组件');
  expect(await form.locator('.oxa-grid').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('standard-mobile-form.png'), animations: 'disabled' });
  await form.getByRole('button', { name: '提交', exact: true }).click();
  await expect(page).toHaveURL('/m/admin/resources/resource-01/record-22');
  expect(state.writes).toHaveLength(1);
  expect(state.records.at(-1)?.name).toBe('移动端新增记录');
  expect(errors).toEqual([]);
});

test('advanced grouped conditions, multiple sort priorities and selection-only actions work together', async ({ page }, testInfo) => {
  const state = await editablePlatform(page);
  await page.goto('/resource-experience.e2e.html?primary=business');
  await expect(page.getByRole('button', { name: /发布选中/ })).toHaveCount(0);
  await page.locator('tbody').getByRole('checkbox').first().check();
  await expect(page.getByRole('button', { name: '发布选中栏目（1）' })).toBeVisible();
  await page.locator('tbody').getByRole('checkbox').first().uncheck();
  await expect(page.getByRole('button', { name: /发布选中/ })).toHaveCount(0);
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  const filter = page.getByRole('dialog', { name: '筛选' });
  await filter.getByText('满足任一', { exact: true }).click();
  await filter.getByRole('button', { name: '添加条件', exact: true }).click();
  await filter.getByPlaceholder('筛选栏目名称').fill('记录 1');
  await filter.getByRole('button', { name: '添加分组', exact: true }).click();
  const nested = filter.locator('.oxa-condition-nested');
  await chooseOption(page, nested.getByRole('combobox', { name: '筛选字段' }), '启用状态');
  await nested.locator('.oxa-condition-value').getByRole('combobox').click();
  await page.locator('.ant-select-dropdown:visible').getByText('否', { exact: true }).click();
  await nested.getByRole('button', { name: '添加条件', exact: true }).click();
  await chooseOption(page, nested.getByRole('combobox', { name: '筛选字段' }).nth(1), '显示顺序');
  await nested.getByRole('spinbutton').fill('0');
  await page.screenshot({ path: testInfo.outputPath('advanced-condition-groups.png'), animations: 'disabled' });
  await filter.getByRole('button', { name: '应用筛选' }).click();
  await expect.poll(() => state.queries.at(-1)?.where).toEqual({ and: [{ or: [
    { field: 'name', operator: 'contains', value: '记录 1' },
    { and: [{ field: 'enabled', operator: 'eq', value: false }, { field: 'displayOrder', operator: 'eq', value: 0 }] },
  ] }] });
  await page.getByRole('button', { name: '排序', exact: true }).click();
  const sort = page.getByRole('region', { name: '排序设置' });
  await sort.getByRole('button', { name: '清空', exact: true }).click();
  await sort.getByRole('button', { name: '添加排序规则' }).click();
  await chooseOption(page, sort.getByRole('combobox', { name: '第1排序字段' }), '栏目名称');
  await sort.getByText('降序', { exact: true }).click();
  await sort.getByRole('button', { name: '添加排序规则' }).click();
  await chooseOption(page, sort.getByRole('combobox', { name: '第2排序字段' }), '显示顺序');
  await page.screenshot({ path: testInfo.outputPath('multiple-sort-rules.png'), animations: 'disabled' });
  await sort.getByRole('button', { name: '确定', exact: true }).click();
  await expect.poll(() => state.queries.at(-1)?.order).toEqual([{ field: 'name', direction: 'desc' }, { field: 'displayOrder', direction: 'asc' }]);
  const exported = page.waitForRequest(request => request.url().includes('/export'));
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const body = (await exported).postDataJSON(); expect(body.where).toEqual(state.queries.at(-1).where); expect(body.order).toEqual(state.queries.at(-1).order);
});

test('partial draft save failure retains input; PC draft box resumes and deletes', async ({ page }, testInfo) => {
  const state = await editablePlatform(page);
  await page.goto('/resource-experience.e2e.html?primary=business');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  let drawer = page.getByRole('dialog', { name: '新增数据' });
  await drawer.getByLabel('栏目说明', { exact: true }).fill('必填项尚未完成也可暂存');
  state.failDraft = true;
  await drawer.getByRole('button', { name: '暂存', exact: true }).click();
  await expect(drawer.getByText(/暂存服务暂时不可用/)).toBeVisible();
  await expect(drawer.getByLabel('栏目说明', { exact: true })).toHaveValue('必填项尚未完成也可暂存');
  state.failDraft = false;
  await drawer.getByRole('button', { name: '暂存', exact: true }).click();
  await expect(drawer.getByText('已暂存，可从草稿箱继续编辑')).toBeVisible();
  expect(state.writes).toHaveLength(0); expect(state.drafts).toHaveLength(1);
  await drawer.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  drawer = page.getByRole('dialog', { name: '新增数据' });
  await page.getByRole('button', { name: '载入草稿' }).click();
  await expect(drawer.getByLabel('栏目说明', { exact: true })).toHaveValue('必填项尚未完成也可暂存');
  await drawer.getByRole('button', { name: '草稿箱', exact: true }).click();
  const box = page.getByRole('dialog', { name: /草稿箱/ });
  await expect(box.getByRole('button', { name: '继续编辑' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop-draft-box.png'), animations: 'disabled' });
  await box.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '删除草稿', exact: true }).click();
  await expect(box.getByRole('button', { name: '继续编辑' })).toHaveCount(0);
  expect(state.drafts).toHaveLength(0);
});

test('mobile partial drafts restore from a bottom sheet and submit once', async ({ page }, testInfo) => {
  const state = await editablePlatform(page);
  await page.addInitScript(() => { Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/resource-experience.e2e.html?primary=business');
  await page.evaluate(() => { history.pushState({}, '', '/m/admin/resources/resource-01/new'); window.dispatchEvent(new PopStateEvent('popstate')); });
  const form = page.locator('.oxa-mobile-form');
  await form.getByRole('textbox', { name: '栏目说明', exact: true }).fill('手机暂存内容');
  await form.getByRole('button', { name: '暂存', exact: true }).click();
  await expect(page.getByText('已暂存，可从草稿箱继续编辑')).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page.reload();
  const prompt = page.getByRole('dialog', { name: '载入暂存数据' });
  await expect(prompt).toBeVisible();
  await expect.poll(async () => { const box = await prompt.boundingBox(); return box ? Math.abs(box.y + box.height - 844) : Infinity; }).toBeLessThan(2);
  expect(await prompt.locator('xpath=..').evaluate(el => el.className)).not.toContain('ant-modal');
  await page.screenshot({ path: testInfo.outputPath('mobile-draft-restore.png'), animations: 'disabled' });
  await prompt.getByRole('button', { name: '载入草稿' }).click();
  await expect(form.getByRole('textbox', { name: '栏目说明', exact: true })).toHaveValue('手机暂存内容');
  await page.getByRole('button', { name: /^草稿箱/ }).click();
  const draftBox = page.getByRole('dialog', { name: /草稿箱/ });
  await expect(draftBox.locator('.oxa-draft-card')).toBeVisible();
  await expect.poll(async () => { const box = await draftBox.boundingBox(); return box ? Math.abs(box.y + box.height - 844) : Infinity; }).toBeLessThan(2);
  await expect(draftBox.getByRole('button', { name: '继续编辑' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('mobile-draft-box.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '关闭弹层' }).click();
  await form.getByRole('textbox', { name: '栏目名称', exact: true }).fill('手机恢复后提交');
  await form.getByRole('button', { name: '提交', exact: true }).click();
  await expect(page).toHaveURL('/m/admin/resources/resource-01/record-22');
  expect(state.writes).toHaveLength(1); expect(state.drafts).toHaveLength(0);
});

test('direct entry is independent and adapts desktop URLs to touch controls without losing values', async ({ page }) => {
  await editablePlatform(page);
  await page.goto('/admin/resources/resource-01/new');
  await expect(page.locator('.oxa-sider, .oxa-topbar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返回列表' })).toHaveCount(0);
  await page.getByRole('textbox', { name: /栏目名称/ }).fill('保留未暂存输入');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.oxa-mobile-form')).toBeVisible();
  await expect(page.locator('.oxa-mobile-entry')).toBeVisible();
  await expect(page.locator('.oxa-mobile-entry')).toHaveCSS('padding-left', '0px');
  const header = await page.locator('.oxa-mobile-header').boundingBox();
  const entry = await page.locator('.oxa-mobile-entry').boundingBox();
  expect(header?.x).toBe(entry?.x); expect(header?.width).toBe(entry?.width);
  await expect(page.getByRole('button', { name: /^草稿箱/ })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /栏目名称/ })).toHaveValue('保留未暂存输入');
  await expect(page.locator('.oxa-sider, .oxa-topbar')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.oxa-form-full')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /栏目名称/ })).toHaveValue('保留未暂存输入');
});

test('details open readonly in a drawer and closing unsaved entry has no confirmation or write', async ({ page }, testInfo) => {
  const state = await editablePlatform(page);
  await page.goto('/resource-experience.e2e.html?primary=business');
  const initialUrl = page.url();
  await page.getByRole('button', { name: '查看', exact: true }).first().click();
  const detail = page.getByRole('dialog', { name: '内容栏目详情' });
  await expect(detail).toBeVisible();
  await expect(detail.locator('.oxa-record-detail-sections')).toBeVisible();
  await expect(detail.getByRole('heading', { name: '业务记录 1', exact: true })).toBeVisible();
  await expect(detail.getByRole('textbox')).toHaveCount(0);
  await expect(detail.getByRole('button', { name: '提交', exact: true })).toHaveCount(0);
  expect(page.url()).toBe(initialUrl);
  await expect(detail).toHaveCSS('width', '850px');
  await page.screenshot({ path: testInfo.outputPath('ordinary-detail-drawer-850.png'), animations: 'disabled' });
  await detail.getByRole('button', { name: '编辑', exact: true }).first().click();
  const edit = page.getByRole('dialog', { name: '编辑数据' });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(edit.locator('.oxa-record-detail.is-editing')).toBeVisible();
  await edit.getByLabel('栏目名称', { exact: true }).fill('普通原地编辑');
  await page.screenshot({ path: testInfo.outputPath('ordinary-detail-inline-edit.png'), animations: 'disabled' });
  await edit.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading', { name: '业务记录 1', exact: true })).toBeVisible();
  expect(page.url()).toBe(initialUrl);
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  const entry = page.getByRole('dialog', { name: '新增数据' });
  await entry.getByRole('textbox', { name: /栏目名称/ }).fill('不保存的输入');
  await entry.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(entry).toHaveCount(0);
  await expect(page.getByText('放弃未暂存的修改？', { exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  expect(state.draftWrites).toHaveLength(0);
});


test('edit uses current record without prompting for an existing saved draft', async ({ page }) => {
  const state = await editablePlatform(page);
  state.drafts.push({id:'edit-draft', mode:'update', recordId:'record-1', revision:1, recordRevision:1, values:{name:'旧草稿'}, updatedAt:'2026-09-05T07:06:00.000Z'});
  await page.goto('/admin/resources/resource-01/record-1/edit');
  await expect(page.getByRole('textbox', {name:/栏目名称/})).toHaveValue('业务记录 1');
  await expect(page.getByRole('dialog', {name:'载入暂存数据'})).toHaveCount(0);
  await page.getByRole('button', {name:'草稿箱', exact:true}).click();
  await expect(page.getByRole('dialog', {name:/草稿箱/})).toContainText('旧草稿');
});
