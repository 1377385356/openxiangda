import { expect, test, type Page } from '@playwright/test';

const field = (page: Page, name: string) => page.locator(`[data-field-code="${name}"]`);
const file = (name: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from('acceptance') });
async function submit(page: Page) {
  await page.getByRole('button', { name: '验证表单', exact: true }).click();
  await expect(page.locator('[data-saved-values]')).not.toBeEmpty();
  return JSON.parse(await page.locator('[data-saved-values]').innerText());
}

test.describe('mobile managed files', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/china-divisions/**', route => route.fulfill({ json: [] }));
    await page.route('**/files/*/content?**', route => route.fulfill({ contentType: 'image/svg+xml', body:
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#f1f3f5"/><circle cx="470" cy="120" r="45" fill="#c6d3df"/><path d="M0 480L220 180L410 480M230 480L450 250L640 480" fill="#95a9bb"/><text x="30" y="50" font-family="sans-serif" font-size="24" fill="#34495e">Image preview fixture</text></svg>' }));
  });

  test('failed uploads retry, removed pending results stay removed and limits do not truncate', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let attempts = 0;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/__field-upload-fixture', async route => {
      const name = decodeURIComponent(route.request().headers()['x-file-name']);
      if (name === '待移除.txt') await held;
      if (name === '重试.txt' && ++attempts === 1) return route.fulfill({ status: 503, body: '网络暂不可用，请重试。已填写内容会保留。' });
      await route.fulfill({ status: 204 });
    });
    await page.goto('/field-protocol.e2e.html?mode=mobile&controlledUploads=1');
    const attachment = field(page, '附件');
    await attachment.locator('input[type=file]').setInputFiles(file('重试.txt'));
    await expect(attachment.getByRole('alert')).toContainText('网络暂不可用');
    await expect(attachment.locator('.ant-btn')).toHaveCount(0);
    await expect(attachment.locator('input[type=file]')).toBeHidden();
    await attachment.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('mobile-file-retry.png') });
    await attachment.getByRole('button', { name: '重试', exact: true }).click();
    await expect(attachment.getByRole('button', { name: '预览重试.txt', exact: true })).toBeVisible();
    expect(attempts).toBe(2);
    await attachment.locator('input[type=file]').setInputFiles(file('待移除.txt'));
    const pending = attachment.locator('.oxa-mobile-upload-card');
    await expect(pending).toContainText('上传中');
    await pending.getByRole('button', { name: '移除', exact: true }).click();
    release();
    await expect(attachment.locator('.oxa-mobile-upload-card')).toHaveCount(0);
    await attachment.locator('input[type=file]').setInputFiles([file('超额一.txt'), file('超额二.txt')]);
    await expect(attachment.getByRole('alert')).toContainText('还可选择 1 个文件');
    const saved = await submit(page);
    expect(saved['附件'].map((item: { name: string }) => item.name)).toEqual(['验收附件.pdf', '重试.txt']);
    await page.getByRole('button', { name: '重新载入已保存值' }).click();
    await expect(attachment.getByRole('button', { name: '预览重试.txt', exact: true })).toBeVisible();
    await attachment.getByRole('button', { name: '移除重试.txt', exact: true }).click();
    expect((await submit(page))['附件']).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('mobile image preview, close and attachment download use existing file APIs', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/files/*/preview?**', route => route.fulfill({ json: {
      canPreview: true, previewType: 'image', file: { name: '验收图片.png' },
    } }));
    await page.goto('/field-protocol.e2e.html?mode=mobile');
    const images = field(page, '图片');
    await expect(images.getByRole('button', { name: '上传图片', exact: true })).toBeVisible();
    await images.locator('input[type=file]').setInputFiles({ name: '第二张.png', mimeType: 'image/png', buffer: Buffer.from('fixture-image') });
    await expect(images.getByRole('button', { name: '预览第二张.png', exact: true })).toBeVisible();
    await expect(images.getByRole('button', { name: '预览验收图片.png', exact: true })).toBeVisible();
    await images.getByRole('button', { name: '预览第二张.png', exact: true }).click();
    await expect(page.getByRole('button', { name: '关闭预览', exact: true })).toBeVisible();
    await expect(page.locator('.ant-image-preview')).toHaveCount(0);
    await expect(page.locator('.adm-image-viewer-indicator')).toHaveText('2 / 2');
    await expect(page.locator('.adm-image-viewer-image-wrapper img').last()).toHaveJSProperty('naturalWidth', 640);
    await page.screenshot({ path: info.outputPath('mobile-image-preview.png') });
    const imageDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载', exact: true }).click();
    expect((await imageDownload).suggestedFilename()).toBe('第二张.png');
    await page.getByRole('button', { name: '关闭预览', exact: true }).click();
    await expect(page.getByRole('button', { name: '关闭预览', exact: true })).toHaveCount(0);
    let downloadAttempts = 0;
    await page.route('**/files/11111111-1111-4111-8111-111111111111/content?**', route => {
      downloadAttempts += 1;
      return downloadAttempts === 1 ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ body: 'download acceptance', contentType: 'application/pdf' });
    });
    await field(page, '附件').getByRole('button', { name: '下载验收附件.pdf', exact: true }).click();
    await expect(page.getByText('FILE_CONTENT_READ_FAILED: HTTP_503', { exact: true })).toBeVisible();
    await expect(field(page, '附件').getByRole('button', { name: '预览验收附件.pdf', exact: true })).toBeVisible();
    const download = page.waitForEvent('download');
    await field(page, '附件').getByRole('button', { name: '下载验收附件.pdf', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('验收附件.pdf');
    expect(errors).toEqual([]);
  });
});
