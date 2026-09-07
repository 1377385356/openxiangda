import { expect, test } from '@playwright/test';

const fieldCount = 38;

test('富文本共同语料保留段落、清理危险内容且重复保存稳定', async ({ page }) => {
  await page.goto('/field-protocol.e2e.html');
  const evidence = page.locator('#rich-text-paragraph-evidence');
  await expect(evidence).toHaveCount(1);
  const results = JSON.parse(await evidence.textContent() || '[]');
  expect(results).toHaveLength(7);
  for (const result of results) {
    expect(result.actual).toBe(result.expected);
    expect(result.stable).toBe(true);
  }
});

test.describe('Field Kit protocol acceptance', () => {
  test.use({
    geolocation: { longitude: 120.123456, latitude: 30.234567 },
    permissions: ['geolocation'],
  });

  test.beforeEach(async ({ page }) => {
    await page.route('**/china-divisions/**', async route => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: [{
            adcode: '330000',
            name: '浙江省',
            level: 'province',
            hasChildren: true,
          }],
        },
      });
    });
    await page.route('**/files/*/content?*', async route => {
      await route.fulfill({
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64'
        ),
        contentType: 'image/png',
        status: 200,
      });
    });
  });

  for (const mobile of [false, true]) {
    test(`${mobile ? '移动' : 'PC'} 布尔字段未选择不冒充 false，直接选择否可通过必填`, async ({ page }) => {
      await page.goto(`/field-protocol.e2e.html?emptyBoolean=1${mobile ? '&mode=mobile' : ''}`);
      const field = page.locator('[data-field-code="布尔"]');
      await expect(field).toContainText('未选择');
      await page.getByRole('button', { name: '验证表单', exact: true }).click();
      await expect(page.locator('[data-saved-values]')).toHaveText('');
      await field.getByText('否', { exact: true }).click();
      await expect(field).not.toContainText('未选择');
      await page.getByRole('button', { name: '验证表单', exact: true }).click();
      const output = page.locator('[data-saved-values]');
      await expect(output).toContainText('"布尔":false');
      await field.getByText('是', { exact: true }).click();
      await page.getByRole('button', { name: '重新载入已保存值' }).click();
      await page.getByRole('button', { name: '验证表单', exact: true }).click();
      expect(JSON.parse(await output.innerText()).布尔).toBe(false);
    });
  }

  test('桌面编辑器真实回车后保存和重新编辑不丢段落', async ({ page }) => {
    await page.goto('/field-protocol.e2e.html');
    const editor = page.locator('[data-field-code="富文本"]').getByRole('textbox', { name: '富文本内容' });
    await editor.fill('第一段');
    await editor.press('End');
    await editor.press('Enter');
    await editor.pressSequentially('第二段');
    await page.getByRole('button', { name: '验证表单', exact: true }).click();
    const output = page.locator('[data-saved-values]');
    await expect(output).toContainText('第二段');
    const stored = JSON.parse(await output.innerText()).富文本;
    expect(stored).toContain('第一段');
    expect(stored).toContain('<p>第二段</p>');
    await page.getByRole('button', { name: '重新载入已保存值' }).click();
    await page.getByRole('button', { name: '验证表单', exact: true }).click();
    expect(JSON.parse(await output.innerText()).富文本).toBe(stored);
  });

  test('renders and operates every desktop edit/read component', async ({ page }) => {
    const pageErrors: string[] = [];
    const addressRequests: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (request.url().includes('/china-divisions/')) {
        addressRequests.push(request.url());
      }
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/field-protocol.e2e.html');
    await expect(page.locator('[data-field-code]')).toHaveCount(fieldCount);
    await expect(page.locator('[data-read-field]')).toHaveCount(fieldCount);
    await expect(page.locator('[data-audit-field]')).toHaveCount(fieldCount);
    await expect(page.locator('[data-field-code="静态单选下拉"] .ant-select')).toBeVisible();
    await expect(page.locator('[data-field-code="单选按钮"] .ant-radio-group')).toBeVisible();
    await expect(page.locator('[data-field-code="复选框"] .ant-checkbox-group')).toBeVisible();
    await expect(page.locator('[data-field-code="时间"] input')).toBeVisible();
    await expect(page.locator('[data-field-code="精确定位"] input')).toHaveCount(0);
    await expect(page.locator('[data-field-code="精确定位"]')).not.toContainText('手工');
    await expect(page.locator('.ant-alert-error')).toHaveCount(0);
    await expect.poll(() => addressRequests.length).toBeGreaterThan(0);
    expect(addressRequests.every(url => new URL(url).pathname.startsWith('/service/china-divisions/'))).toBe(true);

    await page.getByRole('button', { name: '验证表单' }).click();
    await expect(page.locator('[data-field-code="UUID"] .ant-form-item-has-error')).toHaveCount(0);

    await expect(page.locator('[data-read-field="图片"] img.oxa-file-thumbnail')).toHaveAttribute('src', /blob:/);
    await expect(page.locator('[data-read-field="富文本"] img')).toHaveAttribute('src', /blob:/);
    expect(await page.locator('[data-read-field="图片"] img.oxa-file-thumbnail').evaluate(
      image => (image as HTMLImageElement).naturalWidth
    )).toBeGreaterThan(0);
    expect(await page.locator('[data-read-field="富文本"] img').evaluate(
      image => (image as HTMLImageElement).naturalWidth
    )).toBeGreaterThan(0);
    await expect(page.locator('[aria-label="当前协议字段变更记录"]')).not.toContainText('[object Object]');
    await expect(page.locator('[data-audit-digest="rich-text"]')).toContainText('大值摘要');

    await page.locator('[data-field-code="精确定位"]').getByRole('button', { name: '浏览器定位' }).click();
    await expect(page.locator('[data-field-code="精确定位"]')).toContainText('120.123456');
    await expect(page.locator('[data-field-code="精确定位"]')).toContainText('30.234567');

    await page
      .locator('[data-field-code="业务签名"]')
      .getByRole('button', { name: /(?:开始|重新)签名/ })
      .click();
    const canvas = page.locator('canvas[aria-label="手写签名画布"]');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await canvas.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'pen',
      buttons: 1,
      clientX: box!.x + 30,
      clientY: box!.y + 40,
    });
    for (let step = 1; step <= 8; step += 1) {
      await canvas.dispatchEvent('pointermove', {
        pointerId: 1,
        pointerType: 'pen',
        buttons: 1,
        clientX: box!.x + 30 + (130 * step) / 8,
        clientY: box!.y + 40 + (80 * step) / 8,
      });
    }
    await canvas.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'pen',
      buttons: 0,
      clientX: box!.x + 160,
      clientY: box!.y + 120,
    });
    const saveSignature = page.getByRole('button', { name: '保存签名' });
    await expect(saveSignature).toBeEnabled();
    await saveSignature.click();
    await expect(page.locator('[data-field-code="业务签名"]')).not.toContainText('尚未签名');
    await expect(page.getByRole('dialog', { name: '手写签名' })).toBeHidden();

    expect(pageErrors).toEqual([]);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.screenshot({ fullPage: true, path: 'test-results/field-protocol-desktop.png' });
  });

  test('resource selectors query once when selection changes', async ({ page }) => {
    const requestCounts = new Map<string, number>();
    await page.route('**/source/query', async route => {
      const match = new URL(route.request().url()).pathname.match(/\/fields\/([^/]+)\/source\/query$/);
      const fieldCode = decodeURIComponent(match?.[1] || 'unknown');
      requestCounts.set(fieldCode, (requestCounts.get(fieldCode) || 0) + 1);
      const body = route.request().postDataJSON() as { operation?: 'create' | 'update' };
      await route.fulfill({
        contentType: 'application/json',
        json: {
          schemaVersion: 'openxiangda.data-field-source-page/v2',
          environment: {
            id: 'field-protocol-environment',
            key: 'preproduction',
            activeAppVersionId: 'field-protocol-version',
            headRevision: 1,
            authzRevisionId: 'field-protocol-authz',
            authzVersion: 1,
            scopeDataVersion: 'field-protocol-scope',
          },
          resourceCode: 'field-records',
          fieldCode,
          sourceResourceCode: 'field-lookups',
          operation: body.operation || 'create',
          items: [{
            label: `候选-${fieldCode}`,
            value: `candidate-${fieldCode}`,
            resourceCode: 'field-lookups',
            snapshot: { code: `code-${fieldCode}` },
          }],
          nextCursor: null,
        },
      });
    });

    await page.goto('/field-protocol.e2e.html');
    await expect(page.locator('[data-field-code]')).toHaveCount(fieldCount);
    await page.waitForLoadState('networkidle');
    for (const fieldCode of ['资源单选', '资源多选']) {
      const combobox = page
        .locator(`[data-field-code="${fieldCode}"]`)
        .getByRole('combobox');
      await expect(combobox).toBeVisible();
      await combobox.click();
      const dropdown = page.locator('.ant-select-dropdown:visible');
      await expect(dropdown).toBeVisible();
      await expect.poll(() => requestCounts.get(fieldCode) || 0).toBe(1);
      await dropdown
        .locator('.ant-select-item-option')
        .filter({ hasText: `候选-${fieldCode}` })
        .click();
      await page.waitForTimeout(500);
      expect(requestCounts.get(fieldCode)).toBe(1);
      await page.keyboard.press('Escape');
      await expect(dropdown).toBeHidden();
    }
  });

  test('mobile selection, numeric validation and save/reload keep canonical values', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/field-protocol.e2e.html?mode=mobile');
    const field = (label: string) => page.locator(`[data-field-code="${label}"]`);
    await field('单行文本').getByRole('textbox').fill('移动录入验证');
    await field('整数').getByRole('textbox').fill('1.5');
    await page.getByRole('button', { name: '验证表单', exact: true }).click();
    await expect(field('整数').getByRole('alert')).toContainText('整数');
    await expect(page.locator('[data-saved-values]')).toBeEmpty();
    await field('整数').getByRole('textbox').fill('12');
    await field('小数').getByRole('textbox').fill('12.75');
    await field('金额').getByRole('textbox').fill('');
    const moneyInput = await field('金额').getByRole('textbox').boundingBox();
    const currency = await field('金额').locator('[aria-hidden="true"]').first().boundingBox();
    expect(moneyInput!.height).toBeGreaterThanOrEqual(24);
    // Currency must stay beside the editable value, even with the full React stylesheet.
    expect(currency!.y + currency!.height / 2).toBeGreaterThan(moneyInput!.y);
    expect(currency!.y + currency!.height / 2).toBeLessThan(moneyInput!.y + moneyInput!.height);

    const choice = field('静态单选下拉');
    const oldChoice = await choice.getByRole('button', { name: '选择静态单选下拉' }).innerText();
    await choice.getByRole('button', { name: '选择静态单选下拉' }).click();
    await choice.getByText('停用', { exact: true }).last().click();
    await choice.getByRole('button', { name: '取消', exact: true }).click();
    await expect(choice.getByRole('button', { name: '选择静态单选下拉' })).toHaveText(oldChoice);
    await choice.getByRole('button', { name: '选择静态单选下拉' }).click();
    await choice.getByText('停用', { exact: true }).last().click();
    await choice.getByRole('button', { name: '确定', exact: true }).click();
    await expect(choice.getByRole('button', { name: '选择静态单选下拉' })).toHaveText('停用');

    await field('日期').getByRole('button', { name: '选择日期', exact: true }).click();
    await field('日期').getByText('确定', { exact: true }).click();
    await field('时间').getByRole('button', { name: '选择时间', exact: true }).click();
    await field('时间').getByText('确定', { exact: true }).click();
    await page.getByRole('button', { name: '验证表单', exact: true }).click();
    const result = page.locator('[data-saved-values]');
    await expect(result).toContainText('移动录入验证');
    const stored = JSON.parse(await result.innerText());
    expect(stored['整数']).toBe(12);
    expect(stored['小数']).toBe(12.75);
    expect(stored['金额']).toBeNull();
    expect(stored['静态单选下拉']).toEqual({ label: '停用', value: 'disabled' });
    expect(stored['日期']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stored['时间']).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    await field('单行文本').getByRole('textbox').fill('未保存修改');
    await page.getByRole('button', { name: '重新载入已保存值' }).click();
    await expect(field('单行文本').getByRole('textbox')).toHaveValue('移动录入验证');
    await expect(field('小数').getByRole('textbox')).toHaveValue('12.75');
    await field('日期').getByRole('button', { name: '清空日期', exact: true }).click();
    await page.getByRole('button', { name: '验证表单', exact: true }).click();
    await expect.poll(async () => JSON.parse(await result.innerText())['日期']).toBeNull();
    expect(pageErrors).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/foundation-mobile-controls.png' });
  });

  test('renders every mobile control without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/field-protocol.e2e.html?mode=mobile');
    await expect(page.locator('[data-field-code]')).toHaveCount(fieldCount);
    await expect(page.locator('.oxa-mobile-field')).toHaveCount(fieldCount);
    await expect(page.locator('[data-field-code="精确定位"] input')).toHaveCount(0);
    await expect(page.locator('[data-field-code="附件"] input[type="file"]')).toBeHidden();
    await expect(page.locator('.ant-alert-error')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.screenshot({ fullPage: true, path: 'test-results/field-protocol-mobile.png' });
  });

  test('mobile default components and popups do not reset the surrounding page', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/field-protocol.e2e.html?mode=mobile-surface');
    const outsideStyles = () => page.evaluate(() => ({
      background: getComputedStyle(document.documentElement).backgroundColor,
      color: getComputedStyle(document.body).color,
      fontSize: getComputedStyle(document.body).fontSize,
      fontFamily: getComputedStyle(document.body).fontFamily,
      link: getComputedStyle(document.getElementById('outside-mobile')!).color,
      mobilePrimary: getComputedStyle(document.documentElement).getPropertyValue('--adm-color-primary'),
    }));
    const baseline = {
      background: 'rgb(248, 249, 250)', color: 'rgb(31, 32, 33)',
      fontSize: '17px', fontFamily: 'monospace', link: 'rgb(101, 42, 140)', mobilePrimary: '',
    };
    expect(await outsideStyles()).toEqual(baseline);
    await page.getByRole('textbox', { name: '平台移动输入' }).fill('弹层继承当前页面');
    await page.getByRole('button', { name: '打开移动弹层' }).click();
    const popup = page.locator('.oxa-mobile-scope .adm-popup-body');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('弹层继承当前页面');
    await expect(popup).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    expect(await outsideStyles()).toEqual(baseline);
    await popup.getByRole('button', { name: '关闭弹层' }).click();
    await expect(popup).toBeHidden();
    expect(await outsideStyles()).toEqual(baseline);
    expect(pageErrors).toEqual([]);
  });
});
