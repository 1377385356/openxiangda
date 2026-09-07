import { expect, test } from '@playwright/test';

const liveEnabled = process.env.OPENXIANGDA_LIVE_DATA_API === '1';
const title = 'UI live field record';

test.describe('@live-data-api standard resource UI', () => {
  test.setTimeout(90_000);
  test.skip(
    !liveEnabled,
    'Requires the disposable PostgreSQL Native Data API acceptance bridge.'
  );

  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: 'openxiangda-field-ui-role',
        value: 'super',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);
  });

  test('runs create, list, query, get, update, audit and delete through the standard page', async ({
    context,
    page,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({
      longitude: 120.123456,
      latitude: 30.234567,
      accuracy: 4,
    });
    await page.goto(
      '/data-api-live.e2e.html?initial=/admin/resources/field-records',
    );
    await expect(page.locator('.oxa-list-surface')).toBeVisible();

    await page.getByRole('button', { name: '新增字段协议记录' }).click();
    await expect(page.getByRole('heading', { name: '新增字段协议记录' })).toBeVisible();
    await page.getByLabel('标题').fill(title);
    await page.getByRole('radio', { name: 'Open' }).check();
    const openCheckbox = page.getByRole('checkbox', { name: 'Open' });
    const urgentCheckbox = page.getByRole('checkbox', { name: 'Urgent' });
    await openCheckbox.click();
    await urgentCheckbox.click();
    await expect(openCheckbox).toBeChecked();
    await expect(urgentCheckbox).toBeChecked();
    await page.getByRole('button', { name: '浏览器定位' }).click();
    await expect(page.getByText('120.123456, 30.234567')).toBeVisible();
    await page.getByRole('button', { name: /^保\s*存$/ }).click();

    await expect(page.locator('.oxa-list-surface')).toBeVisible();
    await page.locator('.oxa-search-panel .ant-select').first().click();
    await page.getByText('标题', { exact: true }).last().click();
    await page.getByPlaceholder('关键词').fill(title);
    await page.getByRole('button', { name: /查询/ }).click();
    const createdRow = page.getByRole('row').filter({ hasText: title });
    await expect(createdRow).toHaveCount(1);
    await expect(createdRow).toContainText('Open');
    await expect(createdRow).toContainText('Urgent');
    await expect(createdRow).toContainText('120.123456, 30.234567');

    await createdRow.getByRole('button', { name: '查看' }).click();
    await expect(page.getByRole('heading', { name: '字段协议记录详情' })).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByText(/浏览器定位/)).toBeVisible();
    await page.locator('.oxa-audit-collapse .ant-collapse-header').click();
    await expect(page.getByText('创建', { exact: true })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: 'test-results/data-api-live-detail.png',
    });

    await page.getByRole('button', { name: /编辑/ }).click();
    await page.getByLabel('标题').fill(`${title} updated`);
    await page.getByRole('radio', { name: 'Closed' }).check();
    await page.getByRole('checkbox', { name: 'Open' }).click();
    await expect(page.getByRole('checkbox', { name: 'Open' })).not.toBeChecked();
    await page.getByRole('button', { name: /^保存修改$/ }).click();
    await expect(page.getByText(`${title} updated`, { exact: true })).toBeVisible();
    await expect(page.getByText('Closed', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '返回列表' }).click();
    const updatedRow = page
      .getByRole('row')
      .filter({ hasText: `${title} updated` });
    await expect(updatedRow).toHaveCount(1);
    await updatedRow.getByRole('button', { name: '删除' }).click();
    await page.getByRole('button', { name: /^确\s*定$/ }).click();
    await expect(updatedRow).toHaveCount(0);
  });

  test('applies PostgreSQL row scope to the standard list and query UI', async ({
    context,
    page,
  }) => {
    await context.clearCookies();
    await context.addCookies([
      {
        name: 'openxiangda-field-ui-role',
        value: 'restricted',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);
    await page.goto(
      '/data-api-live.e2e.html?initial=/admin/resources/field-records',
    );
    await expect(page.locator('.oxa-list-surface')).toBeVisible();
    await page.locator('.oxa-search-panel .ant-select').first().click();
    await page.getByText('标题', { exact: true }).last().click();
    await page.getByPlaceholder('关键词').fill('UI RLS');
    await page.getByRole('button', { name: /查询/ }).click();
    await expect(page.getByText('UI RLS visible', { exact: true })).toBeVisible();
    await expect(page.getByText('UI RLS hidden', { exact: true })).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: 'test-results/data-api-live-rls.png',
    });
  });

  test('fails closed in the standard page when the role has no read capability', async ({
    context,
    page,
  }) => {
    await context.clearCookies();
    await context.addCookies([
      {
        name: 'openxiangda-field-ui-role',
        value: 'denied',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);
    await page.goto(
      '/data-api-live.e2e.html?initial=/admin/resources/field-records',
    );
    await expect(
      page.getByText('当前平台用户无字段协议记录页面权限', { exact: true })
    ).toBeVisible();
    await expect(page.locator('.oxa-list-surface')).toHaveCount(0);
  });
});
