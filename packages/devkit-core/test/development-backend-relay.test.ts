import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type RequestListener } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DEVELOPMENT_BACKEND_SCHEMA, requiresDevelopmentBackendCredential, type DevelopmentBackendRequest } from 'openxiangda-contracts';
import { assertDevelopmentBackendBootstrap, forwardDevelopmentBackendRequest, startDevelopmentBackendRelay } from '../src/development-backend-relay.js';

const bootstrap = {
  schemaVersion: DEVELOPMENT_BACKEND_SCHEMA, sessionId: 'session-1', environmentId: 'env-1',
  appVersionId: 'version-1', headRevision: 4,
  secretEnvironment: { OPENXIANGDA_OAUTH_CLIENT_ID: 'client', OPENXIANGDA_OAUTH_CLIENT_SECRET: 'private' },
};
function request(patch: Partial<DevelopmentBackendRequest> = {}): DevelopmentBackendRequest {
  return { schemaVersion: DEVELOPMENT_BACKEND_SCHEMA, sessionId: bootstrap.sessionId,
    appVersionId: bootstrap.appVersionId, headRevision: bootstrap.headRevision,
    requestId: randomUUID(), endpointPath: '/__platform/events/completed',
    headers: { 'X-OpenXiangda-Signature': 'v2=original' }, body: '{"executionId":"original"}',
    timeoutMs: 2000, expiresAt: new Date(Date.now() + 2000).toISOString(), ...patch };
}
async function fixture(handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { url: `http://127.0.0.1:${address.port}`, close: async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  } };
}

test('private bootstrap binds exact Head/session and accepts only standard secret environments', () => {
  const expected = { sessionId: 'session-1', environmentId: 'env-1', appVersionId: 'version-1', headRevision: 4 };
  assertDevelopmentBackendBootstrap(bootstrap, expected);
  assert.throws(() => assertDevelopmentBackendBootstrap({ ...bootstrap, headRevision: 5 }, expected));
  assert.throws(() => assertDevelopmentBackendBootstrap({ ...bootstrap, secretEnvironment: { ...bootstrap.secretEnvironment, NODE_OPTIONS: '--inspect' } }, expected));
});

test('empty Nest and platform-native actions do not request source runtime credentials', () => {
  assert.equal(requiresDevelopmentBackendCredential({ backend: { operations: [] } }), false);
  assert.equal(requiresDevelopmentBackendCredential({ events: { subscriptions: [{ execution: { kind: 'native-data' } }] } }), false);
  assert.equal(requiresDevelopmentBackendCredential({ events: { subscriptions: [{}] } }), true);
  assert.equal(requiresDevelopmentBackendCredential({ backend: { operations: [{}] } }), true);
});

test('relay retains signed event bytes and original response, with no redirect following', async () => {
  let redirects = 0;
  const f = await fixture((req, res) => {
    if (req.url === '/redirected') { redirects++; res.end('bad'); return; }
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['x-openxiangda-signature'], 'v2=original');
    let body = ''; req.on('data', chunk => body += chunk);
    req.on('end', () => {
      assert.equal(body, '{"executionId":"original"}');
      res.writeHead(307, { Location: '/redirected' }); res.end('original redirect response');
    });
  });
  try {
    const value = request();
    assert.deepEqual(await forwardDevelopmentBackendRequest(f.url, value), {
      requestId: value.requestId, status: 307, body: 'original redirect response',
    });
    assert.equal(redirects, 0);
    await assert.rejects(forwardDevelopmentBackendRequest('http://localhost:3000', value));
    await assert.rejects(forwardDevelopmentBackendRequest(f.url, { ...value, endpointPath: '/api/arbitrary' }));
  } finally { await f.close(); }
});

test('oversized responses and expired requests cannot enter the transport reply', async () => {
  const f = await fixture((_req, res) => res.end('a'.repeat(128 * 1024 + 1)));
  try {
    await assert.rejects(forwardDevelopmentBackendRequest(f.url, request()), /RESPONSE_/);
    await assert.rejects(forwardDevelopmentBackendRequest(f.url, request({ expiresAt: new Date(Date.now() - 1).toISOString() })), /EXPIRED/);
  } finally { await f.close(); }
});

test('poll rejects foreign Head requests, closes cleanly and reports no input/secret content', async () => {
  const value = request({ headRevision: 9, body: 'private marker' });
  let resolveFailed!: (error: Error) => void;
  const failure = new Promise<Error>(resolve => { resolveFailed = resolve; });
  let responded = false, closed = false;
  const relay = startDevelopmentBackendRelay({
    bootstrap, token: () => 'private-token', localAppBaseUrl: 'http://127.0.0.1:9',
    api: { bootstrap: async () => bootstrap, next: async () => value,
      respond: async () => { responded = true; }, close: async () => { closed = true; } },
    onError: resolveFailed,
  });
  const error = await failure;
  await relay.stop();
  assert.equal(responded, false); assert.equal(closed, true);
  assert.doesNotMatch(error.message, /private|marker/);
});

test('temporary poll and lost response acknowledgements recover without rerunning the local handler', async () => {
  let handled = 0, polled = 0, replied = 0;
  const statuses: string[] = [], replies: unknown[] = [];
  let resolveDelivered!: () => void;
  const delivered = new Promise<void>(resolve => { resolveDelivered = resolve; });
  const value = request({ timeoutMs: 10_000, expiresAt: new Date(Date.now() + 10_000).toISOString() });
  const temporary = () => Object.assign(new Error('private transport payload'), { status: 503 });
  const f = await fixture((_req, res) => { handled++; res.end('{"receipt":"original"}'); });
  const failures: Error[] = [];
  const relay = startDevelopmentBackendRelay({
    bootstrap, token: () => 'original-token', localAppBaseUrl: f.url,
    onError: error => failures.push(error), onConnectionStatus: status => statuses.push(status),
    api: { bootstrap: async () => { throw new Error('must not bootstrap again'); },
      next: async token => {
        assert.equal(token, 'original-token');
        polled++;
        if (polled === 1) throw temporary();
        return polled === 2 ? value : null;
      }, respond: async (_token, response) => {
        replies.push(response); replied++;
        // Model a server that accepted a reply before its HTTP acknowledgement was lost.
        if (replied === 1) throw temporary();
        resolveDelivered();
      }, close: async () => {} },
  });
  try {
    await delivered;
    assert.equal(handled, 1); assert.equal(replied, 2);
    assert.deepEqual(replies[0], replies[1]);
    assert.equal((replies[0] as { requestId: string }).requestId, value.requestId);
    assert.deepEqual(statuses, ['reconnecting', 'recovered', 'reconnecting', 'recovered']);
    assert.deepEqual(failures, []);
  } finally { await relay.stop(); await f.close(); }
});

test('authorization and owner refusals stop immediately, including terminal refusals reported as 503', async () => {
  for (const [status, code] of [[401, 'AUTH_REQUIRED'], [403, 'FORBIDDEN'],
    [409, 'OPENXIANGDA_CONNECTED_DEV_BACKEND_HEAD_CHANGED'],
    [503, 'OPENXIANGDA_CONNECTED_DEV_BACKEND_CONNECTION_EXPIRED']] as const) {
    let polled = 0;
    let resolveFailed!: (error: Error) => void;
    const failure = new Promise<Error>(resolve => { resolveFailed = resolve; });
    const relay = startDevelopmentBackendRelay({
      bootstrap, token: () => 'private-token', localAppBaseUrl: 'http://127.0.0.1:9', onError: resolveFailed,
      api: { bootstrap: async () => bootstrap, next: async () => {
        polled++; throw Object.assign(new Error('private secret'), { status, code });
      }, respond: async () => { assert.fail('no handler response'); }, close: async () => {} },
    });
    const error = await failure;
    await relay.stop();
    assert.equal(polled, 1); assert.doesNotMatch(error.message, /private|secret/);
    if (status === 409 || status === 503) assert.ok(error.message.includes(code));
  }
});

test('recovery is bounded and stopping cancels retries while close reuses the original session', async () => {
  let resolveFailed!: (error: Error) => void;
  const failure = new Promise<Error>(resolve => { resolveFailed = resolve; });
  const timed = startDevelopmentBackendRelay({
    bootstrap, token: () => 'token', localAppBaseUrl: 'http://127.0.0.1:9', recoveryTimeoutMs: 10,
    api: { bootstrap: async () => bootstrap, next: async () => { throw Object.assign(new Error('private'), { status: 503 }); },
      respond: async () => {}, close: async () => {} }, onError: resolveFailed,
  });
  assert.match((await failure).message, /RECOVERY_TIMEOUT/);
  await timed.stop();

  let polled = 0, closed = 0;
  let resolveRetry!: () => void;
  const retry = new Promise<void>(resolve => { resolveRetry = resolve; });
  const stopped = startDevelopmentBackendRelay({
    bootstrap, token: () => 'original', localAppBaseUrl: 'http://127.0.0.1:9',
    api: { bootstrap: async () => bootstrap, next: async () => { polled++; throw Object.assign(new Error('private'), { status: 502 }); },
      respond: async () => {}, close: async token => {
        assert.equal(token, 'original'); closed++;
        if (closed === 1) throw Object.assign(new Error('lost close acknowledgement'), { status: 503 });
      } }, onError: () => assert.fail('stop must not be reported as failure'),
    onConnectionStatus: status => { assert.equal(status, 'reconnecting'); resolveRetry(); },
  });
  await retry;
  await Promise.all([stopped.stop(), stopped.stop()]);
  assert.equal(polled, 1); assert.equal(closed, 2);
});
