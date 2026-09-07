import { expect, test, type Page } from '@playwright/test';

const field = (page: Page, label: string) => page.locator(`[data-field-code="${label}"]`);
const picker = (page: Page, label: string) => field(page, label).getByRole('dialog', { name: `选择${label}` });
const open = async (page: Page, label: string) => {
  await field(page, label).getByRole('button', { name: `选择${label}`, exact: true }).click();
  await expect(picker(page, label)).toBeVisible();
};
const submit = async (page: Page) => {
  await page.getByRole('button', { name: '验证表单', exact: true }).click();
  await expect(page.locator('[data-saved-values]')).not.toBeEmpty();
  return JSON.parse(await page.locator('[data-saved-values]').innerText());
};
const department = (id: string, label: string, hasChildren = false, selectable = true) => ({
  kind: 'department', id, label, hasChildren, selectable,
  snapshot: { value: id, label, fullPath: `学校 / ${label}` },
});
const member = (id: string, label: string, selectable = true) => ({
  kind: 'user', id, label, selectable,
  snapshot: { value: id, label, employeeNo: `E-${id}`, departments: [{ value: 'college-a', label: '理学院' }] },
});

test.describe('mobile platform selection fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/china-divisions/**', route => route.fulfill({ json: [] }));
    await page.route('**/files/*/content?**', route => route.fulfill({ status: 204, body: '' }));
  });

  test('member browsing, paging and search retain staged snapshots until confirmation', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const queries: string[] = [];
    await page.route('**/directory/**', async route => {
      const url = new URL(route.request().url());
      queries.push(url.pathname + url.search);
      const tree = url.pathname.endsWith('/tree');
      const browse = url.pathname.endsWith('/users') && url.pathname.includes('/departments/');
      const items = tree ? [department('college-a', '理学院')]
        : browse ? (url.searchParams.get('page') === '2' ? [member('user-3', '李老师')] : [member('user-2', '王老师'), member('blocked', '不可选成员', false)])
          : [member('user-4', '陈老师')];
      await route.fulfill({ json: { schemaVersion: 'openxiangda.directory-entry-page/v2', kind: tree ? 'department' : 'user', items,
        nextCursor: browse && url.searchParams.get('page') === '1' ? '2' : null } });
    });
    await page.goto('/field-protocol.e2e.html?mode=mobile');
    await open(page, '成员多选');
    const sheet = picker(page, '成员多选');
    await sheet.getByRole('button', { name: '进入理学院' }).click();
    await expect(sheet.getByText('不可选成员', { exact: true })).toBeVisible();
    await expect(sheet.locator('.adm-check-list-item').filter({ hasText: '不可选成员' })).toHaveAttribute('aria-disabled', 'true');
    await sheet.getByText('不可选成员', { exact: true }).click({ force: true });
    await expect(sheet.getByLabel('已选项目')).not.toContainText('不可选成员');
    await sheet.getByText('王老师', { exact: true }).click();
    await sheet.getByRole('button', { name: '更多成员' }).click();
    await sheet.getByText('李老师', { exact: true }).click();
    await sheet.getByPlaceholder('搜索成员多选').fill('陈老师');
    await sheet.getByText('陈老师', { exact: true }).click();
    await expect(sheet.getByLabel('已选项目')).toContainText('王老师');
    await expect(sheet.getByLabel('已选项目')).toContainText('李老师');
    await sheet.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(field(page, '成员多选').getByRole('button', { name: '选择成员多选', exact: true })).toHaveText('张三');

    await open(page, '成员多选');
    await sheet.getByRole('button', { name: '清空', exact: true }).click();
    await sheet.getByRole('button', { name: '进入理学院' }).click();
    await sheet.getByText('王老师', { exact: true }).click();
    await sheet.getByPlaceholder('搜索成员多选').fill('陈老师');
    await sheet.getByText('陈老师', { exact: true }).click();
    await sheet.getByRole('button', { name: '确定（2）', exact: true }).click();
    const saved = await submit(page);
    expect(saved['成员多选']).toEqual([member('user-2', '王老师').snapshot, member('user-4', '陈老师').snapshot]);
    await page.getByRole('button', { name: '重新载入已保存值' }).click();
    await expect(field(page, '成员多选').getByRole('button', { name: '选择成员多选', exact: true })).toHaveText('王老师、陈老师');
    expect(queries.some(query => query.includes('page=2'))).toBe(true);
    expect(errors).toEqual([]);
    await open(page, '成员多选');
    await sheet.getByRole('button', { name: '进入理学院' }).click();
    await expect(sheet.getByText('王老师', { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: 'test-results/mobile-member-picker.png' });
  });

  test('explicit mobile department control browses disabled ancestors and retries failed pages', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    let failures = 1;
    await page.route('**/directory/**', async route => {
      const url = new URL(route.request().url());
      const parent = url.searchParams.get('parentId');
      if (parent === 'root' && failures-- > 0) { await route.fulfill({ status: 503, json: { code: 'OPENXIANGDA_DIRECTORY_REQUEST_FAILED', message: '目录暂时不可用' } }); return; }
      await route.fulfill({ json: { schemaVersion: 'openxiangda.directory-entry-page/v2', kind: 'department',
        items: parent === 'root' ? [department('college-a', '理学院'), department('college-b', '文学院')]
          : url.searchParams.get('offset') ? [department('office', '办公室')]
            : [department('root', '学校', true, false)], nextCursor: !parent && !url.searchParams.get('offset') ? '100' : null } });
    });
    await page.goto('/field-protocol.e2e.html?mode=mobile');
    await open(page, '部门多选');
    const sheet = picker(page, '部门多选');
    await expect(sheet.locator('.ant-tree, .ant-select, .ant-drawer')).toHaveCount(0);
    await sheet.getByRole('button', { name: '清空', exact: true }).click();
    await sheet.getByRole('button', { name: '更多部门' }).click();
    await sheet.getByText('办公室', { exact: true }).click();
    await sheet.getByRole('button', { name: '进入学校' }).click();
    await expect(sheet.getByRole('alert')).toContainText('目录暂时不可用');
    await sheet.getByRole('button', { name: '重试', exact: true }).click();
    await sheet.getByText('文学院', { exact: true }).click();
    await sheet.getByRole('button', { name: '确定（2）', exact: true }).click();
    expect((await submit(page))['部门多选']).toEqual([department('office', '办公室').snapshot, department('college-b', '文学院').snapshot]);
    await open(page, '部门单选');
    await picker(page, '部门单选').getByRole('button', { name: '进入学校' }).click();
    await picker(page, '部门单选').getByText('文学院', { exact: true }).click();
    await picker(page, '部门单选').getByRole('button', { name: '确定（1）', exact: true }).click();
    expect((await submit(page))['部门单选']).toEqual(department('college-b', '文学院').snapshot);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '部门多选');
    await sheet.getByRole('button', { name: '进入学校' }).click();
    await expect(sheet.getByText('文学院', { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: 'test-results/mobile-department-picker.png' });
  });

  test('reference search ignores stale pages, preserves off-page choices and retries without losing them', async ({ page }) => {
    let releaseOld: (() => void) | undefined;
    let oldFinished = false;
    let failed = false;
    const reference = (value: string, label: string) => ({ value, label, resourceCode: 'field-lookups', snapshot: { code: `CODE-${value}` } });
    await page.route('**/source/query', async route => {
      const request = route.request().postDataJSON();
      if (request.cursor === 'old-next') { await new Promise<void>(resolve => { releaseOld = resolve; }); }
      if (request.keyword === '故障' && !failed) { failed = true; await route.fulfill({ status: 503, json: { code: 'OPENXIANGDA_DATA_SOURCE_FAILED', message: '候选加载失败' } }); return; }
      const items = request.cursor ? [reference('stale', '过期候选')] : request.keyword ? [reference('b', '测量服务')] : [reference('a', '检测设备')];
      await route.fulfill({ json: { schemaVersion: 'openxiangda.data-field-source-page/v2',
        environment: { id: 'env', key: 'production', activeAppVersionId: 'version', headRevision: 1, authzRevisionId: 'authz' },
        resourceCode: 'field-records', fieldCode: request.fieldCode, operation: request.operation, sourceResourceCode: 'field-lookups',
        items, nextCursor: request.keyword || request.cursor ? null : 'old-next' } });
      if (request.cursor) oldFinished = true;
    });
    await page.goto('/field-protocol.e2e.html?mode=mobile');
    await open(page, '动态多选下拉');
    const sheet = picker(page, '动态多选下拉');
    await sheet.getByRole('button', { name: '清空', exact: true }).click();
    await sheet.getByText('检测设备', { exact: true }).click();
    await sheet.getByRole('button', { name: '加载更多', exact: true }).click();
    await expect.poll(() => Boolean(releaseOld)).toBe(true);
    await sheet.getByPlaceholder('搜索动态多选下拉').fill('测量');
    await sheet.getByText('测量服务', { exact: true }).click();
    releaseOld!();
    await expect.poll(() => oldFinished).toBe(true);
    await expect(sheet.getByText('过期候选')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: '加载更多', exact: true })).toHaveCount(0);
    await expect(sheet.getByLabel('已选项目')).toContainText('检测设备');
    await page.screenshot({ path: 'test-results/mobile-reference-picker.png' });
    await sheet.getByPlaceholder('搜索动态多选下拉').fill('故障');
    await expect(sheet.getByRole('alert')).toContainText('选项暂时无法加载，请稍后重试');
    await sheet.getByRole('button', { name: '重试', exact: true }).click();
    await expect(sheet.getByText('测量服务', { exact: true }).last()).toBeVisible();
    await sheet.getByPlaceholder('搜索动态多选下拉').press('Enter');
    await expect(page.locator('[data-saved-values]')).toBeEmpty();
    await sheet.getByRole('button', { name: '确定（2）', exact: true }).click();
    expect((await submit(page))['动态多选下拉']).toEqual([reference('a', '检测设备'), reference('b', '测量服务')]);
    await page.getByRole('button', { name: '重新载入已保存值' }).click();
    await open(page, '动态多选下拉');
    await sheet.getByRole('button', { name: '移除检测设备', exact: true }).click();
    await sheet.getByRole('button', { name: '确定（1）', exact: true }).click();
    expect((await submit(page))['动态多选下拉']).toEqual([reference('b', '测量服务')]);
  });

  test('cascade drilldown and path search commit complete single/multiple snapshots', async ({ page }) => {
    await page.goto('/field-protocol.e2e.html?mode=mobile');
    await open(page, '级联多选');
    const sheet = picker(page, '级联多选');
    await sheet.getByRole('button', { name: '清空', exact: true }).click();
    await sheet.getByRole('button', { name: '进入设备' }).click();
    await sheet.getByText('光谱仪', { exact: true }).click();
    await sheet.getByRole('button', { name: '首页', exact: true }).click();
    await sheet.getByPlaceholder('搜索选项或路径').fill('服务');
    await sheet.getByText('培训', { exact: true }).click();
    await expect(sheet.getByLabel('已选项目')).toContainText('设备 / 光谱仪');
    await expect(sheet.getByLabel('已选项目')).toContainText('服务 / 培训');
    await page.screenshot({ path: 'test-results/mobile-cascade-picker.png' });
    await sheet.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(field(page, '级联多选').getByRole('button', { name: '选择级联多选', exact: true })).toHaveText('设备 / 显微镜');
    await open(page, '级联多选');
    await sheet.getByRole('button', { name: '进入设备' }).click();
    await sheet.getByText('光谱仪', { exact: true }).click();
    await sheet.getByRole('button', { name: '确定（2）', exact: true }).click();
    const expected = [
      [{ label: '设备', value: 'equipment' }, { label: '显微镜', value: 'microscope' }],
      [{ label: '设备', value: 'equipment' }, { label: '光谱仪', value: 'spectrometer' }],
    ];
    expect((await submit(page))['级联多选']).toEqual(expected);
    await open(page, '级联单选');
    await picker(page, '级联单选').getByRole('button', { name: '首页', exact: true }).click();
    await picker(page, '级联单选').getByRole('button', { name: '进入服务' }).click();
    await picker(page, '级联单选').getByText('培训', { exact: true }).click();
    await picker(page, '级联单选').getByRole('button', { name: '确定', exact: true }).click();
    expect((await submit(page))['级联单选']).toEqual([{ label: '服务', value: 'service' }, { label: '培训', value: 'training' }]);
    await page.getByRole('button', { name: '重新载入已保存值' }).click();
    await expect(field(page, '级联单选').getByRole('button', { name: '选择级联单选', exact: true })).toHaveText('服务 / 培训');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
});
