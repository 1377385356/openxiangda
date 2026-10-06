import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenXiangdaPlatformClient } from '../src/platform-client.js';
import { OpenXiangdaWorkflowService } from '../src/workflow.js';

function fixture() {
  const calls: { url: string; init: RequestInit }[] = [];
  let status = 200;
  const client = new OpenXiangdaPlatformClient({ appCode: 'history-fixture', environmentKey: 'preproduction', platformBaseUrl: 'https://fixture.example',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      return new Response(JSON.stringify({ code: status, data: { recordRevision: 4, instance: { status: 'approved' } }, message: 'fixture' }), { status });
    },
  } as any);
  const request: any = { headers: {}, openxiangda: { authorization: 'Bearer verified-fixture', principal: { principalType: 'user', userId: 'actor' } } };
  return { calls, request, service: new OpenXiangdaWorkflowService(request, client), status: (value: number) => { status = value; } };
}

test('record history binds real user and environment without issuing a command or borrowing Named Action authority', async () => {
  const f = fixture();
  f.request.openxiangda.operation = { code: 'proof', requiredCapability: 'fixture:proof' };
  assert.equal((await f.service.recordHistory('requests/with space', 'record/1', { instanceId: 'original/instance', limit: 1 })).instance.status, 'approved');
  const call = f.calls[0]!;
  const url = new URL(call.url);
  assert.ok(url.pathname.endsWith('/records/requests%2Fwith%20space/record%2F1/history'));
  assert.deepEqual(Object.fromEntries(url.searchParams), { environmentKey: 'preproduction', limit: '1', offset: '0', instanceId: 'original/instance' });
  assert.equal(new Headers(call.init.headers).get('authorization'), 'Bearer verified-fixture');
  assert.equal(new Headers(call.init.headers).get('x-openxiangda-business-action'), null);
  assert.equal(new Headers(call.init.headers).get('x-openxiangda-csrf-token'), null);
  assert.equal(call.init.body, undefined);
});

test('record history rejects service principal, missing verification, unbounded pages and caller environment before transport', async () => {
  const f = fixture();
  for (const options of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { offset: -1 }, { offset: 501 }, { environmentKey: 'production' }])
    await assert.rejects(f.service.recordHistory('requests', 'record', options as any), /RECORD_HISTORY_PAGE_INVALID/);
  f.request.openxiangda.principal.principalType = 'application';
  await assert.rejects(f.service.recordHistory('requests', 'record'), /WORKFLOW_USER_CONTEXT_REQUIRED/);
  delete f.request.openxiangda;
  await assert.rejects(f.service.recordHistory('requests', 'record'), /CONTEXT_NOT_VERIFIED/);
  assert.equal(f.calls.length, 0);
});

test('record history retains platform authorization and concurrent revision failures with no fallback or retry', async () => {
  const f = fixture();
  for (const status of [403, 404, 409]) {
    f.status(status);
    await assert.rejects(f.service.recordHistory('requests', 'record'), (error: any) => error.status === status);
  }
  assert.equal(f.calls.length, 3);
});
