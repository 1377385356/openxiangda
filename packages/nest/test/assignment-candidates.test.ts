import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenXiangdaBusinessDirectoryService } from '../src/business-directory.js';
import { OpenXiangdaPlatformClient } from '../src/platform-client.js';

function setup() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let page: any = { schemaVersion: 'openxiangda.assignment-candidate-page/v1', appCode: 'repair',
    environmentKey: 'preproduction', roleCode: 'technician', observedAt: '2026-09-26T00:00:00.000Z',
    headRevision: 4, items: [{ value: 'member-1', label: '技师' }], nextCursor: null };
  const request: any = { headers: { 'x-request-id': 'request-123' }, openxiangda: {
    authorization: 'Bearer verified-invocation', perspectiveCode: null,
    connectedDevelopmentSessionToken: 'bounded-dev-session',
    principal: { principalType: 'user', userId: 'actor' },
    operation: { code: 'assign', requiredCapability: 'app:repair:assign',
      platformAccess: { roleAssertions: { roleCodes: ['technician'] } } },
  } };
  const client = new OpenXiangdaPlatformClient({ appCode: 'repair', environmentKey: 'preproduction',
    platformBaseUrl: 'https://platform.example', fetch: async (input, init) => {
      calls.push({ url: String(input), init: init || {} });
      return new Response(JSON.stringify({ code: 200, data: page }), { status: 200 });
    },
  } as any);
  return { request, calls, setPage: (value: any) => { page = value; }, get page() { return page; },
    directory: new OpenXiangdaBusinessDirectoryService(request, client) };
}

test('候选查询保留动作证明、绑定环境及请求关联，返回最少字段', async () => {
  const f = setup();
  assert.deepEqual(await f.directory.assignmentCandidates({ roleCode: 'technician', keyword: '王', limit: 5 }), f.page);
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0]!;
  assert.equal(url, 'https://platform.example/openxiangda-api/v2/applications/repair/directory/assignment-candidates');
  assert.equal(init.method, 'POST');
  assert.deepEqual(JSON.parse(String(init.body)), { roleCode: 'technician', keyword: '王', limit: 5, environmentKey: 'preproduction' });
  const headers = new Headers(init.headers);
  assert.equal(headers.get('authorization'), 'Bearer verified-invocation');
  assert.equal(headers.get('x-openxiangda-business-action-code'), 'assign');
  assert.equal(headers.get('x-openxiangda-dev-session'), 'bounded-dev-session');
  assert.equal(headers.get('x-request-id'), 'request-123');
});

test('不发未声明角色、越界和伪造环境请求；不缓存失效证明', async () => {
  const f = setup();
  await assert.rejects(f.directory.assignmentCandidates({ roleCode: 'admin' }), /NOT_DECLARED/);
  for (const extra of [{ limit: 51 }, { limit: 0 }, { keyword: 'x'.repeat(65) }, { cursor: 'x'.repeat(2049) }, { environmentKey: 'production' }]) {
    await assert.rejects(f.directory.assignmentCandidates({ roleCode: 'technician', ...extra } as any), { code: 'OPENXIANGDA_DIRECTORY_CANDIDATE_INPUT_INVALID' });
  }
  delete f.request.openxiangda;
  await assert.rejects(f.directory.assignmentCandidates({ roleCode: 'technician' }), /CONTEXT_NOT_VERIFIED/);
  assert.equal(f.calls.length, 0);
});

test('错环境、错角色、额外人员字段与超量响应不能成为候选', async () => {
  const f = setup(); const valid = f.page;
  for (const extra of [{ appCode: 'other' }, { environmentKey: 'production' }, { roleCode: 'admin' },
    { observedAt: 'bad' }, { headRevision: 0 }, { nextCursor: 3 },
    { items: [{ value: 'member-1', label: '技师', phone: 'private' }] },
    { items: Array(21).fill({ value: 'member-1', label: '技师' }) }, { secret: 'private' }]) {
    f.setPage({ ...valid, ...extra });
    await assert.rejects(f.directory.assignmentCandidates({ roleCode: 'technician' }), { code: 'OPENXIANGDA_DIRECTORY_CANDIDATE_RESPONSE_INVALID' });
  }
  assert.equal(f.calls.length, 9, '每个请求只查询一次，不回退到管理目录');
});
