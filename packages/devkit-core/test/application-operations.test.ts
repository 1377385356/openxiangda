import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationOperationCatalog, applicationOperationTransport, parseApplicationOperation, secretOperationMetadata } from '../src/application-operations.js';
import { OpenXiangdaControlPlaneClient, ControlPlaneError } from '../src/control-plane-client.js';
import { developerError } from '../src/developer-errors.js';

const id = '11111111-1111-4111-8111-111111111111';
const copy = { operation: 'secrets.copy', environment: 'production', input: {
  sourceEnvironment: 'test', reason: '复用已验证配置', idempotencyKey: 'copy:operation', secrets: [{ name: 'integration-secret', sourceRevision: 3, expectedRevision: 0 }],
} };

test('operation contracts reject owner overrides, missing environment, invalid revisions and unbounded copies', () => {
  parseApplicationOperation(copy);
  for (const invalid of [
    { ...copy, environment: undefined }, { ...copy, environment: 'preproduction' }, { ...copy, appCode: 'other' },
    { ...copy, input: { ...copy.input, environmentKey: 'production' } },
    { ...copy, input: { ...copy.input, sourceEnvironment: 'production' } },
    { ...copy, input: { ...copy.input, secrets: [copy.input.secrets[0], copy.input.secrets[0]] } },
    { ...copy, input: { ...copy.input, secrets: [{ ...copy.input.secrets[0], sourceRevision: 1.5 }] } },
    { ...copy, input: { ...copy.input, secrets: [{ ...copy.input.secrets[0], value: 'must-not-pass' }] } },
    { ...copy, input: { ...copy.input, secrets: Array.from({ length: 51 }, (_, i) => ({ name: `item-${i}`, sourceRevision: 1, expectedRevision: 0 })) } },
    { operation: 'http', environment: 'production', input: { path: '/admin' } },
    { operation: 'events.replay', environment: 'production', input: { deliveryId: id, reason: '修复', idempotencyKey: 'original-key' } },
    { operation: 'events.deliveries', environment: 'production', input: { limit: 101 } },
  ]) assert.throws(() => parseApplicationOperation(invalid), /INVALID/);
  assert.throws(() => parseApplicationOperation({ ...copy, input: { reason: 'x'.repeat(32769) } }), /TOO_LARGE/);
});

test('environment and exact original recovery identity reach only fixed application routes', () => {
  const transport = applicationOperationTransport('example app', copy);
  assert.equal(transport.path, '/openxiangda-api/v2/applications/example%20app/environments/production/secrets/copy-from-environment');
  const { sourceEnvironment: _source, ...input } = copy.input;
  assert.deepEqual(JSON.parse(transport.init.body!), { ...input, sourceEnvironmentKey: 'preproduction' });
});

test('HTTP management calls preserve scoped pagination, current subscription and original errors', async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.example/service', fetch: async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (String(url).includes('copy-from-environment')) return new Response(JSON.stringify({ code: 409, errorCode: 'APPLICATION_V2_SECRET_REVISION_CONFLICT', message: '修订冲突', data: { name: 'integration-secret', actualRevision: 4 } }), { status: 409 });
    return new Response(JSON.stringify({ code: 200, data: { items: [], admission: { blocked: false } } }));
  } });
  await client.applicationOperation('app', { operation: 'events.deliveries', environment: 'test', input: { limit: 7, cursor: 'next+cursor' } });
  const query = new URL(calls[0]!.url).searchParams;
  assert.equal(query.get('environmentKey'), 'preproduction'); assert.equal(query.get('limit'), '7'); assert.equal(query.get('cursor'), 'next+cursor');
  await client.applicationOperation('app', { operation: 'events.replay', environment: 'production', input: { deliveryId: id, reason: '已修复原订阅', idempotencyKey: 'same-key', useCurrentSubscription: true } });
  assert.ok(calls[1]!.url.endsWith(`/events/deliveries/${id}/replay`));
  assert.deepEqual(calls[1]!.body, { environmentKey: 'production', reason: '已修复原订阅', idempotencyKey: 'same-key', useCurrentSubscription: true });
  await assert.rejects(() => client.applicationOperation('app', copy), error => {
    assert.ok(error instanceof ControlPlaneError); assert.equal(error.code, 'APPLICATION_V2_SECRET_REVISION_CONFLICT');
    assert.deepEqual(error.data, { name: 'integration-secret', actualRevision: 4 });
    assert.equal(developerError(error).nextCommand, 'pnpm openxiangda docs application-operations'); return true;
  });
  assert.equal(calls.length, 3);
});

test('credential success projects metadata and never forwards new cleartext or nested secret fields', async () => {
  const data = { schemaVersion: 'openxiangda.application-secret-copy/v2', environmentKey: 'production', items: [{ name: 'integration-secret', revision: 4, hasValue: true, value: 'never-output', ciphertext: 'never-output', activeVersion: { value: 'never-output' } }], value: 'never-output' };
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.example', fetch: async () => new Response(JSON.stringify({ code: 200, data })) });
  const output = await client.applicationOperation('app', copy);
  assert.deepEqual(output, { schemaVersion: data.schemaVersion, environmentKey: 'production', items: [{ name: 'integration-secret', revision: 4, hasValue: true }] });
  assert.equal(JSON.stringify(output).includes('never-output'), false);
  assert.equal(secretOperationMetadata(null), null);
});

test('notification defaults, health, lookup and recovery keep their original server authority', () => {
  const defaultTransport = applicationOperationTransport('app', { operation: 'notifications.set-default', environment: 'production', input: { bindingCode: 'organization.default', expectedRevision: 3, expectedBindingRevision: 2 } });
  assert.deepEqual(JSON.parse(defaultTransport.init.body!), { environmentKey: 'production', bindingCode: 'organization.default', expectedRevision: 3, expectedBindingRevision: 2 });
  const health = applicationOperationTransport('app', { operation: 'notifications.test', environment: 'production', input: { bindingCode: 'organization.default', channel: 'external-http' } });
  assert.ok(health.path.endsWith('/channels/external-http/test'));
  assert.deepEqual(JSON.parse(health.init.body!), { environmentKey: 'production', bindingCode: 'organization.default' });
  const replay = applicationOperationTransport('app', { operation: 'notifications.replay', environment: 'test', input: { deadLetterId: id } });
  assert.deepEqual(JSON.parse(replay.init.body!), { environmentKey: 'preproduction' });
  const catalog = applicationOperationCatalog();
  assert.equal(new Set(catalog.operations.map(item => item.operation)).size, catalog.operations.length);
  assert.equal(catalog.operations.find(item => item.operation === 'notifications.replay')!.effect, 'recover');
  assert.equal(catalog.operations.some(item => /delete|clear|bulk/.test(item.operation)), false);
});

test('execution health is a bounded GET on the current workspace and never authorizes recovery', async () => {
  const request = { operation: 'diagnostics.execution-health' as const, environment: 'test' as const,
    input: { kind: 'event-delivery' as const, id } };
  const calls: string[] = [];
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.example', fetch: async (url, init) => {
    calls.push(String(url)); assert.equal(init?.body, undefined);
    return new Response(JSON.stringify({ code: 200, data: { state: 'unavailable', reason: 'DIAGNOSTIC_TIMEOUT', fact: null } }));
  } });
  const result = await client.applicationOperation('app', request);
  const url = new URL(calls[0]!);
  assert.equal(url.pathname, '/openxiangda-api/v2/applications/app/diagnostics/execution-health');
  assert.equal(url.searchParams.get('environmentKey'), 'preproduction');
  assert.equal(url.searchParams.get('id'), id);
  assert.deepEqual(result, { state: 'unavailable', reason: 'DIAGNOSTIC_TIMEOUT', fact: null });
  for (const input of [{ ...request.input, id: [id] }, { ...request.input, tenantId: 'other' }, { ...request.input, kind: 'rawSql' }, { kind: 'legacy-schedule', id }])
    assert.throws(() => parseApplicationOperation({ ...request, input }), /INPUT_INVALID/);
  const definition = applicationOperationCatalog().operations.find(row => row.operation === request.operation)!;
  assert.equal(definition.effect, 'read'); assert.match(definition.permission, /应用管理/);
  assert.match(definition.recovery, /不证明/); assert.equal(calls.length, 1);
});

test('semantic observations use the original TEST GET and reject production or owner overrides', async () => {
  const request = { operation: 'diagnostics.semantic-audit' as const, environment: 'test' as const,
    input: { requirementId: 'native.file-value.v2-envelope' as const, resourceCode: 'records', expectedAppVersionId: id,
      expectedHeadRevision: 7, afterRecordId: id, limit: 50 } };
  const calls: string[] = [];
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.example', fetch: async (url, init) => {
    calls.push(String(url)); assert.equal(init?.body, undefined);
    return new Response(JSON.stringify({ code: 200, data: { outcome: 'incomplete', complete: false, admission: 'observe-only' } }));
  } });
  assert.deepEqual(await client.applicationOperation('app', request), { outcome: 'incomplete', complete: false, admission: 'observe-only' });
  const url = new URL(calls[0]!);
  assert.equal(url.pathname, '/openxiangda-api/v2/applications/app/diagnostics/semantic-audit');
  assert.equal(url.searchParams.get('environmentKey'), 'preproduction');
  assert.equal(url.searchParams.get('expectedAppVersionId'), id);
  assert.equal(url.searchParams.get('expectedHeadRevision'), '7');
  assert.equal(url.searchParams.get('afterRecordId'), id);
  assert.equal(url.searchParams.get('limit'), '50');
  for (const input of [{ ...request.input, limit: 101 }, { ...request.input, expectedHeadRevision: [7] },
    { ...request.input, requirementId: 'unknown' }, { ...request.input, tenantId: 'foreign' }, { ...request.input, environmentKey: 'production' }])
    assert.throws(() => parseApplicationOperation({ ...request, input }), /INPUT_INVALID/);
  assert.throws(() => parseApplicationOperation({ ...request, environment: 'production' }), /INPUT_INVALID/);
  const definition = applicationOperationCatalog().operations.find(row => row.operation === request.operation)!;
  assert.equal(definition.effect, 'read'); assert.match(definition.permission, /平台管理员/);
  assert.match(definition.recovery, /激活许可/);
});

test('managed cleanup accepts only TEST and the original run/digest on fixed routes', async () => {
  const prepare = { operation: 'acceptance-data.prepare' as const, environment: 'test' as const,
    input: { requestKey: id, expectedAppVersionId: id, expectedHeadRevision: 1, actors: [{ key: 'member', roleCodes: ['member'] }] } };
  const start = applicationOperationTransport('workspace-app', prepare);
  assert.equal(start.path, '/openxiangda-api/v2/applications/workspace-app/acceptance/data-runs/prepare');
  assert.deepEqual(JSON.parse(start.init.body!), { ...prepare.input, environmentKey: 'preproduction' });
  const execute = { operation: 'acceptance-data.execute-cleanup' as const, environment: 'test' as const,
    input: { runId: id, manifestSha256: 'a'.repeat(64), mode: 'canary' as const } };
  const calls: Array<{ path: string; body: unknown }> = [];
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.example', fetch: async (url, init) => {
    calls.push({ path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ code: 200, data: { runId: id, readback: { cleanupState: 'repair-pending', remainingRecordCount: 1 } } }));
  } });
  assert.deepEqual(await client.applicationOperation('workspace-app', execute), { runId: id, readback: { cleanupState: 'repair-pending', remainingRecordCount: 1 } });
  assert.deepEqual(calls, [{ path: `/openxiangda-api/v2/applications/workspace-app/acceptance/data-runs/${id}/cleanup-execute`, body: { manifestSha256: 'a'.repeat(64), mode: 'canary' } }]);
  for (const operation of ['acceptance-data.status', 'acceptance-data.preview-cleanup'] as const) {
    const transport = applicationOperationTransport('workspace-app', { operation, environment: 'test', input: { runId: id } });
    assert.equal(transport.init.body, undefined); assert.match(transport.path, /environmentKey=preproduction/);
  }
  for (const invalid of [{ ...prepare, environment: 'production' }, { ...prepare, input: { ...prepare.input, appType: 'other' } },
    { ...prepare, input: { ...prepare.input, actors: Array.from({ length: 13 }, () => prepare.input.actors[0]) } },
    { ...execute, environment: 'production' }, { ...execute, input: { ...execute.input, plan: {} } },
    { ...execute, input: { ...execute.input, tenantId: 'other' } }, { ...execute, input: { ...execute.input, mode: 'all' } }])
    assert.throws(() => parseApplicationOperation(invalid), /INPUT_INVALID/);
  assert.match(applicationOperationCatalog().operations.find(item => item.operation === execute.operation)!.permission, /平台管理员/);
});
