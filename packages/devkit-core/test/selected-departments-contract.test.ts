import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import {
  defineOpenXiangdaApp,
  compileApplicationSources,
  requiredPlatformCapabilities,
} from '../src/index.js';
function source(): any {
  return {
    app: { code: 'department-app', name: '部门核验' },
    frontend: { root: 'apps/web' },
    data: {
      resources: [
        {
          code: 'requests',
          name: '申请',
          fields: [
            { code: 'title', label: '标题', type: 'text.short' },
            {
              code: 'files',
              label: '附件',
              type: 'file',
              file: { maxCount: 8, maxSizeMb: 100 },
            },
          ],
        },
      ],
    },
    authz: {
      roles: [],
      capabilities: [
        {
          code: 'app:department-app:selection:verify',
          kind: 'backend',
          name: '核验',
        },
      ],
    },
    backend: {
      enabled: true,
      operations: [
        {
          code: 'selection.verify',
          method: 'POST',
          path: '/api/selection',
          capability: 'app:department-app:selection:verify',
          requestSchema: { type: 'object' },
          responseSchema: { type: 'object' },
          platformAccess: {
            selectedDepartments: {
              fields: ['path', 'name', 'parent'],
              maxIds: 8,
            },
          },
        },
      ],
    },
  };
}
function compile(value = source()) {
  const app = defineOpenXiangdaApp(value),
    compiled = compileApplicationSources(app);
  const native = compileNativeApplicationConfiguration({
    appCode: app.app.code,
    configBytes: canonicalJson(compiled.config.value),
    contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: sha256Digest(compiled.config.value),
    expectedContractDigest: sha256Digest(compiled.contracts.value),
  });
  return { app, compiled, native };
}
test('department declaration is canonical across authoring, both bundles and server capabilities', () => {
  const { app, compiled, native } = compile();
  const expected = { fields: ['name', 'parent', 'path'], maxIds: 8 };
  assert.deepEqual(
    compiled.config.value.backend.operations[0]?.platformAccess
      ?.selectedDepartments,
    expected
  );
  assert.deepEqual(
    compiled.contracts.value.operations[0]?.platformAccess?.selectedDepartments,
    expected
  );
  assert.match(compiled.contracts.typescript, /selectedDepartments/);
  for (const code of [
    'directory.selected-departments',
  ]) {
    const capability = native.requiredPlatformCapabilities.find(
      (c) => c.code === code
    );
    assert.equal(capability?.contractVersion, '1.0.0');
    assert.deepEqual(
      requiredPlatformCapabilities(app).find((c) => c.code === code),
      capability
    );
    assert.ok(
      compiled.config.value.runtime.protocolCapabilities.includes(code)
    );
  }
  const plain = source();
  delete plain.backend.operations[0].platformAccess;
  plain.data.resources[0].fields.pop();
  const plainResult = compile(plain);
  assert.equal(
    plainResult.native.requiredPlatformCapabilities.some(
      (c) =>
        c.code === 'directory.selected-departments'
    ),
    false
  );
});
test('invalid or widening department declarations are rejected by authoring and by native bundle validation', () => {
  for (const access of [
    null,
    {},
    { fields: [], maxIds: 8 },
    { fields: ['path'], maxIds: 8 },
    { fields: ['name', 'name'], maxIds: 8 },
    { fields: ['name', 'phone'], maxIds: 8 },
    { fields: ['name'], maxIds: 0 },
    { fields: ['name'], maxIds: 51 },
    { fields: ['name'], maxIds: 1.5 },
    { fields: ['name'], maxIds: 8, scope: 'all' },
  ]) {
    const value = source();
    value.backend.operations[0].platformAccess.selectedDepartments = access;
    assert.throws(() => defineOpenXiangdaApp(value));
    const { app, compiled } = compile();
    (
      compiled.config.value.backend.operations[0]!.platformAccess as any
    ).selectedDepartments = access;
    (
      compiled.contracts.value.operations[0]!.platformAccess as any
    ).selectedDepartments = access;
    assert.throws(() =>
      compileNativeApplicationConfiguration({
        appCode: app.app.code,
        configBytes: canonicalJson(compiled.config.value),
        contractBytes: canonicalJson(compiled.contracts.value),
        expectedConfigDigest: sha256Digest(compiled.config.value),
        expectedContractDigest: sha256Digest(compiled.contracts.value),
      })
    );
  }
});
