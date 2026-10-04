import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest, validateDataResource } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities, type OpenXiangdaAppDeclaration } from '../src/index.js';

const printCapability = 'app:print-app:print:read';
function source(read?: boolean | string[]): OpenXiangdaAppDeclaration {
  return { app: { code: 'print-app', name: 'History' }, frontend: { root: 'apps/web' },
    authz: { roles: [], capabilities: [{ code: printCapability, kind: 'ui', name: 'View record print' }] },
    modules: [{ code: 'print', models: [{ code: 'requests', name: 'Requests', fields: [{ code: 'name', type: 'text.short', label: '名称' }],
      ...(read === undefined ? {} : { recordPrint: { read } }) }], crud: [] }] };
}
function platform(config: any, contract: any) {
  const value = { ...contract, configDigest: sha256Digest(config) };
  return compileNativeApplicationConfiguration({ appCode: 'print-app', configBytes: canonicalJson(config),
    contractBytes: canonicalJson(value), expectedConfigDigest: sha256Digest(config), expectedContractDigest: sha256Digest(value) });
}

test('omission preserves old declarations; opt-in and explicit disable require the platform contract', () => {
  for (const read of [undefined, false, true, [printCapability]]) {
    const app = defineOpenXiangdaApp(source(read));
    const compiled = compileApplicationSources(app);
    const resource = compiled.config.value.data.resources[0]!;
    assert.deepEqual(resource.recordPrint, read === undefined ? undefined
      : { read: read === false ? [] : read === true ? [resource.capabilities.read] : read });
    assert.deepEqual(validateDataResource(resource), []);
    assert.equal(platform(compiled.config.value, compiled.contracts.value).appCode, 'print-app');
    assert.equal(requiredPlatformCapabilities(app).find(item => item.code === 'data.record-print')?.contractVersion,
      read === undefined ? undefined : '1.0.0');
    assert.deepEqual(resource.schema.fields.map(field => field.code), ['name']);
  }
});

test('explicit print capability stays with its declared owner and does not create a second authority', () => {
  const compiled = compileApplicationSources(defineOpenXiangdaApp(source([printCapability])));
  assert.deepEqual(compiled.contracts.value.capabilities.filter(capability => capability.code === printCapability),
    [{ code: printCapability, kind: 'ui', name: 'View record print', source: 'explicit' }]);
  assert.doesNotMatch(compiled.contracts.typescript, /recordPrint[^\n]*true/);
  assert.match(compiled.contracts.typescript, /recordPrint/);
});

test('unknown and cross-application capability references fail in both authoring and platform compilation', () => {
  for (const capability of ['app:print-app:missing:read', 'app:other-app:print:read']) {
    assert.throws(() => defineOpenXiangdaApp(source([capability])));
    const compiled = compileApplicationSources(defineOpenXiangdaApp(source(false)));
    const config = structuredClone(compiled.config.value);
    config.data.resources[0]!.recordPrint = { read: [capability] };
    assert.throws(() => platform(config, compiled.contracts.value), (error: any) =>
      ['NATIVE_CAPABILITY_REFERENCE_MISSING', 'NATIVE_CAPABILITY_CODE_INVALID', 'NATIVE_CAPABILITY_APP_MISMATCH'].includes(error.code) && error.pointer.includes('recordPrint'));
  }
});

test('malformed authoring policies fail closed; canonical empty read is only an explicit disable', () => {
  for (const policy of [null, [], {}, { read: [] }, { read: [''] }, { read: ['a', 'a'] }, { read: true, write: true }, { read: 1 }]) {
    const invalid = source(false) as any;
    invalid.modules[0].models[0].recordPrint = policy;
    assert.throws(() => defineOpenXiangdaApp(invalid), (error: any) =>
      error.diagnostics?.some(item => item.code === 'APP_CONFIG_RECORD_PRINT_READ_INVALID'));
  }
  const compiled = compileApplicationSources(defineOpenXiangdaApp(source(false)));
  for (const policy of [{ read: true }, { read: ['a', 'a'] }, { read: [''] }, { read: [], write: true }]) {
    const config = structuredClone(compiled.config.value) as any;
    config.data.resources[0].recordPrint = policy;
    assert.ok(validateDataResource(config.data.resources[0]).length > 0);
    assert.throws(() => platform(config, compiled.contracts.value));
  }
});

test('direct resources and cross-model references retain the same canonical policy', () => {
  const declaration = source([printCapability, 'app:print-app:data:later:read']);
  declaration.modules![0]!.models.push({ code: 'later', name: 'Later', fields: [{ code: 'name', type: 'text.short', label: '名称' }] });
  const modules = defineOpenXiangdaApp(declaration);
  const direct = defineOpenXiangdaApp({ ...source(), modules: undefined,
    data: { resources: declaration.modules![0]!.models.map(model => ({ ...model, fields: [...model.fields] })) } });
  assert.deepEqual(modules.data?.resources.map(resource => resource.recordPrint),
    direct.data?.resources.map(resource => resource.recordPrint));
});
