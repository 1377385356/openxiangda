import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts/browser';
import { createManagedConcurrencyClient, loadRuntimeAuthorization, logoutCurrentUser } from '../src/browser/platform-client';

const reply = (data: unknown) => new Response(JSON.stringify({ code: 200, data }));
const auth = (userId = 'user', identityScope = 'original') => ({
  schemaVersion: SCHEMA_VERSIONS.runtimeAuthorization, state: 'active', roles: [], subjectProfile: {},
  environment: { id: 'environment', key: 'preproduction', headRevision: 1 },
  principal: { type: 'user_union', userId, roleCodes: ['participant'], capabilityCodes: ['claim'], identityScope },
});
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
let scenario = 0;
async function withRuntime(run: (configure: (handler: (path: string, init: RequestInit) => Promise<Response>) => void) => Promise<void>) {
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document;
  const meta: Record<string, string> = { 'openxiangda-runtime-base': '/runtime/concurrency',
    'openxiangda-app-code': `runtime-owner-${++scenario}`, 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: meta[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  let handler = async (_path: string, _init: RequestInit) => reply(auth());
  globalThis.fetch = async (url, init) => handler(String(url), init || {});
  try { await run(next => { handler = next; }); }
  finally {
    globalThis.fetch = previousFetch;
    if (previousDocument === undefined) delete (globalThis as any).document; else globalThis.document = previousDocument;
  }
}

test('concurrent runtime startup and refresh share one current read; one observer cancellation cannot poison others', async () => {
  await withRuntime(async configure => {
    let reads = 0, release!: (response: Response) => void, transportSignal: AbortSignal | null | undefined;
    configure(async (_path, init) => { reads++; transportSignal = init.signal; return new Promise(resolve => { release = resolve; }); });
    const first = new AbortController(), second = new AbortController(), reason = new Error('first observer left');
    const cancelled = assert.rejects(loadRuntimeAuthorization({ signal: first.signal }), received => received === reason);
    const pending = loadRuntimeAuthorization({ refresh: true, signal: second.signal });
    await settle(); assert.equal(reads, 1);
    first.abort(reason); await cancelled; assert.equal(transportSignal?.aborted, false);
    release(reply(auth())); const verified = await pending;
    assert.equal(verified.identity?.userId, 'user');
    assert.equal(await loadRuntimeAuthorization(), verified); assert.equal(reads, 1);
  });
});

test('last observer cancellation aborts the owner and a late response cannot replace the next startup', async () => {
  await withRuntime(async configure => {
    let reads = 0, release!: (response: Response) => void, transportSignal: AbortSignal | null | undefined;
    configure(async (_path, init) => {
      reads++;
      if (reads > 1) return reply(auth('next', 'next-scope'));
      transportSignal = init.signal; return new Promise(resolve => { release = resolve; });
    });
    const controller = new AbortController();
    const cancelled = assert.rejects(loadRuntimeAuthorization({ signal: controller.signal }), { name: 'AbortError' });
    await settle(); controller.abort(); await cancelled; assert.equal(transportSignal?.aborted, true);
    const next = await loadRuntimeAuthorization(); assert.equal(next.identity?.userId, 'next');
    release(reply(auth('old', 'old-scope'))); await settle();
    assert.equal((await loadRuntimeAuthorization()).identity?.userId, 'next'); assert.equal(reads, 2);
  });
});

test('synchronous cleanup and remount retain one pending owner and its original transport', async () => {
  await withRuntime(async configure => {
    let reads = 0, release!: (response: Response) => void, transportSignal: AbortSignal | null | undefined;
    configure(async (_path, init) => { reads++; transportSignal = init.signal; return new Promise(resolve => { release = resolve; }); });
    const first = new AbortController(), next = new AbortController(), reason = new Error('temporary effect cleanup');
    const cancelled = assert.rejects(loadRuntimeAuthorization({ signal: first.signal }), received => received === reason);
    first.abort(reason);
    const pending = loadRuntimeAuthorization({ signal: next.signal });
    await cancelled; await settle();
    assert.equal(reads, 1); assert.equal(transportSignal?.aborted, false);
    release(reply(auth()));
    const verified = await pending;
    assert.equal(verified.identity?.userId, 'user');
    assert.equal(await loadRuntimeAuthorization(), verified); assert.equal(reads, 1);
  });
});

test('a cancelled completed refresh never installs an unobserved identity over the last verified identity', async () => {
  await withRuntime(async configure => {
    await loadRuntimeAuthorization(); const api = createManagedConcurrencyClient();
    let release!: (response: Response) => void, transportSignal: AbortSignal | null | undefined;
    configure(async (_path, init) => { transportSignal = init.signal; return new Promise(resolve => { release = resolve; }); });
    const controller = new AbortController();
    const cancelled = assert.rejects(loadRuntimeAuthorization({ refresh: true, signal: controller.signal }), { name: 'AbortError' });
    await settle(); release(reply(auth('unobserved', 'unobserved-scope'))); controller.abort();
    await cancelled; await settle(); assert.equal(transportSignal?.aborted, true);
    configure(async () => reply({ state: 'accepted', requestKey: 'original-key' }));
    await api.result({ command: 'claim', requestKey: 'original-key' });
    assert.doesNotThrow(() => createManagedConcurrencyClient());
  });
});

test('same identity refresh keeps managed original-key recovery live and merges concurrent current checks', async () => {
  await withRuntime(async configure => {
    await loadRuntimeAuthorization(); const api = createManagedConcurrencyClient();
    let reads = 0, release!: (response: Response) => void;
    const bodies: unknown[] = [];
    configure(async (path, init) => {
      if (path.includes('/authz/current')) { reads++; return new Promise(resolve => { release = resolve; }); }
      bodies.push(JSON.parse(String(init.body))); return reply({ state: 'accepted', requestKey: 'original-key' });
    });
    const checking = loadRuntimeAuthorization({ refresh: true }), visible = loadRuntimeAuthorization({ refresh: true });
    await settle(); assert.equal(reads, 1);
    await api.result({ command: 'claim', requestKey: 'original-key' });
    release(reply(auth())); await Promise.all([checking, visible]);
    await api.result({ command: 'claim', requestKey: 'original-key' });
    assert.deepEqual(bodies, [{ command: 'claim', requestKey: 'original-key', environmentKey: 'preproduction' },
      { command: 'claim', requestKey: 'original-key', environmentKey: 'preproduction' }]);
  });
});

test('real same-user scope change invalidates both reads and writes before transport', async () => {
  await withRuntime(async configure => {
    await loadRuntimeAuthorization(); const api = createManagedConcurrencyClient();
    let calls = 0; configure(async () => { calls++; return reply(auth('user', 'revised-scope')); });
    await loadRuntimeAuthorization({ refresh: true });
    await assert.rejects(api.result({ command: 'claim', requestKey: 'original-key' }), { code: 'CONCURRENCY_IDENTITY_CHANGED' });
    await assert.rejects(api.enqueue('claim', {}, 'original-key'), { code: 'CONCURRENCY_IDENTITY_CHANGED' });
    assert.equal(calls, 1);
  });
});

test('current permission or version loss invalidates old clients while a dependency failure preserves last verified identity', async () => {
  for (const status of [401, 403, 409, 503]) await withRuntime(async configure => {
    await loadRuntimeAuthorization(); const api = createManagedConcurrencyClient();
    const denial = new Response(JSON.stringify({ code: status, errorCode: status === 503 ? 'DEPENDENCY_UNAVAILABLE' : `HTTP_${status}` }), { status });
    configure(async () => denial.clone());
    await assert.rejects(loadRuntimeAuthorization({ refresh: true }), { status });
    let calls = 0; configure(async path => { calls++; return path.includes('/authz/current') ? reply(auth()) : reply({ state: 'accepted' }); });
    if (status === 503) {
      await api.result({ command: 'claim', requestKey: 'original-key' }); assert.equal(calls, 1);
      await loadRuntimeAuthorization({ refresh: true });
      await api.result({ command: 'claim', requestKey: 'original-key' }); assert.equal(calls, 3);
    } else {
      await assert.rejects(api.result({ command: 'claim', requestKey: 'original-key' }), { code: 'CONCURRENCY_IDENTITY_CHANGED' });
      assert.equal(calls, 0);
    }
  });
});

test('current busy honors the longest header and body delay without losing response metadata', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); t.mock.method(Math, 'random', () => 0);
  await withRuntime(async configure => {
    let reads = 0;
    configure(async () => {
      reads++;
      return reads === 1 ? new Response(JSON.stringify({ code: 429, errorCode: 'CONCURRENCY_BOOTSTRAP_BUSY',
        retryAfterMs: 9000, data: { retryAfterMs: 8000 } }), { status: 429, headers: { 'Retry-After': '7' } }) : reply(auth());
    });
    const pending = loadRuntimeAuthorization(); await settle();
    t.mock.timers.tick(8999); await settle(); assert.equal(reads, 1);
    t.mock.timers.tick(1); await pending; assert.equal(reads, 2);
  });
});

test('a verified startup clears only its HTML admission deadline; failed checks never reset it', async () => {
  const previousWindow = globalThis.window;
  const entries = new Map([['oxa-entry-wait:/runtime/page', 'original-deadline'], ['oxa-entry-wait:/other-page', 'other-deadline']]);
  globalThis.window = { location: { pathname: '/runtime/page' },
    sessionStorage: { removeItem: (key: string) => entries.delete(key) } } as any;
  try { await withRuntime(async configure => {
    configure(async () => new Response(JSON.stringify({ code: 503, errorCode: 'DEPENDENCY_UNAVAILABLE' }), { status: 503 }));
    await assert.rejects(loadRuntimeAuthorization(), { status: 503 });
    assert.equal(entries.get('oxa-entry-wait:/runtime/page'), 'original-deadline');
    configure(async () => reply(auth())); await loadRuntimeAuthorization();
    assert.equal(entries.has('oxa-entry-wait:/runtime/page'), false);
    assert.equal(entries.get('oxa-entry-wait:/other-page'), 'other-deadline');
  }); } finally {
    if (previousWindow === undefined) delete (globalThis as any).window; else globalThis.window = previousWindow;
  }
});

test('blocked storage does not prevent verified startup', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { pathname: '/runtime/page' }, sessionStorage: { removeItem() { throw new Error('storage denied'); } } } as any;
  try { await withRuntime(async () => {
    assert.equal((await loadRuntimeAuthorization()).identity?.userId, 'user');
  }); } finally {
    if (previousWindow === undefined) delete (globalThis as any).window; else globalThis.window = previousWindow;
  }
});

test('logout cancels in-flight current and cannot be reversed by its late response', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { pathname: '/page' }, addEventListener() {}, localStorage: { setItem() {} } } as any;
  try { await withRuntime(async configure => {
    await loadRuntimeAuthorization(); const api = createManagedConcurrencyClient();
    let release!: (response: Response) => void;
    configure(async path => {
      if (path.includes('/authz/current')) return new Promise(resolve => { release = resolve; });
      if (path.includes('/auth/surface')) return reply({ csrfToken: 'test-csrf' });
      return reply({ redirectTo: '/' });
    });
    const rejected = assert.rejects(loadRuntimeAuthorization({ refresh: true }), { name: 'AbortError' });
    await settle(); await logoutCurrentUser(); await rejected;
    release(reply(auth())); await settle();
    assert.throws(() => createManagedConcurrencyClient(), /OPENXIANGDA_CURRENT_USER_REQUIRED/);
    await assert.rejects(api.result({ command: 'claim', requestKey: 'original-key' }), { code: 'CONCURRENCY_IDENTITY_CHANGED' });
  }); } finally {
    if (previousWindow === undefined) delete (globalThis as any).window; else globalThis.window = previousWindow;
  }
});
