import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import {
  compileApplicationSources,
  defineOpenXiangdaApp,
  resourceRoleCapabilities,
  type OpenXiangdaAppDeclaration,
} from '../src/index.js';

const surfaceCapability =
  'app:surface-app:surface:contract-signing-detail:read';

function declaration(): OpenXiangdaAppDeclaration {
  return {
    schemaVersion: 3,
    app: { code: 'surface-app', name: 'Surface App' },
    frontend: { root: 'apps/web' },
    backend: { root: 'apps/server', runtime: 'node', framework: 'nestjs' },
    platform: { root: 'platform' },
    authz: {
      capabilities: [
        { code: surfaceCapability, kind: 'backend', name: '读取合同签署详情' },
      ],
      roles: [
        {
          code: 'handler',
          name: '经办人',
          capabilities: [
            ...resourceRoleCapabilities('surface-app', 'contracts', 'read'),
            surfaceCapability,
          ],
        },
      ],
    },
    data: {
      resources: [
        {
          code: 'contracts',
          name: '合同',
          fields: [
            { code: 'contractNo', type: 'text.short', label: '合同编号' },
            { code: 'status', type: 'text.short', label: '状态' },
          ],
        },
        {
          code: 'contract-signings',
          name: '签署记录',
          fields: [
            {
              code: 'contract',
              type: 'resource-ref.single',
              label: '合同',
              source: {
                kind: 'resource',
                resourceCode: 'contracts',
                labelField: 'contractNo',
              },
            },
            { code: 'status', type: 'text.short', label: '状态' },
            { code: 'failureCode', type: 'text.short', label: '失败码' },
          ],
        },
      ],
      subjectReadSurfaces: [
        {
          code: 'contract-signing-detail',
          name: '合同签署详情',
          capability: surfaceCapability,
          subject: {
            resourceCode: 'contracts',
            fields: ['status', 'contractNo'],
          },
          relations: [
            {
              code: 'signing-attempts',
              resourceCode: 'contract-signings',
              foreignKeyField: 'contract',
              fields: ['status', 'failureCode'],
              order: [{ field: 'created_at', direction: 'desc' }],
              limit: 50,
            },
          ],
        },
      ],
    },
  };
}

test('compiles bounded subject read surfaces into immutable config and contract bundles', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp(declaration())
  );
  const expected = {
    code: 'contract-signing-detail',
    name: '合同签署详情',
    capability: surfaceCapability,
    subject: {
      resourceCode: 'contracts',
      fields: ['contractNo', 'status'],
    },
    relations: [
      {
        code: 'signing-attempts',
        resourceCode: 'contract-signings',
        foreignKeyField: 'contract',
        fields: ['failureCode', 'status'],
        order: [{ field: 'created_at', direction: 'desc' }],
        limit: 50,
      },
    ],
  };
  assert.deepEqual(compiled.config.value.data.subjectReadSurfaces, [expected]);
  assert.deepEqual(compiled.contracts.value.subjectReadSurfaces, [expected]);
  const platform = compileNativeApplicationConfiguration({
    appCode: compiled.config.value.appCode,
    configBytes: canonicalJson(compiled.config.value),
    contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: compiled.config.digest,
    expectedContractDigest: compiled.contracts.digest,
  });
  assert.deepEqual(platform.projections.data.value.subjectReadSurfaces, [expected]);
  assert.deepEqual(platform.projections.contracts.value.subjectReadSurfaces, [expected]);
});

test('does not change bundle bytes for applications without subject surfaces', () => {
  const input = declaration();
  delete input.data!.subjectReadSurfaces;
  const compiled = compileApplicationSources(defineOpenXiangdaApp(input));
  assert.equal('subjectReadSurfaces' in compiled.config.value.data, false);
  assert.equal('subjectReadSurfaces' in compiled.contracts.value, false);
  assert.doesNotThrow(() =>
    compileNativeApplicationConfiguration({
      appCode: compiled.config.value.appCode,
      configBytes: canonicalJson(compiled.config.value),
      contractBytes: canonicalJson(compiled.contracts.value),
      expectedConfigDigest: compiled.config.digest,
      expectedContractDigest: compiled.contracts.digest,
    })
  );
});

test('rejects a subject read surface whose relation does not point to its parent', () => {
  const input = declaration();
  const relation = input.data!.subjectReadSurfaces![0]!.relations[0]!;
  input.data!.subjectReadSurfaces![0] = {
    ...input.data!.subjectReadSurfaces![0]!,
    relations: [{ ...relation, foreignKeyField: 'failureCode' }],
  };
  assert.throws(
    () => defineOpenXiangdaApp(input),
    error =>
      Boolean(
        (error as { diagnostics?: Array<{ code: string }> }).diagnostics?.some(
          item => item.code === 'APP_CONFIG_SUBJECT_READ_SURFACE_INVALID'
        )
      )
  );
});

test('rejects subject read surfaces whose declared relation budget exceeds 400 rows', () => {
  const input = declaration();
  const relation = input.data!.subjectReadSurfaces![0]!.relations[0]!;
  input.data!.subjectReadSurfaces![0] = {
    ...input.data!.subjectReadSurfaces![0]!,
    relations: Array.from({ length: 5 }, (_, index) => ({
      ...relation,
      code: `signing-attempts-${index + 1}`,
      limit: 100,
    })),
  };
  assert.throws(
    () => defineOpenXiangdaApp(input),
    error =>
      Boolean(
        (error as { diagnostics?: Array<{ code: string }> }).diagnostics?.some(
          item => item.code === 'APP_CONFIG_SUBJECT_READ_SURFACE_INVALID'
        )
      )
  );
});
