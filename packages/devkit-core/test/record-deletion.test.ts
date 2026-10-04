import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest, validateDataResource } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities, type OpenXiangdaAppDeclaration } from '../src/index.js';

const capability = 'app:deletion-app:maintenance:delete';
function source(remove?: boolean | string[]): OpenXiangdaAppDeclaration {
  return { app: { code: 'deletion-app', name: '资料维护' }, frontend: { root: 'apps/web' },
    authz: { roles: [], capabilities: [{ code: capability, kind: 'ui', name: '删除流程与资料' }] },
    modules: [{ code: 'maintenance', models: [{ code: 'requests', name: '申请', fields: [{ code: 'name', type: 'text.short', label: '名称' }],
      mutationOwner: 'action', ...(remove === undefined ? {} : { recordDeletion: { delete: remove } }) }], crud: [] }] };
}
function platform(config: any, contract: any) {
  const value = { ...contract, configDigest: sha256Digest(config) };
  return compileNativeApplicationConfiguration({ appCode: 'deletion-app', configBytes: canonicalJson(config),
    contractBytes: canonicalJson(value), expectedConfigDigest: sha256Digest(config), expectedContractDigest: sha256Digest(value) });
}

test('default disable and opt-in materialize without granting update or altering action ownership', () => {
  for (const remove of [undefined, false, true, [capability]]) {
    const app = defineOpenXiangdaApp(source(remove));
    const compiled = compileApplicationSources(app);
    const resource = compiled.config.value.data.resources[0]!;
    assert.deepEqual(resource.recordDeletion, remove === undefined ? undefined
      : { delete: remove === false ? [] : remove === true ? [resource.capabilities.delete] : remove });
    assert.deepEqual(validateDataResource(resource), []);
    assert.equal(platform(compiled.config.value, compiled.contracts.value).appCode, 'deletion-app');
    assert.equal(requiredPlatformCapabilities(app).find(item => item.code === 'data.workflow-record-deletion')?.contractVersion,
      remove === undefined ? undefined : '1.0.0');
    assert.equal(resource.surface?.mutationOwner, 'action');
    assert.deepEqual(resource.schema.fields.map(field => field.code), ['name']);
    assert.deepEqual(compiled.config.value.authz.roles, []);
  }
});

test('the independent capability remains explicit and generated data types carry only canonical arrays', () => {
  const compiled = compileApplicationSources(defineOpenXiangdaApp(source([capability])));
  assert.deepEqual(compiled.contracts.value.capabilities.filter(item => item.code === capability),
    [{ code: capability, kind: 'ui', name: '删除流程与资料', source: 'explicit' }]);
  assert.match(compiled.contracts.typescript, /recordDeletion/);
  assert.doesNotMatch(compiled.contracts.typescript, /recordDeletion[^\n]*true/);
});

test('unknown or cross-application deletion references fail on both compilers', () => {
  for (const invalid of ['app:deletion-app:missing:delete', 'app:other:maintenance:delete']) {
    assert.throws(() => defineOpenXiangdaApp(source([invalid])));
    const compiled = compileApplicationSources(defineOpenXiangdaApp(source(false)));
    const config = structuredClone(compiled.config.value);
    config.data.resources[0]!.recordDeletion = { delete: [invalid] };
    assert.throws(() => platform(config, compiled.contracts.value), (error: any) =>
      ['NATIVE_CAPABILITY_REFERENCE_MISSING', 'NATIVE_CAPABILITY_CODE_INVALID', 'NATIVE_CAPABILITY_APP_MISMATCH'].includes(error.code) && error.pointer.includes('recordDeletion'));
  }
});

test('closed policies reject malformed authoring and wire arrays; empty canonical array is explicit disable', () => {
  for (const policy of [null, [], {}, { delete: [] }, { delete: [''] }, { delete: ['a', 'a'] }, { delete: true, update: true }, { delete: 1 }]) {
    const invalid = source(false) as any; invalid.modules[0].models[0].recordDeletion = policy;
    assert.throws(() => defineOpenXiangdaApp(invalid), (error: any) => error.diagnostics?.some(item => item.code === 'APP_CONFIG_RECORD_DELETION_DELETE_INVALID'));
  }
  const compiled = compileApplicationSources(defineOpenXiangdaApp(source(false)));
  for (const policy of [{ delete: true }, { delete: ['a', 'a'] }, { delete: [''] }, { delete: [], update: true }]) {
    const config = structuredClone(compiled.config.value) as any; config.data.resources[0].recordDeletion = policy;
    assert.ok(validateDataResource(config.data.resources[0]).length > 0);
    assert.throws(() => platform(config, compiled.contracts.value));
  }
});

test('direct resources and module models preserve cross-resource capability references identically', () => {
  const declaration = source([capability, 'app:deletion-app:data:later:delete']);
  declaration.modules![0]!.models.push({ code: 'later', name: '另表', fields: [{ code: 'name', type: 'text.short', label: '名称' }] });
  const modules = defineOpenXiangdaApp(declaration);
  const direct = defineOpenXiangdaApp({ ...source(), modules: undefined, data: {
    resources: declaration.modules![0]!.models.map(model => ({ ...model, fields: [...model.fields] })) } });
  assert.deepEqual(modules.data?.resources.map(resource => resource.recordDeletion), direct.data?.resources.map(resource => resource.recordDeletion));
});
