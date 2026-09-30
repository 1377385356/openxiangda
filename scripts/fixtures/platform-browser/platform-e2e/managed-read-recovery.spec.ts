import { expect, test } from '@playwright/test';
import { runtimeAuthorization } from './resource-platform-mock';

test('known budget busy keeps loading, then recovers detail and mine without writes', async ({ page }, testInfo) => {
  const attempts = new Map<string, number>();
  const bodies = new Map<string, unknown[]>();
  const firstAt = new Map<string, number>();
  await page.route('**/native/authz/current?*', route => route.fulfill({ json: { code: 200, data: runtimeAuthorization(true, true) } }));
  await page.route('**/native/concurrency/**', async route => {
    const path = new URL(route.request().url()).pathname;
    expect(path.endsWith('/reads/offer') || path.endsWith('/commands/claim/mine')).toBe(true);
    const count = (attempts.get(path) || 0) + 1;
    attempts.set(path, count);
    bodies.set(path, [...(bodies.get(path) || []), route.request().postDataJSON()]);
    if (count === 1) {
      firstAt.set(path, Date.now());
      await route.fulfill({ status: 429, headers: { 'Retry-After': '2' }, json: {
        code: 429, errorCode: 'CONCURRENCY_API_BUSY', retryable: true, data: null,
      } });
    } else {
      expect(Date.now() - firstAt.get(path)!).toBeGreaterThanOrEqual(1900);
      await route.fulfill({ json: { code: 200, data: path.endsWith('/mine')
        ? { items: [] }
        : { data: { title: '校园音乐会' }, freshness: 'fresh' } } });
    }
  });
  await page.goto('/managed-read-recovery.e2e.html');
  await expect(page.getByRole('status')).toHaveText('正在加载活动及本人申请');
  await expect(page.getByRole('heading', { name: '校园音乐会' })).toBeVisible({ timeout: 10_000 });
  expect([...attempts.values()]).toEqual([2, 2]);
  for (const original of bodies.values()) expect(original[1]).toEqual(original[0]);
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('budget-recovered.png'), fullPage: true });
});

test('a real dependency failure is shown immediately and is never retried', async ({ page }, testInfo) => {
  let calls = 0;
  await page.route('**/native/authz/current?*', route => route.fulfill({ json: { code: 200, data: runtimeAuthorization(true, true) } }));
  await page.route('**/native/concurrency/**', route => {
    if (route.request().url().endsWith('/mine')) return route.fulfill({ json: { code: 200, data: { items: [] } } });
    calls++;
    return route.fulfill({ status: 503, json: { code: 503, errorCode: 'CONCURRENCY_CACHE_UNAVAILABLE', data: null } });
  });
  await page.clock.install();
  await page.goto('/managed-read-recovery.e2e.html');
  await expect(page.getByRole('alert')).toHaveText('服务暂时不可用，请稍后重试');
  await page.clock.fastForward(125_000);
  expect(calls).toBe(1);
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('dependency-failure.png'), fullPage: true });
});
