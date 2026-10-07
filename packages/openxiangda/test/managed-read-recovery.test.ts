import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverManagedRead } from '../src/browser/managed-read-recovery';

const busy = (status = 429, code = 'CONCURRENCY_API_BUSY', retryAfterMs = 0) =>
  Object.assign(new Error(code), { status, code, retryAfterMs });
function clock(random = 0) {
  let now = 0;
  const waits: number[] = [];
  return { waits, advance: (ms: number) => { now += ms; }, dependencies: { now: () => now, random: () => random,
    sleep: async (ms: number) => { waits.push(ms); now += ms; } } };
}

test('known read budget busy retries with exponential delay, server hint and jitter', async () => {
  for (const [status, code] of [[429, 'CONCURRENCY_API_BUSY'], [429, 'CONCURRENCY_RESULT_BUSY'],
    [429, 'CONCURRENCY_RATE_LIMITED'], [429, 'CONCURRENCY_SOURCE_BUSY'],
    [503, 'CONCURRENCY_API_BUSY'], [503, 'CONCURRENCY_RESULT_BUSY']] as const) {
    const c = clock(1); let calls = 0;
    const result = await recoverManagedRead(async signal => {
      assert.equal(signal.aborted, false);
      if (++calls <= 2) throw busy(status, code, calls === 1 ? 6000 : 0);
      return 'loaded';
    }, undefined, undefined, c.dependencies);
    assert.equal(result, 'loaded'); assert.equal(calls, 3);
    assert.deepEqual(c.waits, [7500, 5000]);
  }
});

test('permission, dependency, unknown and explicitly non-retryable errors are returned once', async () => {
  for (const budgetMs of [undefined, 1_800_000]) for (const error of [busy(403), busy(503, 'CONCURRENCY_COORDINATION_UNAVAILABLE'),
    busy(503, 'CONCURRENCY_CACHE_UNAVAILABLE'), busy(503, 'CONCURRENCY_SOURCE_BUSY'),
    busy(503, 'OPENXIANGDA_AUTHORIZATION_PROJECTION_NOT_READY'),
    Object.assign(busy(503, 'PLATFORM_TRANSPORT_UNAVAILABLE'), { retryable: false }),
    busy(429, 'HTTP_429'), Object.assign(busy(), { retryable: false }), new TypeError('offline')]) {
    const c = clock(); let calls = 0;
    await assert.rejects(() => recoverManagedRead(async () => { calls++; throw error; }, undefined, { budgetMs }, c.dependencies),
      received => received === error);
    assert.equal(calls, 1); assert.deepEqual(c.waits, []);
  }
});

test('marked transport failures share the same fixed backoff budget as busy reads', async () => {
  const c = clock(1); let calls = 0;
  const result = await recoverManagedRead(async () => {
    calls++;
    if (calls === 1) throw busy(503, 'PLATFORM_TRANSPORT_UNAVAILABLE');
    if (calls === 2) throw busy(429, 'CONCURRENCY_RESULT_BUSY', 8000);
    return 'original result';
  }, undefined, { budgetMs: 30000 }, c.dependencies);
  assert.equal(result, 'original result'); assert.equal(calls, 3);
  assert.deepEqual(c.waits, [2500, 10000]);
  const offline = clock(), error = busy(503, 'PLATFORM_TRANSPORT_UNAVAILABLE'); let reads = 0;
  await assert.rejects(() => recoverManagedRead(async () => { reads++; throw error; }, undefined,
    { budgetMs: 4000 }, offline.dependencies), received => received === error);
  assert.equal(reads, 2); assert.deepEqual(offline.waits, [2000]);
});

test('attempts are bounded independently of the clock and failures preserve the last response', async () => {
  for (const [budgetMs, attempts] of [[undefined, 12], [120_000, 12], [1_800_000, 120]] as const) {
    const error = busy(); let calls = 0, waits = 0;
    await assert.rejects(() => recoverManagedRead(async () => { calls++; throw error; }, undefined, { budgetMs },
      { now: () => 0, random: () => 0, sleep: async () => { waits++; } }), received => received === error);
    assert.equal(calls, attempts); assert.equal(waits, attempts - 1);
  }
});

test('the default total budget remains 120 seconds and may be narrowed', async () => {
  for (const budgetMs of [undefined, 120000, 4000]) {
    const c = clock(); const error = busy(); let calls = 0;
    await assert.rejects(() => recoverManagedRead(async () => { calls++; throw error; }, undefined, { budgetMs }, c.dependencies),
      received => received === error);
    if (budgetMs === 4000) { assert.equal(calls, 2); assert.deepEqual(c.waits, [2000]); }
    else { assert.equal(calls, 7); assert.deepEqual(c.waits, [2000, 4000, 8000, 16000, 30000, 30000]); }
  }
  const c = clock(); let calls = 0;
  await assert.rejects(() => recoverManagedRead(async () => { calls++; throw busy(429, undefined, 180000); }, undefined, undefined, c.dependencies));
  assert.equal(calls, 1); assert.deepEqual(c.waits, []);
});

test('an explicit long budget recovers after two minutes and twelve requests', async () => {
  for (const budgetMs of [900_000, 1_800_000]) {
    const c = clock(1); let calls = 0;
    const result = await recoverManagedRead(async () => {
      if (++calls <= 13) throw busy(429, 'CONCURRENCY_SOURCE_BUSY', 8000);
      return 'loaded';
    }, undefined, { budgetMs }, c.dependencies);
    assert.equal(result, 'loaded'); assert.equal(calls, 14);
    assert.ok(c.dependencies.now() > 120000);
    assert.deepEqual(c.waits.slice(0, 4), [10000, 10000, 10000, 20000]);
    assert.ok(c.waits.slice(4).every(wait => wait === 37500));
  }
});

test('long recovery respects one fixed deadline and clamps budgets above thirty minutes', async () => {
  for (const budgetMs of [1_800_000, 3_600_000]) {
    const c = clock(), error = busy(); let calls = 0;
    await assert.rejects(() => recoverManagedRead(async () => {
      calls++; throw error;
    }, undefined, { budgetMs }, c.dependencies), received => received === error);
    assert.equal(calls, 63); assert.equal(c.dependencies.now(), 1770000);
    assert.equal(c.waits.length, 62);
  }
  const c = clock(), error = busy(); let calls = 0;
  await assert.rejects(() => recoverManagedRead(async () => {
    calls++; c.advance(20000); throw error;
  }, undefined, { budgetMs: 180000 }, c.dependencies), received => received === error);
  assert.equal(calls, 6); assert.equal(c.dependencies.now(), 180000);
  assert.deepEqual(c.waits, [2000, 4000, 8000, 16000, 30000]);
});

test('invalid or exhausted caller budgets fail before the first request', async () => {
  let calls = 0;
  for (const budgetMs of [NaN, Infinity, -1])
    await assert.rejects(() => recoverManagedRead(async () => { calls++; }, undefined, { budgetMs }),
      { code: 'CONCURRENCY_READ_RECOVERY_BUDGET_INVALID' });
  await assert.rejects(() => recoverManagedRead(async () => { calls++; }, undefined, { budgetMs: 0 }),
    { code: 'CONCURRENCY_READ_RECOVERY_EXHAUSTED' });
  assert.equal(calls, 0);
});

test('caller abort interrupts backoff and no subsequent request is started', async () => {
  for (const budgetMs of [undefined, 1_800_000]) {
  const controller = new AbortController(), reason = new Error('screen closed');
  let calls = 0, sleeping!: () => void;
  const reached = new Promise<void>(resolve => { sleeping = resolve; });
  const pending = recoverManagedRead(async () => { calls++; throw busy(); }, controller.signal, { budgetMs },
    { now: () => 0, random: () => 0, sleep: async () => { sleeping(); await new Promise(() => {}); } });
  const rejected = assert.rejects(pending, received => received === reason);
  await reached; controller.abort(reason); await rejected; assert.equal(calls, 1);
  await assert.rejects(() => recoverManagedRead(async () => { calls++; }, controller.signal), received => received === reason);
  assert.equal(calls, 1);
  }
});

test('deadline interrupts even a transport that ignores its signal', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(() => recoverManagedRead(async active => { signal = active; return new Promise(() => {}); }, undefined, { budgetMs: 10 }),
    { code: 'CONCURRENCY_READ_RECOVERY_EXHAUSTED' });
  assert.equal(signal?.aborted, true);
});

test('a hung transport after budget busy is a deadline failure, not another busy response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const rejected = assert.rejects(recoverManagedRead(async () => {
    if (++calls === 1) throw busy();
    return new Promise(() => {});
  }, undefined, { budgetMs: 3000 }, { now: () => 0, random: () => 0, sleep: async () => {} }),
    { code: 'CONCURRENCY_READ_RECOVERY_EXHAUSTED', status: 504 });
  while (calls < 2) await Promise.resolve();
  t.mock.timers.tick(3000); await rejected;
  assert.equal(calls, 2);
});

test('a long deadline aborts a pending transport without disguising it as previous busy', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, signal: AbortSignal | undefined;
  const rejected = assert.rejects(recoverManagedRead(async active => {
    signal = active;
    if (++calls === 1) throw busy();
    return new Promise(() => {});
  }, undefined, { budgetMs: 1800000 }, { now: () => 0, random: () => 0, sleep: async () => {} }),
    { code: 'CONCURRENCY_READ_RECOVERY_EXHAUSTED', status: 504 });
  while (calls < 2) await Promise.resolve();
  t.mock.timers.tick(1799999); assert.equal(signal?.aborted, false);
  t.mock.timers.tick(1); await rejected;
  assert.equal(calls, 2); assert.equal(signal?.aborted, true);
});
