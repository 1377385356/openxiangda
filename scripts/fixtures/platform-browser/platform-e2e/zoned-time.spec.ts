import { test, expect } from '@playwright/test';

for (const timezoneId of ['UTC', 'America/Los_Angeles', 'Asia/Shanghai']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test('PC input, generated form and standard summary share Shanghai instants', async ({ page }, info) => {
      await page.goto('/zoned-time.e2e.html');
      await expect(page.getByTestId('edit').locator('input')).toHaveValue('2026-03-08 02:15');
      await expect(page.getByTestId('generated-form').locator('input')).toHaveValue('2026-03-08 02:15');
      await expect(page.getByTestId('summary')).toContainText('02:15:00');
      await expect(page.getByTestId('override')).toContainText('18:15:00');
      await expect(page.getByTestId('plain-date')).toHaveText('2026-03-08');
      const input = page.getByTestId('edit').locator('input');
      await input.fill('2026-03-08 02:30');
      await input.press('Enter');
      await expect(page.getByTestId('canonical')).toHaveText('"2026-03-07T18:30:00.000Z"');
      await expect(page.getByTestId('form-canonical')).toHaveText('"2026-03-07T18:15:00.000Z"');
      await page.screenshot({ path: info.outputPath('zoned-desktop.png'), animations: 'disabled' });
    });

    test('mobile wheels preserve range cancellation and canonical confirmation', async ({ page }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/zoned-time.e2e.html?mobile=1');
      await page.getByTestId('edit').getByRole('button', { name: '选择会议开始', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '选择会议开始' });
      await expect(dialog.locator('.adm-picker-view')).toBeVisible();
      await expect.poll(async () => {
        const box = await dialog.boundingBox();
        return Boolean(box && box.y + box.height <= 845);
      }).toBe(true);
      await page.screenshot({ path: info.outputPath('zoned-mobile.png'), animations: 'disabled' });
      await dialog.getByRole('button', { name: '确定', exact: true }).click();
      await expect(page.getByTestId('canonical')).toHaveText('"2026-03-07T18:15:00.000Z"');
      await page.getByTestId('range').getByRole('button', { name: '选择会议区间', exact: true }).click();
      const range = page.getByRole('dialog', { name: '选择会议区间' });
      await range.getByRole('button', { name: '下一步', exact: true }).click();
      await range.getByRole('button', { name: '上一步', exact: true }).click();
      await range.getByRole('button', { name: '取消', exact: true }).click();
      await expect(page.getByTestId('range-canonical')).toHaveText('{"start":"2026-03-07T18:15:00.000Z","end":"2026-03-07T19:15:00.000Z"}');
    });
  });
}

test('PC validates exact instant bounds and typed minute steps without emitting invalid input', async ({ page }) => {
  await page.goto('/zoned-time.e2e.html?min=2026-03-07T18%3A15%3A00Z&max=2026-03-07T18%3A45%3A00Z');
  const input = page.getByTestId('edit').locator('input');
  for (const [wall, error] of [['2026-03-08 02:00', '早于'], ['2026-03-08 02:16', '整 15 分钟'], ['2026-03-08 03:00', '晚于']]) {
    await input.fill(wall);
    await input.press('Enter');
    await expect(page.getByTestId('edit').getByRole('alert')).toContainText(error);
    await expect(page.getByTestId('canonical')).toHaveText('"2026-03-07T18:15:00.000Z"');
  }
  await input.fill('2026-03-08 02:45');
  await input.press('Enter');
  await expect(page.getByTestId('canonical')).toHaveText('"2026-03-07T18:45:00.000Z"');
  await input.fill('2026-03-08 02:15');
  await input.press('Enter');
  await expect(page.getByTestId('canonical')).toHaveText('"2026-03-07T18:15:00.000Z"');
  await expect(page.getByTestId('edit').getByRole('alert')).toHaveCount(0);
});

test('PC range and generated form commit canonical instants', async ({ page }) => {
  await page.goto('/zoned-time.e2e.html');
  const form = page.getByTestId('generated-form').locator('input');
  await form.fill('2026-03-08 02:45');
  await form.press('Enter');
  await expect(page.getByTestId('form-canonical')).toHaveText('"2026-03-07T18:45:00.000Z"');
  const start = page.getByTestId('range').locator('input').nth(0);
  const end = page.getByTestId('range').locator('input').nth(1);
  await start.fill('2026-03-08 02:30');
  await start.press('Enter');
  await end.fill('2026-03-08 03:30');
  await end.press('Enter');
  await expect(page.getByTestId('range-canonical')).toHaveText('{"start":"2026-03-07T18:30:00.000Z","end":"2026-03-07T19:30:00.000Z"}');
});

test('mobile rejects an out of bounds stored time without emitting on cancel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/zoned-time.e2e.html?mobile=1&max=2026-03-07T18%3A00%3A00Z');
  await page.getByTestId('edit').getByRole('button', { name: '选择会议开始', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '选择会议开始' });
  await expect(dialog.getByRole('alert')).toContainText('晚于');
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByTestId('canonical')).toHaveText('"2026-03-07T18:15:00.000Z"');
});

for (const wall of ['2026-03-08 02:15', '2026-11-01 01:15']) {
  test(`rejects ambiguous/nonexistent LA time ${wall}`, async ({ page }) => {
    await page.goto('/zoned-time.e2e.html?zone=America%2FLos_Angeles');
    const input = page.getByTestId('edit').locator('input');
    await input.fill(wall);
    await input.press('Enter');
    await expect(page.getByTestId('edit').getByRole('alert')).toContainText('不存在或有重复');
    await expect(page.getByTestId('canonical')).toHaveText('"2026-03-07T18:15:00.000Z"');
  });
}
