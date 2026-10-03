import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, defineOpenXiangdaApp, type OpenXiangdaAppDeclaration } from '../src/index.js';

const shared = 'app:field-app:business:manage';
const laterRead = 'app:field-app:data:z-records:read';
const implicit = 'app:field-app:records:private-read';
function declaration(): OpenXiangdaAppDeclaration {
  return {
    app: { code: 'field-app', name: 'Field references' }, frontend: { root: 'apps/web' },
    authz: { roles: [], capabilities: [{ code: shared, kind: 'backend', name: 'Business administration' }] },
    modules: [{ code: 'business', crud: [], models: [
      { code: 'a-records', name: 'First', fields: [
        { code: 'private_note', type: 'text.short', label: 'Private', access: { read: [shared], create: [shared], update: [shared] } },
        { code: 'related', type: 'text.short', label: 'Related', access: { read: [laterRead] } },
      ] },
      { code: 'z-records', name: 'Later', fields: [
        { code: 'private_note', type: 'text.short', label: 'Private', access: { read: [shared], create: [shared], update: [shared] } },
      ] },
    ] }],
  };
}
function native(config: any, contract: any) {
  const pairedContract = { ...contract, configDigest: sha256Digest(config) };
  return compileNativeApplicationConfiguration({
    appCode: 'field-app', configBytes: canonicalJson(config), contractBytes: canonicalJson(pairedContract),
    expectedConfigDigest: sha256Digest(config), expectedContractDigest: sha256Digest(pairedContract),
  });
}
const hasDiagnostic = (code: string) => (error: any) => error.diagnostics?.some((item: any) => item.code === code);

test('shared explicit and other-resource field references retain the actual owner in both compilers', () => {
  let firstDigest: string | undefined;
  for (const reverseSource of [false, true]) {
    const source = declaration();
    if (reverseSource) source.modules![0]!.models.reverse();
    const compiled = compileApplicationSources(defineOpenXiangdaApp(source));
    assert.deepEqual(compiled.contracts.value.capabilities.filter(item => item.code === shared), [
      { code: shared, kind: 'backend', name: 'Business administration', source: 'explicit' },
    ]);
    assert.deepEqual(compiled.contracts.value.capabilities.filter(item => item.code === laterRead), [
      { code: laterRead, kind: 'data', name: '读取Later', source: 'data' },
    ]);
    const resource = compiled.config.value.data.resources.find(item => item.code === 'a-records')!;
    assert.deepEqual(resource.fieldPolicies.private_note, { read: [shared], create: [shared], update: [shared] });
    firstDigest ??= compiled.contracts.digest;
    assert.equal(compiled.contracts.digest, firstDigest);
    for (const reverseNative of [false, true]) {
      const config = structuredClone(compiled.config.value);
      if (reverseNative) config.data.resources.reverse();
      assert.equal(native(config, compiled.contracts.value).appCode, 'field-app');
    }
  }
});

test('field reuse never relaxes an actual explicit/CRUD catalog collision', () => {
  const source = declaration();
  source.authz!.capabilities!.push({ code: laterRead, kind: 'ui', name: 'Conflict' });
  assert.throws(() => defineOpenXiangdaApp(source), hasDiagnostic('APP_CONFIG_CAPABILITY_OWNER_CONFLICT'));
  const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration()));
  const config = structuredClone(compiled.config.value);
  config.authz.capabilities.push({ code: laterRead, kind: 'ui', name: 'Conflict' });
  assert.throws(() => native(config, compiled.contracts.value), (error: any) => error.code === 'NATIVE_CAPABILITY_DUPLICATE');
});

test('implicit field capabilities retain their resource owner and cannot have two owners', () => {
  const source = declaration();
  source.modules![0]!.models[0]!.fields[0]!.access = { read: [implicit] };
  const compiled = compileApplicationSources(defineOpenXiangdaApp(source));
  assert.deepEqual(compiled.contracts.value.capabilities.filter(item => item.code === implicit), [
    { code: implicit, kind: 'data', name: 'First.private_note.read', source: 'data' },
  ]);
  assert.equal(native(compiled.config.value, compiled.contracts.value).appCode, 'field-app');
  source.modules![0]!.models[1]!.fields[0]!.access = { read: [implicit] };
  assert.throws(() => defineOpenXiangdaApp(source), hasDiagnostic('APP_CONFIG_CAPABILITY_OWNER_CONFLICT'));
  const config = structuredClone(compiled.config.value);
  config.data.resources[1]!.fieldPolicies.private_note!.read = [implicit];
  assert.throws(() => native(config, compiled.contracts.value), (error: any) => error.code === 'NATIVE_CAPABILITY_DUPLICATE');
});

test('business field references remain bounded to the application in authoring and Native compilation', () => {
  const source = declaration();
  source.modules![0]!.models[0]!.fields[0]!.access = { read: ['app:other-app:business:manage'] };
  assert.throws(() => defineOpenXiangdaApp(source), hasDiagnostic('APP_CONFIG_CAPABILITY_CLOSURE_FAILED'));
  const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration()));
  const config = structuredClone(compiled.config.value);
  config.data.resources[0]!.fieldPolicies.private_note!.read = ['app:other-app:business:manage'];
  assert.throws(() => native(config, compiled.contracts.value), (error: any) => error.code === 'NATIVE_CAPABILITY_APP_MISMATCH' &&
    error.pointer === '/config/data/resources/0/fieldPolicies/private_note/read');
});
