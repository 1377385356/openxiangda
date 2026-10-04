import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { assertDataTransactionRequest, canonicalJson, dataTransactionRequestSchema, sha256Digest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, defineOpenXiangdaApp, requiredPlatformCapabilities } from '../src/index.js';

function source(): any {
  return { app: { code: 'scope-app', name: '范围管理' },
    data: { resources: [{ code: 'jobs', name: '工单', fields: [{ code: 'title', label: '标题', type: 'text.short' }] }] },
    authz: { capabilities: [{ code: 'app:scope-app:manage', kind: 'backend', name: '管理' }],
      roles: [{ code: 'college-admin', name: '学院管理', capabilities: ['app:scope-app:manage'] }] },
    backend: { enabled: true, operations: [{ code: 'job.manage', method: 'POST', path: '/jobs/manage',
      capability: 'app:scope-app:manage', requestSchema: { type: 'object' }, responseSchema: { type: 'object' },
      platformAccess: { roleAssertions: { roleCodes: ['college-admin'], actorAuthority: true } } }] } };
}
function compile(input = source()) {
  const app = defineOpenXiangdaApp(input), compiled = compileApplicationSources(app);
  const native = compileNativeApplicationConfiguration({ appCode: app.app.code,
    configBytes: canonicalJson(compiled.config.value), contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: sha256Digest(compiled.config.value), expectedContractDigest: sha256Digest(compiled.contracts.value) });
  return { app, compiled, native };
}
test('actor-authority opt-in survives both immutable projections and derives its own platform capability', () => {
  const { app, compiled, native } = compile();
  const expected = source().backend.operations[0].platformAccess;
  assert.deepEqual(compiled.config.value.backend.operations[0]!.platformAccess, expected);
  assert.deepEqual((native.projections.contracts.value as any).operations[0].platformAccess, expected);
  assert.equal(native.requiredPlatformCapabilities.find(item => item.code === 'data.transaction-actor-authority')?.contractVersion, '1.0.0');
  assert.equal(requiredPlatformCapabilities(app).find(item => item.code === 'data.transaction-actor-authority')?.contractVersion, '1.0.0');
  const ordinary = source(); delete ordinary.backend.operations[0].platformAccess.roleAssertions.actorAuthority;
  assert.equal(compile(ordinary).native.requiredPlatformCapabilities.some(item => item.code === 'data.transaction-actor-authority'), false);
  for (const actorAuthority of [false, 'true', 1, null]) {
    const invalid = source(); invalid.backend.operations[0].platformAccess.roleAssertions.actorAuthority = actorAuthority;
    assert.throws(() => compile(invalid));
  }
});
test('transaction JSON schema and pure validator agree on bounded same-actor branches', () => {
  const guard = { kind: 'actor-authority', errorCode: 'OPENXIANGDA_SCOPE_DENIED',
    anyOf: [{ roleCode: 'college-admin', scope: { dimensionCode: 'college', value: 'c1', operation: 'manage' } }] };
  const request = { schemaVersion: 'openxiangda.data-transaction-request/v2', idempotencyKey: 'manage-1', guards: [guard],
    operations: [{ operation: 'create', resourceCode: 'jobs', data: { title: '管理' } }] };
  const validate = new Ajv2020({ strict: false }).compile(dataTransactionRequestSchema);
  assert.equal(validate(request), true, JSON.stringify(validate.errors));
  assert.doesNotThrow(() => assertDataTransactionRequest(request));
  for (const change of [{ userId: 'forged' }, { requiredCapability: 'forged' }, { anyOf: [] },
    { anyOf: Array(21).fill(guard.anyOf[0]) }, { anyOf: [guard.anyOf[0], structuredClone(guard.anyOf[0])] },
    { anyOf: [{ roleCode: 'college-admin', scope: { ...guard.anyOf[0]!.scope, value: ' c1' } }] },
    { allowAppSuperAdmin: 'true' }, { errorCode: 'BAD' }]) {
    const invalid = { ...request, guards: [{ ...guard, ...change }] };
    assert.equal(validate(invalid), false);
    assert.throws(() => assertDataTransactionRequest(invalid));
  }
});
