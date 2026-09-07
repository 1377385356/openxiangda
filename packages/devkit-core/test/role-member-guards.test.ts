import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { assertDataTransactionRequest, canonicalJson, dataTransactionRequestSchema, sha256Digest, type DataTransactionRequest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, defineOpenXiangdaApp, type OpenXiangdaAppDeclaration } from '../src/index.js';

function declaration(): OpenXiangdaAppDeclaration {
  return {
    app: { code: 'dispatch', name: '事务角色验证' },
    data: { resources: [{ code: 'jobs', name: '工单', fields: [{ code: 'title', label: '标题', type: 'text.short' }] }] },
    authz: {
      capabilities: [{ code: 'app:dispatch:job:assign', kind: 'backend', name: '分派工单' }],
      roles: [{ code: 'repair_tech', name: '维修人员', capabilities: ['app:dispatch:job:assign'] }],
    },
    backend: { enabled: true, operations: [{
      code: 'job.assign', method: 'POST', path: '/jobs/:id/assign', capability: 'app:dispatch:job:assign',
      requestSchema: { type: 'object' }, responseSchema: { type: 'object' },
      platformAccess: { roleAssertions: { roleCodes: ['repair_tech'] } },
    }] },
  };
}

test('角色条件从应用声明贯通配置、不可变操作合同和共享原生编译器', () => {
  const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration()));
  assert.deepEqual(compiled.config.value.backend.operations[0]!.platformAccess?.roleAssertions,
    { roleCodes: ['repair_tech'] });
  const input = { appCode: 'dispatch', configBytes: canonicalJson(compiled.config.value),
    contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: sha256Digest(compiled.config.value), expectedContractDigest: sha256Digest(compiled.contracts.value) };
  assert.equal(compileNativeApplicationConfiguration(input).appCode, 'dispatch');
  const invalid = structuredClone(compiled.config.value);
  invalid.backend.operations[0]!.platformAccess!.roleAssertions = { roleCodes: ['missing'] };
  const invalidContract = { ...compiled.contracts.value, configDigest: sha256Digest(invalid) };
  assert.throws(() => compileNativeApplicationConfiguration({ ...input,
    configBytes: canonicalJson(invalid), expectedConfigDigest: sha256Digest(invalid),
    contractBytes: canonicalJson(invalidContract), expectedContractDigest: sha256Digest(invalidContract) }),
    /NATIVE_ROLE_REFERENCE_MISSING/);
});

test('声明不允许未知角色、空列表或重复成员条件依赖', () => {
  for (const roles of [[], ['missing'], ['repair_tech', 'repair_tech']]) {
    const input = declaration();
    input.backend!.operations![0]!.platformAccess!.roleAssertions = { roleCodes: roles };
    assert.throws(() => defineOpenXiangdaApp(input), (error: any) =>
      error.diagnostics.some((item: any) => item.code === 'APP_CONFIG_BACKEND_OPERATION_PLATFORM_ACCESS_INVALID'));
  }
});

test('JSON Schema 与纯校验器接受同一有界角色条件，拒绝调用者锁、环境及额外参数', () => {
  const request: DataTransactionRequest = {
    schemaVersion: 'openxiangda.data-transaction-request/v2', idempotencyKey: 'assign-1',
    guards: [{ kind: 'role-member', roleCode: 'repair_tech', userId: 'user-2', errorCode: 'OPENXIANGDA_ASSIGNEE_INVALID' }],
    operations: [{ operation: 'create', resourceCode: 'jobs', data: { title: '维修' } }],
  };
  const validate = new Ajv2020({ strict: false }).compile(dataTransactionRequestSchema);
  assert.equal(validate(request), true, JSON.stringify(validate.errors));
  assert.doesNotThrow(() => assertDataTransactionRequest(request));
  for (const change of [{ lockKey: 'untrusted' }, { environmentId: 'another' }, { roleCode: '' }, { userId: 'x'.repeat(256) }, { errorCode: 'BAD' }]) {
    const invalid = { ...request, guards: [{ ...request.guards![0], ...change }] };
    assert.equal(validate(invalid), false);
    assert.throws(() => assertDataTransactionRequest(invalid));
  }
});
