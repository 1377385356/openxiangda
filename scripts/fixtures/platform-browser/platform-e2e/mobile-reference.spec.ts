import { expect, test, type Page } from '@playwright/test';
import { mockPlatform } from './resource-platform-mock';

const field = (page: Page, label: string) =>
  page.locator(`[data-field-code="${label}"]`);
const sheet = (page: Page, label: string) =>
  page.getByRole('dialog', { name: `选择${label}`, exact: true });
const open = async (page: Page, label: string) => {
  await field(page, label)
    .getByRole('button', { name: `选择${label}`, exact: true })
    .click();
  await expect(sheet(page, label)).toBeVisible();
};
const submit = async (page: Page) => {
  await page.getByRole('button', { name: '提交', exact: true }).click();
  await expect(page.locator('[data-saved-values]')).not.toBeEmpty();
  return JSON.parse(
    (await page.locator('[data-saved-values]').textContent()) || '{}'
  );
};

test.describe('confirmed mobile form reference', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPlatform(page.context(), true, undefined, true);
    const uploads = new Map<string, Buffer>();
    await page.route('**/__reference-upload-fixture', route => {
      const id = crypto.randomUUID();
      const body = route.request().postDataBuffer()!;
      uploads.set(id, body);
      return route.fulfill({ json: { schemaVersion: 'openxiangda.data-file-ref/v2', id, name: decodeURIComponent(route.request().headers()['x-file-name']), size: body.length, contentType: 'image/png' } });
    });
    await page.route('**/files/*/content?**', route => {
      const id = new URL(route.request().url()).pathname.split('/files/')[1].split('/')[0];
      const uploaded = uploads.get(id);
      return uploaded ? route.fulfill({ contentType: 'image/png', body: uploaded }) : route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#e7eef1"/><path d="M0 480L220 180L410 480M230 480L450 250L640 480" fill="#9badbb"/></svg>',
      });
    });
    await page.route('**/files/*/preview?**', route =>
      route.fulfill({
        json: {
          canPreview: true,
          previewType: 'image',
          file: { name: '活动图片.png' },
        },
      })
    );
    await page.goto('/mobile-reference.e2e.html');
    await expect(
      page.getByRole('heading', { name: '未命名表单' })
    ).toBeVisible();
  });

  test('grouped borderless inputs, inline choices, rating and staged dropdowns', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-form-empty.png'),
    });
    await expect(field(page, '单行文本').getByRole('textbox')).toHaveCSS(
      'border-top-width',
      '0px'
    );
    await field(page, '单行文本').getByRole('textbox').fill('会议记录');
    await field(page, '多行文本').getByRole('textbox').fill('第一行\n第二行');
    await field(page, '数值').getByRole('textbox').fill('18');
    await field(page, '评分')
      .getByRole('radio', { name: '4', exact: true })
      .click();
    await field(page, '单选').getByText('选项三', { exact: true }).click();
    await field(page, '复选').getByText('选项一', { exact: true }).click();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-basic-fields.png'),
    });
    await open(page, '下拉单选');
    await sheet(page, '下拉单选').getByText('选项二', { exact: true }).click();
    await sheet(page, '下拉单选')
      .getByRole('button', { name: '取消', exact: true })
      .click();
    await expect(
      field(page, '下拉单选').getByRole('button', {
        name: '选择下拉单选',
        exact: true,
      })
    ).toHaveText('请选择');
    await open(page, '下拉单选');
    await sheet(page, '下拉单选')
      .getByPlaceholder('搜索', { exact: true })
      .fill('三');
    await sheet(page, '下拉单选').getByText('选项三', { exact: true }).click();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-single-select.png'),
    });
    await sheet(page, '下拉单选')
      .getByRole('button', { name: '确定', exact: true })
      .click();
    await open(page, '下拉复选');
    await sheet(page, '下拉复选').getByText('选项一', { exact: true }).click();
    await sheet(page, '下拉复选').getByText('选项二', { exact: true }).click();
    await expect(sheet(page, '下拉复选')).toContainText('当前已选中 2 项');
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-multi-select.png'),
    });
    await sheet(page, '下拉复选')
      .getByRole('button', { name: '确定', exact: true })
      .click();
    const saved = await submit(page);
    expect(saved.评分).toBe(4);
    expect(saved.数值).toBe(18);
    expect(saved.多行文本).toBe('第一行\n第二行');
    expect(saved.单选).toEqual({ label: '选项三', value: '3' });
    expect(saved.复选).toHaveLength(3);
    expect(saved.下拉复选).toHaveLength(2);
    expect(saved.下拉单选).toEqual({ label: '选项三', value: '3' });
    expect(saved.富文本).toBe('<p>已有<strong>格式内容</strong></p>');
    expect(errors).toEqual([]);
  });

  test('calendar, time wheels and range steps preserve cancellation and boundaries', async ({
    page,
  }, info) => {
    await open(page, '日期时间');
    const date = sheet(page, '日期时间');
    await expect(date.locator('.adm-calendar')).toBeVisible();
    await date
      .locator('.adm-calendar-cell:not(.adm-calendar-cell-disabled)')
      .filter({ hasText: /^7$/ })
      .click();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-calendar.png'),
    });
    await date
      .locator('.oxa-mobile-date-time-footer')
      .getByRole('button')
      .click();
    await expect(date.locator('.adm-picker-view')).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-time-wheels.png'),
    });
    await date.getByRole('button', { name: '取消', exact: true }).click();
    expect((await submit(page)).日期时间).toBe('2026-09-05T09:45:33.000Z');
    await open(page, '日期时间区间');
    const range = sheet(page, '日期时间区间');
    await expect(range).toContainText('选择开始时间');
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-range-start.png'),
    });
    await range.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(range).toContainText('选择结束时间');
    await range.getByRole('button', { name: '上一步', exact: true }).click();
    await expect(range).toContainText('选择开始时间');
    await range.getByRole('button', { name: '下一步', exact: true }).click();
    await range.getByRole('button', { name: '确定', exact: true }).click();
    const saved = await submit(page);
    expect(saved.日期时间区间).toEqual({
      start: '2026-09-05T09:00:00.000Z',
      end: '2026-09-08T10:00:00.000Z',
    });
    await open(page, '日期区间');
    await sheet(page, '日期区间')
      .getByRole('button', { name: '下一步', exact: true })
      .click();
    await sheet(page, '日期区间')
      .getByRole('button', { name: '确定', exact: true })
      .click();
    expect((await submit(page)).日期区间).toEqual({
      start: '2026-09-05',
      end: '2026-09-08',
    });
  });

  test('address drilldown, location, cascade, touch signature and plain rich text use canonical values', async ({
    page,
  }, info) => {
    const levels = [
      { adcode: '330000', name: '浙江省', hasChildren: true },
      { adcode: '330100', name: '杭州市', hasChildren: true },
      { adcode: '330110', name: '余杭区', hasChildren: true },
      { adcode: '330110001', name: '五常街道', hasChildren: false },
    ];
    await page.route('**/china-divisions/**', route => {
      const parent = new URL(route.request().url()).searchParams.get(
        'parentAdcode'
      );
      return route.fulfill({
        json: [
          levels[
            parent ? levels.findIndex(item => item.adcode === parent) + 1 : 0
          ],
        ],
      });
    });
    await field(page, '地址')
      .getByRole('button', { name: '选择行政区地址' })
      .click();
    const address = page.getByRole('dialog', { name: '选择行政区地址' });
    for (const level of levels)
      await address.getByText(level.name, { exact: true }).click();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-address-picker.png'),
    });
    await address.getByRole('button', { name: '确定', exact: true }).click();
    await field(page, '地址')
      .getByRole('textbox', { name: '详细地址' })
      .pressSequentially('文一西路 1 号');
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({
      latitude: 30.234567,
      longitude: 120.123456,
      accuracy: 10,
    });
    await field(page, '定位').getByRole('button', { name: '获取定位' }).click();
    await expect(field(page, '定位')).toContainText('120.123456');
    await open(page, '级联选择');
    await sheet(page, '级联选择')
      .getByRole('button', { name: '进入部门' })
      .click();
    await sheet(page, '级联选择').getByText('B部门', { exact: true }).click();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-cascade-picker.png'),
    });
    await sheet(page, '级联选择')
      .getByRole('button', { name: '确定', exact: true })
      .click();
    await field(page, '手写签名')
      .getByRole('button', { name: '开始签名' })
      .click();
    const signature = page.getByRole('dialog', {
      name: '手写签名',
      exact: true,
    });
    const canvas = signature.locator('canvas');
    await canvas.click({ trial: true });
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 120, { steps: 8 });
    await page.mouse.move(box.x + 110, box.y + 160, { steps: 6 });
    await page.mouse.up();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-signature-pad.png'),
    });
    await signature.getByRole('button', { name: '保存签名' }).click();
    await expect(signature).toHaveCount(0);
    await expect(field(page, '手写签名').getByRole('img', { name: '业务签名' })).toHaveJSProperty('naturalHeight', 240);
    await field(page, '富文本')
      .getByRole('textbox')
      .fill('第一行 <说明>');
    await field(page, '富文本').getByRole('textbox').press('End');
    await field(page, '富文本').getByRole('textbox').press('Enter');
    await field(page, '富文本').getByRole('textbox').pressSequentially('第二行 & 补充');
    const saved = await submit(page);
    expect(saved.地址.detail).toBe('文一西路 1 号');
    expect(saved.地址.street.label).toBe('五常街道');
    expect(saved.定位.longitude).toBe(120.123456);
    expect(saved.定位.source).toBe('browser');
    expect(saved.级联选择).toEqual([
      { value: 'department', label: '部门' },
      { value: 'b', label: 'B部门' },
    ]);
    expect(saved.手写签名.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.手写签名.points.length).toBeGreaterThan(1);
    expect(saved.富文本).toBe(
      '<p>第一行 &lt;说明&gt;</p><p>第二行 &amp; 补充</p>'
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });

  test('inline subtable validates collapsed rows and preserves update/delete revisions', async ({
    page,
  }, info) => {
    const subtable = field(page, '子表单');
    await expect(subtable.locator('.oxa-mobile-subtable-card')).toHaveCount(1);
    const row = subtable.locator('.oxa-mobile-subtable-card').first();
    await row
      .getByRole('textbox', { name: '单行文本', exact: true })
      .fill('修改后的记录');
    await row.getByRole('button', { name: '折叠第1项', exact: true }).click();
    await expect(
      row.getByRole('textbox', { name: '单行文本', exact: true })
    ).toBeHidden();
    await subtable.getByRole('button', { name: '新增一项' }).click();
    const second = subtable.locator('.oxa-mobile-subtable-card').nth(1);
    await second
      .getByRole('textbox', { name: '数值', exact: true })
      .fill('1.5');
    await second
      .getByRole('button', { name: '折叠第2项', exact: true })
      .click();
    await page.getByRole('button', { name: '提交', exact: true }).click();
    await expect(page.locator('[data-saved-values]')).toBeEmpty();
    await expect(
      second.getByRole('textbox', { name: '数值', exact: true })
    ).toBeVisible();
    await expect(second.getByRole('alert').first()).toBeVisible();
    await second.getByRole('textbox', { name: '数值', exact: true }).fill('12');
    await second
      .getByRole('textbox', { name: '单行文本', exact: true })
      .fill('新增记录');
    await row.getByRole('button', { name: '展开第1项', exact: true }).click();
    await field(page, '图片上传').scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-files-and-subtable.png'),
    });
    await subtable.evaluate(element =>
      window.scrollBy(0, element.getBoundingClientRect().top - 82)
    );
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-inline-subtable.png'),
    });
    await submit(page);
    const operations = JSON.parse(
      (await page.locator('[data-operations]').textContent()) || '[]'
    );
    expect(operations[0]).toMatchObject({
      operation: 'update',
      id: 'item-1',
      expectedRevision: 4,
      data: { name: '修改后的记录' },
    });
    expect(operations[1]).toMatchObject({
      operation: 'create',
      data: {
        name: '新增记录',
        quantity: 12,
        parent_id: 'parent-1',
        row_order: 1,
      },
    });
    await row.getByRole('button', { name: '删除', exact: true }).click();
    await submit(page);
    expect(
      JSON.parse(
        (await page.locator('[data-operations]').textContent()) || '[]'
      )[0]
    ).toMatchObject({ operation: 'delete', id: 'item-1', expectedRevision: 4 });
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('mobile-form-complete.png'),
      fullPage: true,
    });
  });
});
