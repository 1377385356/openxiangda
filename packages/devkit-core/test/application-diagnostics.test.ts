import assert from 'node:assert/strict';
import test from 'node:test';
import { OPENXIANGDA_CONTRACT_VERSION, type ApplicationDiagnosticQuery } from 'openxiangda-contracts';
import { OpenXiangdaControlPlaneClient } from '../src/control-plane-client.js';
const id = 'fe2f7bac-8e0a-4d47-a3aa-3df77e9776a4';
const envelope = (data: unknown) => new Response(JSON.stringify({ code: 200, data }), { headers: { 'Content-Type': 'application/json' } });
const caps = { contractVersion: OPENXIANGDA_CONTRACT_VERSION, features: { 'application.scoped-diagnostics': { contractVersion: '1.0.0', status: 'available' } } };
const receipt = (q: ApplicationDiagnosticQuery) => ({ schemaVersion: 'openxiangda.application-diagnostics/v2', observedAt: new Date().toISOString(), scope: { appCode: 'example', environmentKey: q.environmentKey, environmentId: id }, locator: { kind: q.kind, id: q.id }, window: q.kind === 'requestId' ? { from: q.from, to: q.to } : null, state: 'not_observed', reason: null, truncated: false, facts: [], nextActions: [{ code: 'PRESERVE_ORIGINAL_OPERATION', message: '未观测不表示未提交' }] });

test('all four locators use exact authenticated bounded GET without writes or automatic replay', async () => {
  for (const kind of ['commandId', 'fileId', 'deploymentRunId', 'requestId'] as const) {
    const q: ApplicationDiagnosticQuery = { kind, id: kind === 'requestId' ? 'original-request' : id, environmentKey: 'preproduction', ...(kind === 'requestId' ? { from: '2026-09-26T09:00:00.000Z', to: '2026-09-26T10:00:00.000Z' } : {}) };
    const seen: URL[] = [];
    const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.example/service', token: 'test-token', fetch: async (input, init) => {
      const url = new URL(String(input)); seen.push(url);
      assert.equal(init?.method || 'GET', 'GET'); assert.equal(init?.body, undefined); assert.ok(init?.signal);
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
      return envelope(url.pathname.endsWith('/capabilities') ? caps : { ...receipt(q), secret: 'never-return' });
    } });
    assert.equal((await client.applicationDiagnostics('example', q)).state, 'not_observed');
    assert.equal(seen.length, 2); assert.equal(seen[1]?.pathname, '/service/openxiangda-api/v2/applications/example/diagnostics/lookup');
    assert.equal(seen[1]?.searchParams.get('kind'), kind); assert.equal(seen[1]?.searchParams.get('environmentKey'), 'preproduction');
    assert.equal(seen[1]?.searchParams.get('from'), q.from ?? null);
  }
});

test('invalid queries, missing capability, forbidden lookup and wrong scope fail without another operation', async () => {
  const q: ApplicationDiagnosticQuery = { kind: 'commandId', id, environmentKey: 'production' };
  let calls = 0;
  const invalid = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.example/service', fetch: async () => { calls++; return envelope(caps); } });
  await assert.rejects(invalid.applicationDiagnostics('example', { ...q, id: 'bad' }), /QUERY_INVALID/); assert.equal(calls, 0);
  for (const mode of ['missing', 'forbidden', 'wrong-scope']) {
    calls = 0;
    const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.example/service', fetch: async input => {
      calls++;
      if (String(input).endsWith('/capabilities')) return envelope(mode === 'missing' ? { ...caps, features: {} } : caps);
      if (mode === 'forbidden') return new Response(JSON.stringify({ code: 403, errorCode: 'OPENXIANGDA_DIAGNOSTIC_FORBIDDEN', message: 'denied' }), { status: 403 });
      return envelope({ ...receipt(q), scope: { appCode: 'other', environmentKey: 'production', environmentId: id } });
    } });
    await assert.rejects(client.applicationDiagnostics('example', q)); assert.equal(calls, mode === 'missing' ? 1 : 2);
  }
});
