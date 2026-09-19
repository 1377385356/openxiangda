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
const reconcileCapability = 'app:surface-app:signing:reconcile';

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
        { code: reconcileCapability, kind: 'backend', name: '对账签署终态' },
      ],
      roles: [
        {
          code: 'handler',
          name: '经办人',
          capabilities: [
            ...resourceRoleCapabilities('surface-app', 'contracts', 'read'),
            surfaceCapability,
            reconcileCapability,
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
        {
          code: 'contract-documents',
          name: '合同文件',
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
            { code: 'fileName', type: 'text.short', label: '文件名' },
            { code: 'mimeType', type: 'text.short', label: '媒体类型' },
            { code: 'fileSize', type: 'number.integer', label: '文件大小' },
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

test('compiles authenticated controlled browser operations with immutable subject and refresh bindings', () => {
  const input = declaration();
  input.backend!.operations = [
    {
      code: 'signing.reconcile',
      method: 'POST',
      path: '/api/signing/reconcile',
      capability: reconcileCapability,
      requestSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['contractId'],
        properties: {
          contractId: { type: 'string', format: 'uuid' },
        },
      },
      responseSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['status'],
        properties: { status: { type: 'string' } },
      },
      browser: {
        exposure: 'authenticated',
        behavior: 'controlled',
        idempotency: 'required',
        subject: { resourceCode: 'contracts', inputField: 'contractId' },
        refreshTargets: [
          { kind: 'subject-surface', code: 'contract-signing-detail' },
        ],
      },
    },
  ];
  const compiled = compileApplicationSources(defineOpenXiangdaApp(input));
  const browser = compiled.contracts.value.operations[0]?.browser;
  assert.deepEqual(browser, {
    exposure: 'authenticated',
    behavior: 'controlled',
    idempotency: 'required',
    subject: { resourceCode: 'contracts', inputField: 'contractId' },
    refreshTargets: [
      { kind: 'subject-surface', code: 'contract-signing-detail' },
    ],
  });
  const platform = compileNativeApplicationConfiguration({
    appCode: compiled.config.value.appCode,
    configBytes: canonicalJson(compiled.config.value),
    contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: compiled.config.digest,
    expectedContractDigest: compiled.contracts.digest,
  });
  assert.deepEqual(
    platform.projections.runtime.value.backend.operations[0]?.browser,
    browser
  );
});

test('keeps legacy operation bundle shape unchanged when browser exposure is absent', () => {
  const input = declaration();
  input.backend!.operations = [
    {
      code: 'signing.lookup',
      method: 'POST',
      path: '/api/signing/lookup',
      capability: reconcileCapability,
      requestSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      responseSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
    },
  ];
  const compiled = compileApplicationSources(defineOpenXiangdaApp(input));
  assert.equal('browser' in compiled.config.value.backend.operations[0]!, false);
  assert.equal('browser' in compiled.contracts.value.operations[0]!, false);
});

test('compiles a bounded external file intent specialization', () => {
  const input = declaration();
  input.backend!.operations = [
    {
      code: 'documents.content',
      method: 'GET',
      path: '/api/documents/content',
      capability: reconcileCapability,
      requestSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['contractId', 'documentId'],
        properties: {
          contractId: { type: 'string', format: 'uuid' },
          documentId: { type: 'string', format: 'uuid' },
        },
      },
      responseSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      browser: {
        exposure: 'authenticated',
        behavior: 'read',
        idempotency: 'none',
        subject: { resourceCode: 'contracts', inputField: 'contractId' },
        fileIntent: {
          recordResourceCode: 'contract-documents',
          recordIdInputField: 'documentId',
          relationField: 'contract',
          fileNameField: 'fileName',
          contentTypeField: 'mimeType',
          sizeField: 'fileSize',
          purposes: ['download', 'preview'],
          maxTtlSeconds: 300,
          maxBytes: 104857600,
        },
      },
    },
  ];
  const compiled = compileApplicationSources(defineOpenXiangdaApp(input));
  assert.deepEqual(compiled.contracts.value.operations[0]?.browser?.fileIntent, {
    recordResourceCode: 'contract-documents',
    recordIdInputField: 'documentId',
    relationField: 'contract',
    fileNameField: 'fileName',
    contentTypeField: 'mimeType',
    sizeField: 'fileSize',
    purposes: ['download', 'preview'],
    maxTtlSeconds: 300,
    maxBytes: 104857600,
  });
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

test('rejects file intents with a mutable method, wrong relation, or excessive bounds', () => {
  const input = declaration();
  input.backend!.operations = [
    {
      code: 'documents.content',
      method: 'POST',
      path: '/api/documents/content',
      capability: reconcileCapability,
      requestSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['contractId', 'documentId'],
        properties: {
          contractId: { type: 'string', format: 'uuid' },
          documentId: { type: 'string', format: 'uuid' },
        },
      },
      responseSchema: { type: 'object', additionalProperties: false, properties: {} },
      browser: {
        exposure: 'authenticated',
        behavior: 'read',
        idempotency: 'none',
        subject: { resourceCode: 'contracts', inputField: 'contractId' },
        fileIntent: {
          recordResourceCode: 'contract-documents',
          recordIdInputField: 'documentId',
          relationField: 'fileName',
          fileNameField: 'fileName',
          contentTypeField: 'mimeType',
          sizeField: 'fileSize',
          purposes: ['download'],
          maxTtlSeconds: 301,
          maxBytes: 104857601,
        },
      },
    },
  ];
  assert.throws(
    () => defineOpenXiangdaApp(input),
    error =>
      Boolean(
        (error as { diagnostics?: Array<{ code: string }> }).diagnostics?.some(
          item => item.code === 'APP_CONFIG_BACKEND_OPERATION_BROWSER_INVALID'
        )
      )
  );
});

test('rejects controlled browser operations without required idempotency or a declared refresh surface', () => {
  const input = declaration();
  input.backend!.operations = [
    {
      code: 'signing.reconcile',
      method: 'POST',
      path: '/api/signing/reconcile',
      capability: reconcileCapability,
      requestSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['contractId'],
        properties: { contractId: { type: 'string', format: 'uuid' } },
      },
      responseSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      browser: {
        exposure: 'authenticated',
        behavior: 'controlled',
        idempotency: 'none',
        subject: { resourceCode: 'contracts', inputField: 'contractId' },
        refreshTargets: [
          { kind: 'subject-surface', code: 'missing-surface' },
        ],
      },
    },
  ];
  assert.throws(
    () => defineOpenXiangdaApp(input),
    error =>
      Boolean(
        (error as { diagnostics?: Array<{ code: string }> }).diagnostics?.some(
          item => item.code === 'APP_CONFIG_BACKEND_OPERATION_BROWSER_INVALID'
        )
      )
  );
});

test('rejects browser operations with an open request or response root schema', () => {
  const input = declaration();
  input.backend!.operations = [
    {
      code: 'signing.reconcile',
      method: 'POST',
      path: '/api/signing/reconcile',
      capability: reconcileCapability,
      requestSchema: {
        type: 'object',
        required: ['contractId'],
        properties: { contractId: { type: 'string', format: 'uuid' } },
      },
      responseSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      browser: {
        exposure: 'authenticated',
        behavior: 'controlled',
        idempotency: 'required',
        subject: { resourceCode: 'contracts', inputField: 'contractId' },
      },
    },
  ];
  assert.throws(
    () => defineOpenXiangdaApp(input),
    error =>
      Boolean(
        (error as { diagnostics?: Array<{ code: string }> }).diagnostics?.some(
          item => item.code === 'APP_CONFIG_BACKEND_OPERATION_BROWSER_INVALID'
        )
      )
  );
});

test('rejects a browser subject input that is not a required UUID field', () => {
  const input = declaration();
  input.backend!.operations = [
    {
      code: 'signing.reconcile',
      method: 'POST',
      path: '/api/signing/reconcile',
      capability: reconcileCapability,
      requestSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['contractId'],
        properties: { contractId: { type: 'string' } },
      },
      responseSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      browser: {
        exposure: 'authenticated',
        behavior: 'controlled',
        idempotency: 'required',
        subject: { resourceCode: 'contracts', inputField: 'contractId' },
      },
    },
  ];
  assert.throws(
    () => defineOpenXiangdaApp(input),
    error =>
      Boolean(
        (error as { diagnostics?: Array<{ code: string }> }).diagnostics?.some(
          item => item.code === 'APP_CONFIG_BACKEND_OPERATION_BROWSER_INVALID'
        )
      )
  );
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
