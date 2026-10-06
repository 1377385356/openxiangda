import { test, expect } from '@playwright/test';

for (const control of ['edit', 'generated-form', 'filter', 'range']) {
  test(`declared minute precision drives PC ${control} without a caller step`, async ({ page }, info) => {
    await page.goto('/zoned-time.e2e.html?precision=minute');
    await page.getByTestId(control).locator('input').first().click();
    const columns = page.locator('.ant-picker-dropdown:visible .ant-picker-time-panel-column');
    await expect(columns).toHaveCount(2);
    // A non-quarter minute demonstrates the declaration, not the fixture's old 15-minute step.
    await columns.nth(0).getByText('09', { exact: true }).click();
    await columns.nth(1).getByText('16', { exact: true }).click();
    await page.locator('.ant-picker-dropdown:visible').getByRole('button', { name: /^(?:OK|确\s*定)$/ }).click();
    if (control === 'range') {
      await page.getByTestId('range').locator('input').nth(1).click();
      await columns.nth(0).getByText('10', { exact: true }).click();
      await columns.nth(1).getByText('17', { exact: true }).click();
      await page.locator('.ant-picker-dropdown:visible').getByRole('button', { name: /^(?:OK|确\s*定)$/ }).click();
      await expect(page.getByTestId('range-canonical')).toHaveText('{"start":"2026-03-08T01:16:00.000Z","end":"2026-03-08T02:17:00.000Z"}');
    } else {
      await expect(page.getByTestId(control === 'generated-form' ? 'form-canonical' : 'canonical')).toHaveText('"2026-03-08T01:16:00.000Z"');
    }
    await page.screenshot({ path: info.outputPath('declared-minute-pc.png'), animations: 'disabled' });
  });
}

test('declared minutes are consistent in readonly summaries and explicit timezones', async ({ page }) => {
  await page.goto('/zoned-time.e2e.html?precision=minute');
  for (const target of ['display', 'summary']) {
    await expect(page.getByTestId(target)).toContainText('02:15');
    await expect(page.getByTestId(target)).not.toContainText('02:15:00');
  }
  await expect(page.getByTestId('override')).toContainText('18:15');
  await expect(page.getByTestId('override')).not.toContainText('18:15:00');
  await expect(page.getByTestId('plain-date')).toHaveText('2026-03-08');
});

test('mobile declared minutes confirm both range endpoints and preserve cancellation', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/zoned-time.e2e.html?precision=minute&mobile=1');
  await page.getByTestId('edit').getByRole('button', { name: '选择会议开始', exact: true }).click();
  const single = page.getByRole('dialog', { name: '选择会议开始' });
  await expect(single.locator('.adm-picker-view-column')).toHaveCount(3);
  await single.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.getByTestId('canonical')).toHaveText('"2026-03-07T18:15:00.000Z"');
  await page.getByTestId('range').getByRole('button', { name: '选择会议区间', exact: true }).click();
  const range = page.getByRole('dialog', { name: '选择会议区间' });
  await expect(range.locator('.adm-picker-view-column')).toHaveCount(3);
  await range.getByRole('button', { name: '下一步', exact: true }).click();
  await range.getByRole('button', { name: '上一步', exact: true }).click();
  await range.getByRole('button', { name: '取消', exact: true }).click();
  const stored = '{"start":"2026-03-07T18:15:00.000Z","end":"2026-03-07T19:15:00.000Z"}';
  await expect(page.getByTestId('range-canonical')).toHaveText(stored);
  await page.getByTestId('range').getByRole('button', { name: '选择会议区间', exact: true }).click();
  await range.getByRole('button', { name: '下一步', exact: true }).click();
  await range.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.getByTestId('range-canonical')).toHaveText(stored);
  await page.screenshot({ path: info.outputPath('declared-minute-mobile.png'), animations: 'disabled' });
});

test('mobile minute declaration preserves invalid stored seconds until the user changes them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/zoned-time.e2e.html?precision=minute&mobile=1&value=2026-03-07T18%3A15%3A01Z');
  await page.getByTestId('edit').getByRole('button', { name: '选择会议开始', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '选择会议开始' });
  await expect(dialog.getByRole('alert')).toContainText('整 1 分钟');
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByTestId('canonical')).toHaveText('"2026-03-07T18:15:01Z"');
});
