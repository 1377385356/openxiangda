import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type RequestListener } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  DEVELOPMENT_BACKEND_SCHEMA, DEVELOPMENT_BACKEND_INVOCATION_SCHEMA,
  developmentBackendBase64Bytes, developmentBackendInvocationRequestValid,
  type DevelopmentBackendInvocationRequest, type DevelopmentBackendResponse,
} from 'openxiangda-contracts';
import { forwardDevelopmentBackendRequest, startDevelopmentBackendRelay } from '../src/development-backend-relay.js';

const bootstrap = {
  schemaVersion: DEVELOPMENT_BACKEND_SCHEMA, invocationContract: DEVELOPMENT_BACKEND_INVOCATION_SCHEMA,
  sessionId: 'original-session', environmentId: 'environment', appVersionId: 'version', headRevision: 4,
  secretEnvironment: { OPENXIANGDA_OAUTH_CLIENT_ID: 'client', OPENXIANGDA_OAUTH_CLIENT_SECRET: 'private' },
};
function invocation(patch: Partial<DevelopmentBackendInvocationRequest> = {}): DevelopmentBackendInvocationRequest {
  return { schemaVersion: DEVELOPMENT_BACKEND_INVOCATION_SCHEMA, requestId: randomUUID(),
    sessionId: bootstrap.sessionId, appVersionId: bootstrap.appVersionId, headRevision: bootstrap.headRevision,
    method: 'PATCH', endpointPath: '/requests/original/update', canonicalQuery: 'a=%E4%B8%AD&b=%2B&a=two',
    operation: { code: 'request-update', method: 'PATCH', path: '/requests/:id/update' },
    headers: { authorization: 'Bearer invocation-proof', 'x-openxiangda-gateway-assertion': 'signed-proof',
      'x-openxiangda-csrf-token': 'csrf-proof', 'idempotency-key': 'original-intent', 'content-type': 'application/json' },
    body: Buffer.from('{"name":"中文","amount":0}').toString('base64'),
    timeoutMs: 5000, expiresAt: new Date(Date.now() + 5000).toISOString(), ...patch };
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

test('ordinary invocation preserves method, canonical query, signed bytes, CSRF and original intent with a binary reply', async () => {
  const value = invocation(), binary = Buffer.from([0, 255, 128, 10, 13, 32]);
  let handled = 0;
  const f = await fixture((req, res) => {
    handled++;
    assert.equal(req.method, value.method);
    assert.equal(req.url, `${value.endpointPath}?${value.canonicalQuery}`);
    for (const name of ['authorization', 'x-openxiangda-gateway-assertion', 'x-openxiangda-csrf-token', 'idempotency-key'])
      assert.equal(req.headers[name], value.headers[name]);
    assert.equal(req.headers.cookie, undefined);
    assert.equal(req.headers['x-openxiangda-dev-session'], undefined);
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      assert.deepEqual(Buffer.concat(chunks), Buffer.from(value.body, 'base64'));
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="test.pdf"',
        ETag: '"original"', 'Set-Cookie': 'private-cookie', Location: '/not-forwarded' });
      res.end(binary);
    });
  });
  try {
    const reply = await forwardDevelopmentBackendRequest(f.url, value);
    assert.equal(reply.schemaVersion, DEVELOPMENT_BACKEND_INVOCATION_SCHEMA);
    assert.deepEqual(Buffer.from(reply.body, 'base64'), binary);
    assert.deepEqual(reply.headers, { 'content-type': 'application/pdf',
      'content-disposition': 'attachment; filename="test.pdf"', etag: '"original"' });
    assert.equal(handled, 1);
  } finally { await f.close(); }
});

test('operation, query, headers and canonical base64 are bounded before local dispatch', async () => {
  const value = invocation();
  assert.equal(developmentBackendInvocationRequestValid(value), true);
  for (const patch of [
    { endpointPath: '/requests/%2e%2e/update' }, { endpointPath: '/requests/a%2Fb/update' },
    { endpointPath: '//other-host/requests/update' }, { endpointPath: '/__platform/events/completed' },
    { method: 'DELETE' }, { canonicalQuery: 'a=1#fragment' }, { canonicalQuery: 'a=1\n' },
    { body: 'Zh==' }, { body: 'Zg=' }, { body: Buffer.alloc(256 * 1024 + 1).toString('base64') },
    { headers: { ...value.headers, cookie: 'private' } },
    { headers: { ...value.headers, 'x-openxiangda-dev-session': 'private' } },
    { headers: { ...value.headers, 'x-openxiangda-user-id': 'spoofed' } },
    { headers: { ...value.headers, accept: 'a\r\nb' } },
    { headers: { ...value.headers, Authorization: 'Bearer duplicate' } },
  ]) {
    assert.equal(developmentBackendInvocationRequestValid({ ...value, ...patch }), false);
    await assert.rejects(forwardDevelopmentBackendRequest('http://127.0.0.1:9', { ...value, ...patch }), /TARGET_INVALID/);
  }
  for (const [encoded, bytes] of [['', 0], ['Zg==', 1], ['Zm8=', 2], ['Zm9v', 3]] as const)
    assert.equal(developmentBackendBase64Bytes(encoded), bytes);
});

test('finite source transport refuses event streams and oversized replies, and never follows redirects', async () => {
  for (const kind of ['stream', 'large', 'redirect'] as const) {
    let handled = 0;
    const f = await fixture((_req, res) => {
      handled++;
      if (kind === 'stream') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: private\n\n'); }
      if (kind === 'large') res.end(Buffer.alloc(1024 * 1024 + 1));
      if (kind === 'redirect') { res.writeHead(307, { location: '/requests/other/update' }); res.end('original'); }
    });
    try {
      if (kind === 'redirect') {
        const reply = await forwardDevelopmentBackendRequest(f.url, invocation());
        assert.equal(reply.status, 307); assert.equal(reply.headers?.location, undefined);
      } else await assert.rejects(forwardDevelopmentBackendRequest(f.url, invocation()),
        kind === 'stream' ? /STREAM_UNSUPPORTED/ : /RESPONSE_TOO_LARGE/);
      assert.equal(handled, 1);
    } finally { await f.close(); }
  }
});

test('invocation lost response ACK retransmits the original binary response without a second handler', async () => {
  const value = invocation(), replies: DevelopmentBackendResponse[] = [];
  let handled = 0, polled = 0, delivered!: () => void;
  const delivery = new Promise<void>(resolve => { delivered = resolve; });
  const f = await fixture((_req, res) => { handled++; res.end(Buffer.from([0, 255, 128])); });
  const failures: Error[] = [];
  const relay = startDevelopmentBackendRelay({ bootstrap, token: () => 'original-session-token', localAppBaseUrl: f.url,
    onError: error => failures.push(error),
    api: { bootstrap: async () => bootstrap, next: async () => polled++ === 0 ? value : null,
      respond: async (_token, reply) => {
        replies.push(reply);
        if (replies.length === 1) throw Object.assign(new Error('lost ACK'), { status: 503 });
        delivered();
      }, close: async () => {} },
  });
  try {
    await delivery;
    assert.equal(handled, 1); assert.equal(replies.length, 2);
    assert.deepEqual(replies[0], replies[1]);
    assert.deepEqual(Buffer.from(replies[0]!.body, 'base64'), Buffer.from([0, 255, 128]));
    assert.deepEqual(failures, []);
  } finally { await relay.stop(); await f.close(); }
});

test('legacy connections refuse ordinary invocations before dispatch', async () => {
  let failed!: (error: Error) => void;
  const failure = new Promise<Error>(resolve => { failed = resolve; });
  let responded = 0;
  const { invocationContract: _contract, ...legacy } = bootstrap;
  const relay = startDevelopmentBackendRelay({ bootstrap: legacy, token: () => 'private-token',
    localAppBaseUrl: 'http://127.0.0.1:9', onError: failed,
    api: { bootstrap: async () => legacy, next: async () => invocation(),
      respond: async () => { responded++; }, close: async () => {} },
  });
  await failure; await relay.stop();
  assert.equal(responded, 0);
});
