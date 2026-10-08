import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenXiangdaBusinessDirectoryService } from '../src/business-directory.js';
import { OpenXiangdaPlatformClient } from '../src/platform-client.js';
function setup() {
  const calls: any[] = [];
  let result: any = {
    schemaVersion: 'openxiangda.selected-departments-directory-snapshot/v2',
    departments: [{ value: 'd1', label: '实验室' }],
    snapshotRevision: 'a'.repeat(64),
    resolvedAt: '2026-10-09T00:00:00Z',
  };
  const request: any = {
    headers: { 'x-request-id': 'req-1' },
    openxiangda: {
      authorization: 'Bearer assertion',
      perspectiveCode: 'private',
      connectedDevelopmentSessionToken: 'dev-session',
      principal: { principalType: 'developer', userId: 'admin' },
      operation: {
        code: 'booking.create',
        requiredCapability: 'app:arts:booking',
        platformAccess: {
          selectedDepartments: { fields: ['name'], maxIds: 8 },
        },
      },
    },
  };
  const client = new OpenXiangdaPlatformClient({
    appCode: 'arts',
    environmentKey: 'preproduction',
    platformBaseUrl: 'https://platform.example',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ code: 200, data: result }), {
        status: 200,
      });
    },
  } as any);
  return {
    calls,
    request,
    directory: new OpenXiangdaBusinessDirectoryService(request, client),
    setResult: (v: any) => {
      result = { ...result, ...v };
    },
  };
}
test('department resolution forwards exact verified action and connected metadata with fixed environment', async () => {
  const f = setup();
  assert.equal(
    (await f.directory.selectedDepartments(['d1'])).departments[0]?.label,
    '实验室'
  );
  assert.match(
    String(f.calls[0].url),
    /selected-departments\?environmentKey=preproduction$/
  );
  assert.deepEqual(JSON.parse(f.calls[0].init.body), {
    schemaVersion: 'openxiangda.selected-departments-directory-request/v2',
    ids: ['d1'],
  });
  assert.deepEqual(f.calls[0].init.headers, {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: 'Bearer assertion',
    'x-openxiangda-business-action-code': 'booking.create',
    'x-openxiangda-business-action-capability': 'app:arts:booking',
    'x-request-id': 'req-1',
    'x-openxiangda-dev-session': 'dev-session',
  });
});
test('department access is explicit and targets are bounded before platform I/O', async () => {
  for (const ids of [
    [],
    ['d1', 'd1'],
    [' d1'],
    Array.from({ length: 9 }, (_, i) => 'd' + i),
    null,
  ]) {
    const f = setup();
    await assert.rejects(f.directory.selectedDepartments(ids as any));
    assert.equal(f.calls.length, 0);
  }
  const f = setup();
  delete f.request.openxiangda.operation.platformAccess.selectedDepartments;
  await assert.rejects(
    f.directory.selectedDepartments(['d1']),
    /ACCESS_REQUIRED/
  );
  assert.equal(f.calls.length, 0);
  const service = setup();
  service.request.openxiangda.principal.principalType = 'application';
  await assert.rejects(
    service.directory.selectedDepartments(['d1']),
    /USER_CONTEXT_REQUIRED/
  );
  assert.equal(service.calls.length, 0);
});
test('department facts fail closed for mismatched targets, shape, revision or time', async () => {
  for (const bad of [
    { departments: [{ value: 'other', label: '实验室' }] },
    { departments: [] },
    { departments: [{ value: 'd1', label: '' }] },
    {
      departments: [
        {
          value: 'd1',
          label: '实验室',
          path: [{ value: 'other', label: '其他' }],
        },
      ],
    },
    {
      departments: [
        { value: 'd1', label: '实验室', parent: { value: 'root', label: 7 } },
      ],
    },
    { schemaVersion: 'old' },
    { snapshotRevision: 'no' },
    { resolvedAt: 'invalid' },
    { resolvedAt: 0 },
    { extra: true },
  ]) {
    const f = setup();
    f.setResult(bad);
    await assert.rejects(f.directory.selectedDepartments(['d1']), {
      code: 'OPENXIANGDA_DIRECTORY_DEPARTMENTS_RESPONSE_INVALID',
    });
  }
});
