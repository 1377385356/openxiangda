import { expect, test } from '@playwright/test';
import { mockPlatform } from './resource-platform-mock';
import {
  appCode,
  capabilities,
  resourceCodes,
  resourceDefinitions,
} from '../../../packages/contracts/src/generated.js';

type DeclaredField = { label: string; widget?: string };
type DeclaredResource = {
  name: string;
  surface: {
    fields: Record<string, DeclaredField>;
    list?: { filterFields?: readonly string[] };
    mobile?: { enabled?: boolean };
  };
};

const codes = [...resourceCodes] as string[];
const definitions = resourceDefinitions as Record<string, DeclaredResource>;
const allCapabilities = [...capabilities] as string[];
const runtimeBase = `/view/${appCode}`;

const semanticResourceItem = {
  id: 'group-1',
  name: '组织信息演示',
  revision: 1,
  updated_at: '2026-08-28T01:00:00.000Z',
  departmentMultiple: [
    { label: '信息技术部', value: 'department-it' },
    { label: '人文艺术部', value: 'department-humanities' },
  ],
  departmentSingle: { label: '校工会', value: 'department-union' },
  userMultiple: [
    { label: '周明远', value: 'user-zhou', employeeNo: 'T1001' },
    { label: '沈书雅', value: 'user-shen', employeeNo: 'T1002' },
  ],
  resourceMultiple: [
    { label: '教职工之家', value: 'resource-home', resourceCode: 'resource-01' },
    { label: '文体活动室', value: 'resource-activity', resourceCode: 'resource-01' },
  ],
  enabled: false,
  displayOrder: 0,
};

test('renders the compiled desktop resource contract and shared workbench', async ({ page }) => {
  await mockPlatform(page);
  if (!codes.length) {
    await page.goto(`${runtimeBase}/`);
    await expect(page).toHaveURL(`${runtimeBase}/home`);
    await expect(page.getByText('OpenXiangda 应用', { exact: true })).toBeVisible();
    await page.goto(`${runtimeBase}/admin`);
    await expect(page.getByText('还没有声明数据资源')).toBeVisible();
  } else {
    const code = codes[0];
    const definition = definitions[code];
    await page.goto(`${runtimeBase}/admin`);
    await expect(page.locator('.oxa-list-surface')).toBeVisible();
    await expect(page).toHaveURL(`${runtimeBase}/admin/resources/${code}`);
    await expect(page.locator('.oxa-sider').getByText(definition.name, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /导出$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /显示列$/ })).toBeVisible();
    if ((definition.surface.list?.filterFields?.length || 0) > 2) {
      const more = page.getByRole('button', { name: /^筛选/ });
      await expect(more).toBeVisible();
      await more.click();
      const modal = page.getByRole('dialog', { name: '筛选' });
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('button', { name: '应用筛选' })).toBeVisible();
      await expect
        .poll(async () => (await modal.boundingBox())?.width || 0)
        .toBeGreaterThan(700);
      await modal.getByRole('button', { name: 'Close' }).click();
    }
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /导出$/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  }

  await expect(page.locator('.oxa-topbar')).toHaveCSS('height', '52px');
  await expect(page.getByText('仪器' + '资源管理')).toHaveCount(0);
  await page.locator('.oxa-current-user').click();
  await expect(page.locator('.oxa-user-dropdown-profile')).toContainText('王老师');
  await expect(page.locator('.oxa-user-dropdown-profile')).toContainText('理学院');
  await expect(page.locator('.oxa-user-dropdown-roles')).toContainText('学院管理员');
  await expect(page.locator('.oxa-user-dropdown-roles')).not.toContainText('college_admin');
  await expect(page.getByText('外观', { exact: true })).toHaveCount(0);
  await expect(page.getByText('跟随系统', { exact: true })).toHaveCount(0);
});

test('default components ignore old preferences and leave the surrounding document unchanged', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('openxiangda.admin.appearance', 'dark'));
  const platform = await mockPlatform(page);
  await page.goto('/resource-experience.e2e.html');
  await page
    .locator('.oxa-sider')
    .getByText('内容业务操作', { exact: true })
    .click();

  const customPage = page.getByTestId('custom-admin-page');
  const customPanel = customPage.locator('.component-defaults-panel');
  await expect(customPage).toBeVisible();
  await expect(customPanel).toBeVisible();
  const readDefaultColors = () =>
    page.evaluate(() => {
      const host = document.querySelector('[data-testid="custom-admin-page"]');
      if (!host) throw new Error('CUSTOM_ADMIN_COMPONENT_HOST_NOT_READY');
      const probe = document.createElement('div');
      probe.style.cssText = [
        'position:fixed',
        'width:1px',
        'height:1px',
        'background:var(--ant-color-bg-layout)',
        'color:var(--ant-color-bg-container)',
        'border:1px solid var(--ant-color-border-secondary)',
        'outline:1px solid var(--ant-color-text)',
      ].join(';');
      host.appendChild(probe);
      const styles = getComputedStyle(probe);
      const result = {
        canvas: styles.backgroundColor,
        surface: styles.color,
        border: styles.borderTopColor,
        text: styles.outlineColor,
      };
      probe.remove();
      return result;
    });
  const defaults = await readDefaultColors();
  expect(defaults.surface).toBe('rgb(255, 255, 255)');
  await expect(customPage).toHaveCSS('background-color', defaults.canvas);
  await expect(customPanel).toHaveCSS('background-color', defaults.surface);
  await expect(customPanel).toHaveCSS('color', defaults.text);
  await expect(customPanel).toHaveCSS('border-color', defaults.border);

  const hostState = () => page.evaluate(() => {
    const host = getComputedStyle(document.getElementById('outside-ui')!);
    return {
      font: host.fontFamily, color: host.color, background: host.backgroundColor,
      boxSizing: host.boxSizing,
      documentStyle: document.documentElement.getAttribute('style'),
      documentAttributes: [...document.documentElement.attributes].map(attribute => attribute.name),
    };
  });
  const outside = await hostState();
  expect(outside).toEqual({
    font: 'monospace', color: 'rgb(31, 32, 33)', background: 'rgb(248, 249, 250)',
    boxSizing: 'content-box', documentStyle: null, documentAttributes: ['lang'],
  });

  await page.emulateMedia({ colorScheme: 'light' });
  expect(await readDefaultColors()).toEqual(defaults);
  await expect(customPanel).toHaveCSS('background-color', defaults.surface);
  expect(await hostState()).toEqual(outside);

  const identityReads = platform.contextReads;
  await page.getByRole('button', { name: '打开用户端' }).click();
  await page.getByRole('textbox', { name: '用户端输入' }).fill('保留业务输入');
  await page.getByRole('combobox').click();
  const dropdown = page.locator('.ant-select-dropdown:visible');
  await expect(dropdown).toHaveCSS('background-color', defaults.surface);
  await dropdown.getByText('可用选项', { exact: true }).click();
  await page.getByRole('button', { name: '打开用户弹窗' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.ant-modal-container')).toHaveCSS('background-color', defaults.surface);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(dialog.locator('.ant-modal-container')).toHaveCSS('background-color', defaults.surface);
  await dialog.getByRole('button', { name: '确 定' }).click();
  await expect(page.getByRole('textbox', { name: '用户端输入' })).toHaveValue('保留业务输入');
  expect(await hostState()).toEqual(outside);
  expect(platform.contextReads).toBe(identityReads);
  expect(errors).toEqual([]);
});

test('opens the stable admin entry under the preproduction gateway mount', async ({ page }) => {
  test.skip(!codes.length, 'No resource route exists in an empty application.');
  const devRuntimeBase = `/dev/${appCode}`;
  await mockPlatform(page, true, devRuntimeBase);
  await page.goto(`${devRuntimeBase}/admin`);
  await expect(page.locator('.oxa-list-surface')).toBeVisible();
  await expect(page).toHaveURL(
    `${devRuntimeBase}/admin/resources/${codes[0]}`,
  );
});

test('uses the complete current-user role union when no Perspective is selected', async ({ page }) => {
  const platform = await mockPlatform(page);
  await page.goto(`${runtimeBase}/admin`);
  if (codes.length) {
    await expect(page.locator('.oxa-list-surface')).toBeVisible();
  } else {
    await expect(page.getByText('还没有声明数据资源')).toBeVisible();
  }

  await page.evaluate(async () => {
    const client = await import('/platform-e2e/client-fixture.ts');
    await client.searchResource('acceptance-resource', 'name', {
      keyword: '显微镜',
    });
    await client.searchDirectory('user', { keyword: '老师' });
    await client.requestApplicationApi('/health/current-user');
  });

  const protectedRequests = platform.observed.filter(item =>
    /\/native\/data(?:-resources)?\/|\/directory\/|\/openxiangda-app-api\/v2\//.test(
      item.path
    )
  );
  expect(protectedRequests.length).toBeGreaterThanOrEqual(3);
  expect(protectedRequests.every(item => item.perspectiveCode === '')).toBe(true);
  expect(platform.contextReads).toBe(1);
  await page.locator('.oxa-current-user').click();
  await expect(page.locator('.oxa-user-dropdown-roles')).toContainText(
    '学院管理员'
  );
  await expect(page.locator('.oxa-user-dropdown-roles')).toContainText(
    '仪器管理员'
  );
  await expect(page.locator('.oxa-user-dropdown-roles')).not.toContainText(
    'college_admin'
  );
  await expect(page.getByText('切换应用角色', { exact: true })).toHaveCount(0);
});

test('updates the current user avatar through the platform-owned profile contract', async ({ page }) => {
  const platform = await mockPlatform(page);
  await page.goto(`${runtimeBase}/admin`);
  await page.locator('.oxa-current-user').click();
  await page.locator('.oxa-user-dropdown input[type="file"]').first().setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cff00000040101005fe245400000000049454e44ae426082',
      'hex'
    ),
  });
  await expect(page.getByText('头像已更新', { exact: true })).toBeVisible();
  await expect.poll(() => platform.avatarCompletes).toBe(1);
  await expect(page.locator('.oxa-current-user img')).toHaveAttribute(
    'src',
    'https://cdn.example.test/avatar/new.png'
  );
});

test('preserves the left menu scroll position when switching resource pages', async ({ page }) => {
  await mockPlatform(page, true, runtimeBase, true);
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto('/resource-experience.e2e.html');
  const scroller = page.locator('.oxa-menu-scroll');
  await scroller.evaluate(node => {
    node.scrollTop = 240;
    node.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBe(240);
  await page
    .locator('.oxa-sider')
    .getByText('资料下载', { exact: true })
    .evaluate(node => (node as HTMLElement).click());
  await expect(page).toHaveURL('/admin/resources/resource-12');
  await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBe(240);
});

test('mounts generated operation routes and typed actions in the unified Shell', async ({ page }) => {
  await mockPlatform(page, true, runtimeBase, true);
  await page.goto('/resource-experience.e2e.html');
  await expect(
    page.getByRole('button', { name: '发布选中栏目（0）' })
  ).toHaveCount(0);
  await page.locator('.oxa-sider').getByText('内容业务操作', { exact: true }).click();
  await expect(page).toHaveURL('/admin/operations/content');
  await expect(
    page.getByRole('heading', { name: '内容业务操作' })
  ).toBeVisible();
  await expect(page.locator('.oxa-sider')).toBeVisible();
});

test('keeps the user portal and namespaced generated admin resource in one router', async ({ page }) => {
  await mockPlatform(page, true, runtimeBase, true);
  await page.goto('/resource-experience.e2e.html');
  await page.evaluate(() => {
    history.pushState({}, '', '/resource-01');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(
    page.getByRole('heading', { name: '用户端内容门户' }),
  ).toBeVisible();
  await expect(page.locator('.oxa-sider')).toHaveCount(0);

  await page.evaluate(() => {
    history.pushState({}, '', '/admin/resources/resource-01');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.oxa-list-surface')).toBeVisible();
  await expect(page.locator('.oxa-sider')).toHaveCount(1);
});

test('renders canonical semantic labels in the real generated resource list', async ({ page }) => {
  const resourceCode = 'resource-01';
  await mockPlatform(page, true, runtimeBase, true, {
    [resourceCode]: [semanticResourceItem],
  });
  await page.route('**/native/data/resource-01/records/group-1?*', async route => {
    await route.fulfill({ json: { code: 200, data: { schemaVersion: 'openxiangda.data-record/v2', data: semanticResourceItem } } });
  });
  await page.goto('/resource-experience.e2e.html');
  await expect(page).toHaveURL(`/admin/resources/${resourceCode}`);
  const row = page.getByRole('row').filter({ hasText: '信息技术部' });
  await expect(row).toHaveCount(1);
  for (const label of [
    '信息技术部',
    '人文艺术部',
    '校工会',
    '周明远',
    '沈书雅',
    '教职工之家',
    '文体活动室',
  ]) {
    await expect(row).toContainText(label);
  }
  await expect(row).not.toContainText('[object Object]');
  await expect(row.getByRole('cell').nth(5)).toHaveText('否');
  await expect(row.getByRole('cell').nth(6)).toHaveText('0');
  await page.screenshot({
    fullPage: true,
    path: 'test-results/generated-resource-semantic-values-desktop.png',
  });
  await row.getByText('信息技术部', { exact: true }).click();
  await expect(page).toHaveURL(`/admin/resources/${resourceCode}`);
  const detail = page.getByRole('dialog');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('组织信息演示');
  const frame = detail.locator('[data-detail-frame="standard"]');
  await expect(frame).toBeVisible();
  await expect(frame.locator('.oxa-record-detail-card')).toHaveCount(2);
  await expect(frame.locator('.oxa-record-detail-card').getByRole('heading', { level: 2 })).toHaveText(['栏目设置', '管理信息']);
});

test.describe('generated detail application timezone', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('creation and update header inherit the configured zone', async ({ page }) => {
    const item = { ...semanticResourceItem, created_at: '2026-08-28T01:00:00.000Z' };
    await mockPlatform(page, true, runtimeBase, true, { 'resource-01': [item] });
    await page.route('**/native/data/resource-01/records/group-1?*', route => route.fulfill({
      json: { code: 200, data: { schemaVersion: 'openxiangda.data-record/v2', data: item } },
    }));
    await page.goto('/resource-experience.e2e.html?timeZone=Asia%2FShanghai');
    await page.getByRole('row').filter({ hasText: '信息技术部' }).getByText('信息技术部', { exact: true }).click();
    const frame = page.getByRole('dialog').locator('[data-detail-frame="standard"]');
    await expect(frame.locator('.oxa-record-detail-metadata')).toContainText('2026/08/28 09:00 创建');
    await expect(frame.locator('.oxa-record-detail-updated')).toHaveText('更新于 2026/08/28 09:00');
  });
});

test('renders the canonical first field on the mobile generated list', async ({ page }) => {
  const resourceCode = 'resource-01';
  await mockPlatform(page, true, runtimeBase, true, {
    [resourceCode]: [semanticResourceItem],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/resource-experience.e2e.html');
  await page.evaluate(resource => {
    history.pushState({}, '', `/m/admin/resources/${resource}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, resourceCode);
  const card = page.locator('.oxa-mobile-record-card').filter({ hasText: '信息技术部' });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('人文艺术部');
  await expect(card).toContainText('校工会');
  await expect(card).toContainText('周明远');
  await expect(card).toContainText('教职工之家');
  await expect(card).not.toContainText('[object Object]');
  await page.screenshot({
    fullPage: true,
    path: 'test-results/generated-resource-semantic-values-mobile.png',
  });
  await card.getByText('信息技术部', { exact: true }).click();
  await expect(page).toHaveURL(`/m/admin/resources/${resourceCode}/group-1`);
});

test('preserves false and zero when they lead the mobile generated list', async ({ page }) => {
  const resourceCode = 'resource-01';
  await mockPlatform(page, true, runtimeBase, true, {
    [resourceCode]: [semanticResourceItem],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/resource-experience.e2e.html?primary=falsy');
  await page.evaluate(resource => {
    history.pushState({}, '', `/m/admin/resources/${resource}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, resourceCode);
  const card = page.locator('.oxa-mobile-record-card');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.oxa-mobile-record-heading')).toHaveText('否');
  await expect(card.locator('.oxa-mobile-record-fields > div').filter({ hasText: '显示顺序' })).toContainText('0');
  await card.locator('.oxa-mobile-record-heading').getByText('否', { exact: true }).click();
  await expect(page).toHaveURL(`/m/admin/resources/${resourceCode}/group-1`);
});

test('fails closed on a direct operation route without its capability', async ({ page }) => {
  await mockPlatform(page, false, runtimeBase, false);
  await page.goto('/resource-experience.e2e.html');
  await page.evaluate(() => {
    history.pushState({}, '', '/admin/operations/content');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByText('当前平台用户无此页面权限')).toBeVisible();
  await expect(
    page.locator('.oxa-sider').getByText('内容业务操作', { exact: true })
  ).toHaveCount(0);
});

test('keeps platform implementation guidance out of generated forms', async ({ page }) => {
  await mockPlatform(page, true, runtimeBase, true);
  await page.goto('/resource-experience.e2e.html');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新增数据' })).toBeVisible();
  await expect(page).toHaveURL('/admin/resources/resource-01');
  const formLabels = page.locator('.ant-form-item-label label');
  await expect(formLabels.first()).toBeVisible();
  const labels = await formLabels.allTextContents();
  expect(labels.slice(0, 2)).toEqual(['栏目编码', '栏目名称']);
  await expect(
    page.getByText('仅显示当前角色可编辑的字段；保存时将校验数据版本与权限范围。', {
      exact: true,
    })
  ).toHaveCount(0);
  await expect(page.getByText('当前角色不可修改此字段', { exact: true })).toHaveCount(0);
});

test('keeps one toolbar and opens all declared filters on demand', async ({ page }) => {
  await mockPlatform(page, true, runtimeBase, true);
  await page.goto('/resource-experience.e2e.html');
  await expect(page.locator('.oxa-list-toolbar')).toHaveCount(1);
  await expect(page.locator('.oxa-filter-primary-item')).toHaveCount(0);
  await expect(
    page.getByPlaceholder('搜索栏目名称或栏目编码')
  ).toBeVisible();
  const more = page.getByRole('button', { name: '筛选' });
  await more.click();
  const modal = page.getByRole('dialog', { name: '筛选' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: '添加条件', exact: true }).click();
  await modal.getByRole('combobox', { name: '筛选字段' }).click();
  await expect(page.getByRole('option', { name: '栏目管理员' })).toBeVisible();
  await expect(page.getByRole('option', { name: '配套设施' })).toBeVisible();
  await expect(page.getByRole('option', { name: '开放星期' })).toBeVisible();
  await expect
    .poll(async () => (await modal.boundingBox())?.width || 0)
    .toBeGreaterThan(700);
});

test('renders platform mobile controls from declared field widgets', async ({ page }) => {
  const candidate = codes
    .map(code => ({ code, definition: definitions[code] }))
    .find(item =>
      item.definition.surface.mobile?.enabled &&
      Object.values(item.definition.surface.fields).some(field =>
        ['directory-user', 'directory-department', 'resource', 'file'].includes(field.widget || '')
      )
    );
  test.skip(!candidate, 'No mobile platform field is declared.');
  await mockPlatform(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${runtimeBase}/m/admin/resources/${candidate!.code}/new`,
  );
  await expect(page.locator('.oxa-mobile-form')).toBeVisible();

  const widgets = new Set(Object.values(candidate!.definition.surface.fields).map(field => field.widget));
  if (widgets.has('directory-user') || widgets.has('directory-department')) {
    const trigger = page.locator('.oxa-directory-trigger').first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.locator('.oxa-directory-mobile-drawer')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  if (widgets.has('resource')) {
    const trigger = page.locator('.oxa-mobile-reference-trigger').first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.locator('.oxa-mobile-reference-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  if (widgets.has('file')) {
    await expect(page.locator('.oxa-mobile-file-field')).toBeVisible();
    await expect(page.locator('.oxa-mobile-file-field input[type="file"]')).toBeHidden();
    await expect(page.getByRole('button', { name: '上传文件' })).toBeVisible();
  }
});

test('fails closed when the current user lacks the declared read capability', async ({ page }) => {
  test.skip(!codes.length, 'No resource permission exists in an empty application.');
  await mockPlatform(page, false);
  const code = codes[0];
  await page.goto(`${runtimeBase}/admin/resources/${code}`);
  await expect(page.getByText(new RegExp(`当前平台用户无${definitions[code].name}页面权限`))).toBeVisible();
  await expect(page.locator('.oxa-list-surface')).toHaveCount(0);
});

for (const scenario of ['recover', 'revoked', 'unknown', 'exhausted', 'write']) {
  test(`权限投影读取恢复 ${scenario} 保持有界并不重放写入`, async ({ page }) => {
    await mockPlatform(page, true, runtimeBase, true);
    await page.goto('/resource-experience.e2e.html');
    await expect(page.locator('.oxa-sider')).toBeVisible();
    const calls: Array<{ method: string; body: unknown }> = [];
    await page.route('**/native/data/projection-probe/**', async route => {
      calls.push({ method: route.request().method(), body: route.request().postDataJSON() });
      const n = calls.length;
      const status = scenario === 'unknown' ? 502 : scenario === 'revoked' && n > 1 ? 403 : scenario === 'recover' && n > 1 ? 200 : 503;
      if (status === 200) return route.fulfill({ json: { code: 200, data: { items: [{ id: 'visible', name: '授权后数据' }], total: 1 } } });
      return route.fulfill({ status, json: { code: status, errorCode: status === 503 ? 'OPENXIANGDA_AUTHORIZATION_PROJECTION_NOT_READY' : `HTTP_${status}`, message: 'fixture failure' } });
    });
    const result = await page.evaluate(async action => {
      const { createNativeResourceClient } = await import('/platform-e2e/client-fixture.ts');
      const client = createNativeResourceClient('projection-probe', { fields: { name: { label: '名称', type: 'text.short', widget: 'text' } } });
      try {
        const value = action === 'write' ? await client.create({ name: '申请' }) : await client.list({ page: 1, pageSize: 10 });
        return { ok: true, value };
      } catch (error) { return { ok: false, message: (error as Error).message }; }
    }, scenario);
    expect(calls).toHaveLength(scenario === 'recover' || scenario === 'revoked' ? 2 : scenario === 'exhausted' ? 4 : 1);
    expect(result.ok).toBe(scenario === 'recover');
    if (scenario === 'recover') expect(result.value).toEqual({ rows: [{ id: 'visible', name: '授权后数据' }], total: 1 });
    if (scenario === 'exhausted') expect(result.message).toContain('已完成的操作无需重复提交');
    expect(calls.every(call => call.method === 'POST')).toBe(true);
    if (scenario !== 'write') expect(calls.every(call => JSON.stringify(call.body) === JSON.stringify(calls[0].body))).toBe(true);
  });
}
