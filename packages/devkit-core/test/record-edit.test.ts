import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities } from '../src/index.js';

function source() {
  return {
    app: { code: 'edit-app', name: '资料维护' }, frontend: { root: 'apps/web' },
    authz: { roles: [], capabilities: [{ code: 'app:edit-app:edit', kind: 'backend', name: '修改资料' }] },
    modules: [{ code: 'records', crud: [], models: [{ code: 'requests', name: '申请', mutationOwner: 'action', fields: [
      { code: 'name', label: '名称', type: 'text.short' },
      { code: 'identity', label: '身份', type: 'text.short', access: { update: false } },
      { code: 'serial', label: '编号', type: 'serial-number', serial: { prefix: 'R', digits: 6 } },
    ] }] }],
    backend: { enabled: true, operations: [{ code: 'record.edit', method: 'POST', path: '/api/records/edit', capability: 'app:edit-app:edit',
      requestSchema: { type: 'object', additionalProperties: false }, responseSchema: { type: 'object', additionalProperties: false },
      platformAccess: { dataCommands: { mode: 'recoverable-native' }, recordEdit: { resourceCode: 'requests', fieldCodes: ['name'] } } }] },
  } as any;
}
function compile(value = source()) {
  const app = defineOpenXiangdaApp(value);
  const compiled = compileApplicationSources(app);
  const config = compiled.config.value, contract = compiled.contracts.value;
  const native = compileNativeApplicationConfiguration({ appCode: app.app.code,
    configBytes: canonicalJson(config), contractBytes: canonicalJson(contract),
    expectedConfigDigest: sha256Digest(config), expectedContractDigest: sha256Digest(contract) });
  return { compiled, native };
}
test('authored named editing survives normalization, application bundle and the platform compiler', () => {
  const { compiled, native } = compile();
  const expected = source().backend.operations[0].platformAccess;
  assert.deepEqual(compiled.config.value.backend.operations[0]!.platformAccess, expected);
  assert.deepEqual((native.projections.contracts.value as any).operations[0]!.platformAccess, expected);
  assert.match(compiled.contracts.typescript, /recordEdit/);
  assert.match(compiled.contracts.typescript, /recoverable-native/);
  assert.equal(compiled.config.value.data.resources[0]!.surface?.mutationOwner, 'action');
  assert.equal(native.requiredPlatformCapabilities.find(item => item.code === 'data.record-edit')?.contractVersion, '1.0.0');
  assert.equal(requiredPlatformCapabilities(defineOpenXiangdaApp(source())).find(item => item.code === 'data.record-edit')?.contractVersion, '1.0.0');
  const ordinary = source(); delete ordinary.backend.operations[0].platformAccess.recordEdit;
  assert.equal(compile(ordinary).native.requiredPlatformCapabilities.some(item => item.code === 'data.record-edit'), false);
  assert.equal(requiredPlatformCapabilities(defineOpenXiangdaApp(ordinary)).some(item => item.code === 'data.record-edit'), false);
});
test('record editing requires action ownership, recoverable writes and explicit writable non-system fields', () => {
  for (const change of [
    (s: any) => { delete s.backend.operations[0].platformAccess.dataCommands; },
    (s: any) => { s.modules[0].models[0].mutationOwner = 'native'; },
    ...['missing', 'identity', 'serial', 'created_at'].map(field => (s: any) => { s.backend.operations[0].platformAccess.recordEdit.fieldCodes = [field]; }),
    (s: any) => { s.backend.operations[0].platformAccess.recordEdit.fieldCodes = ['name', 'name']; },
  ]) { const app = source(); change(app); assert.throws(() => compile(app)); }
});
