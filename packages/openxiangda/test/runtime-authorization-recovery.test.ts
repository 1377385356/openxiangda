import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverRuntimeAuthorizationRead } from '../src/browser/runtime-authorization-recovery';

const failure = (status: number, code: string, extra = {}) => Object.assign(new Error(code), { status, code, ...extra });
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function clock(random = 0) {
  let elapsed = 0;
  const delays: number[] = [];
  return {
    delays, advance: (ms: number) => { elapsed += ms; },
    dependencies: { now: () => elapsed, random: () => random,
      sleep: async (ms: number, signal: AbortSignal) => {
        if (signal.aborted) throw signal.reason;
        delays.push(ms); elapsed += ms;
      } },
  };
}

test('runtime current recovers known busy with bounded exponential jitter and server hints', async () => {
  const time = clock(1);
  let calls = 0;
  const value = await recoverRuntimeAuthorizationRead(async () => {
    calls++;
    if (calls === 1) throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY', { retryAfterMs: 8000 });
    if (calls < 8) throw failure(429, 'CONCURRENCY_API_BUSY');
    return 'verified';
  }, undefined, time.dependencies);
  assert.equal(value, 'verified'); assert.equal(calls, 8);
  assert.deepEqual(time.delays, [10_000, 5000, 10_000, 20_000, 37_500, 37_500, 37_500]);
});

test('runtime refuses dependency, authorization, version and unknown busy errors without retry', async () => {
  for (const error of [failure(401, 'HTTP_401'), failure(403, 'ACCESS_DENIED'), failure(409, 'APPLICATION_VERSION_CHANGED'),
    failure(401, 'PLATFORM_TRANSPORT_UNAVAILABLE'), failure(403, 'PLATFORM_TRANSPORT_UNAVAILABLE'),
    failure(503, 'PLATFORM_TRANSPORT_UNAVAILABLE', { retryable: false }),
    failure(429, 'UNKNOWN_BUSY'), failure(503, 'CONCURRENCY_BOOTSTRAP_BUSY'), failure(503, 'DEPENDENCY_UNAVAILABLE'),
    failure(429, 'CONCURRENCY_API_BUSY', { retryable: false })]) {
    let calls = 0;
    const time = clock();
    await assert.rejects(recoverRuntimeAuthorizationRead(async () => { calls++; throw error; }, undefined, time.dependencies),
      received => received === error);
    assert.equal(calls, 1); assert.deepEqual(time.delays, []);
  }
});

test('read transport recovery allows at most three failures and busy does not reset that allowance', async () => {
  const time = clock();
  const error = failure(503, 'PLATFORM_TRANSPORT_UNAVAILABLE');
  let calls = 0;
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => {
    calls++;
    if (calls % 2 === 0) throw failure(429, 'CONCURRENCY_API_BUSY');
    throw error;
  }, undefined, time.dependencies), received => received === error);
  assert.equal(calls, 5, 'three transport failures and two explicit busy responses');
  assert.deepEqual(time.delays, [2000, 4000, 8000, 16_000]);
  calls = 0;
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => { calls++; throw error; }, undefined, clock().dependencies),
    received => received === error);
  assert.equal(calls, 3);
});

test('projection recovery preserves the three delays and the original ten-second chain', async () => {
  const error = failure(503, 'OPENXIANGDA_AUTHORIZATION_PROJECTION_NOT_READY');
  const time = clock(); let calls = 0;
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => { calls++; throw error; }, undefined, time.dependencies),
    received => received === error);
  assert.equal(calls, 4); assert.deepEqual(time.delays, [250, 750, 1500]);
  const slow = clock(); calls = 0;
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => {
    calls++; slow.advance(9750); throw error;
  }, undefined, slow.dependencies), received => received === error);
  assert.equal(calls, 1); assert.deepEqual(slow.delays, []);
});

test('runtime attempts never exceed 120 even when the scheduler clock fails to progress', async () => {
  let calls = 0;
  const error = failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY');
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => { calls++; throw error; }, undefined,
    { now: () => 0, random: () => 0, sleep: async () => {} }), received => received === error);
  assert.equal(calls, 120);
});

test('current deadline never starts a retry early or accepts a result beyond 300 seconds', async () => {
  const time = clock(); let calls = 0;
  const busy = failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY', { retryAfterMs: 300_000 });
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => { calls++; throw busy; }, undefined, time.dependencies),
    received => received === busy);
  assert.equal(calls, 1); assert.deepEqual(time.delays, []);
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => { time.advance(300_000); return 'late'; },
    undefined, time.dependencies), { code: 'OPENXIANGDA_RUNTIME_AUTHORIZATION_RECOVERY_EXHAUSTED' });
});

test('abort stops runtime waiting and pending transport, including a transport that ignores its signal', async () => {
  for (const wait of [false, true]) {
    const controller = new AbortController(), reason = new Error('left page');
    let calls = 0, transportSignal: AbortSignal | undefined;
    const rejected = assert.rejects(recoverRuntimeAuthorizationRead(async signal => {
      calls++; transportSignal = signal;
      if (wait) throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY');
      return await new Promise<never>(() => {});
    }, controller.signal), received => received === reason);
    await settle(); controller.abort(reason); await rejected;
    assert.equal(calls, 1);
    if (!wait) assert.equal(transportSignal?.aborted, true);
  }
  const cancelled = new AbortController(); cancelled.abort();
  let calls = 0;
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => { calls++; }, cancelled.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('hung current transport stops after three ten-second attempts', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => 0);
  let calls = 0;
  const signals: AbortSignal[] = [];
  const rejected = assert.rejects(recoverRuntimeAuthorizationRead(async signal => {
    calls++; signals.push(signal); return new Promise<never>(() => {});
  }), { name: 'TimeoutError' });
  await settle();
  for (const delay of [10_000, 2000, 10_000, 4000, 10_000]) { t.mock.timers.tick(delay); await settle(); }
  await rejected; assert.equal(calls, 3); assert.ok(signals.every(signal => signal.aborted));
});

test('the 300-second deadline also cancels an outstanding busy sleep', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const rejected = assert.rejects(recoverRuntimeAuthorizationRead(async () => {
    calls++; throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY');
  }), { code: 'OPENXIANGDA_RUNTIME_AUTHORIZATION_RECOVERY_EXHAUSTED' });
  await settle(); t.mock.timers.tick(300_000); await rejected; assert.equal(calls, 1);
});

test('an original entrance receipt can finish identity after five minutes with bounded polling', async () => {
  const time = clock(1); let calls = 0;
  const value = await recoverRuntimeAuthorizationRead(async () => {
    calls++;
    if (calls <= 35) throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY', {
      retryable: true, data: { state: 'waiting', remainingMs: 1_200_000 - time.dependencies.now(), retryAfterMs: 15_000 },
    });
    return 'verified';
  }, undefined, time.dependencies);
  assert.equal(value, 'verified'); assert.equal(calls, 36);
  assert.equal(time.dependencies.now(), 630_000);
  assert.ok(time.delays.every(ms => ms === 18_000), 'receipt polling stays inside the twenty-second wave');
});

test('later receipt hints cannot refresh the original entrance deadline', async () => {
  const time = clock(); let calls = 0;
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => {
    calls++;
    throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY', { data: {
      state: 'waiting', remainingMs: calls === 1 ? 60_000 : 1_800_000, retryAfterMs: 15_000,
    } });
  }, undefined, time.dependencies), { code: 'CONCURRENCY_BOOTSTRAP_BUSY' });
  assert.equal(calls, 4); assert.equal(time.dependencies.now(), 45_000);
});

test('entrance waiting caps inflated receipt duration at thirty minutes from the original start', async () => {
  const time = clock(); let calls = 0;
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => {
    calls++;
    throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY', {
      data: { state: 'waiting', remainingMs: Number.MAX_SAFE_INTEGER, retryAfterMs: 15_000 },
    });
  }, undefined, time.dependencies), { code: 'CONCURRENCY_BOOTSTRAP_BUSY' });
  assert.equal(calls, 120); assert.equal(time.dependencies.now(), 1_785_000);
});

test('invalid or unrelated metadata cannot extend identity recovery; terminal receipt never retries', async () => {
  for (const data of [null, { state: 'waiting', remainingMs: '1200000' }, { state: 'waiting', remainingMs: NaN },
    { state: 'waiting', remainingMs: -1 }, { state: 'unavailable', remainingMs: 1_200_000 }]) {
    const time = clock(); let calls = 0;
    await assert.rejects(recoverRuntimeAuthorizationRead(async () => {
      calls++; throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY', { data });
    }, undefined, time.dependencies), { code: 'CONCURRENCY_BOOTSTRAP_BUSY' });
    assert.ok(time.dependencies.now() < 300_000); assert.ok(calls < 120);
  }
  for (const state of ['expired', 'full']) {
    const time = clock(); let calls = 0;
    await assert.rejects(recoverRuntimeAuthorizationRead(async () => {
      calls++; throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY', {
        retryable: false, data: { state, remainingMs: 1_200_000 },
      });
    }, undefined, time.dependencies), { code: 'CONCURRENCY_BOOTSTRAP_BUSY' });
    assert.equal(calls, 1); assert.deepEqual(time.delays, []);
  }
});


test('unavailable recovery uses the configured original read budget beyond five minutes', async () => {
  const time = clock(); let calls = 0;
  const value = await recoverRuntimeAuthorizationRead(async () => {
    calls++;
    if (calls <= 35) throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY', {
      data: { state: 'unavailable', remainingMs: null, recoveryBudgetMs: 1_200_000, retryAfterMs: 15_000 },
    });
    return 'verified';
  }, undefined, time.dependencies);
  assert.equal(value, 'verified'); assert.equal(time.dependencies.now(), 525_000);
});

test('unavailable budget never refreshes original deadline and real receipts only shorten it', async () => {
  for (const receipt of [false, true]) {
    const time = clock(); let calls = 0;
    await assert.rejects(recoverRuntimeAuthorizationRead(async () => {
      calls++;
      throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY', { data: receipt && calls === 2
        ? { state: 'waiting', remainingMs: 30_000, retryAfterMs: 15_000 }
        : { state: 'unavailable', recoveryBudgetMs: calls === 1 ? 60_000 : 1_800_000, retryAfterMs: 15_000 } });
    }, undefined, time.dependencies), { code: 'CONCURRENCY_BOOTSTRAP_BUSY' });
    assert.equal(time.dependencies.now(), receipt ? 30_000 : 45_000);
  }
});

test('invalid unavailable budget and unrelated busy never grant an extended read', async () => {
  for (const budget of [undefined, '1200000', NaN, Infinity, 0, -1]) {
    const time = clock();
    await assert.rejects(recoverRuntimeAuthorizationRead(async () => {
      throw failure(429, 'CONCURRENCY_BOOTSTRAP_BUSY', { data: { state: 'unavailable', recoveryBudgetMs: budget } });
    }, undefined, time.dependencies), { code: 'CONCURRENCY_BOOTSTRAP_BUSY' });
    assert.ok(time.dependencies.now() < 300_000);
  }
  const time = clock();
  await assert.rejects(recoverRuntimeAuthorizationRead(async () => {
    throw failure(429, 'CONCURRENCY_API_BUSY', { data: { state: 'unavailable', recoveryBudgetMs: 1_800_000 } });
  }, undefined, time.dependencies), { code: 'CONCURRENCY_API_BUSY' });
  assert.ok(time.dependencies.now() < 300_000);
});
