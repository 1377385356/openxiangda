import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest, validateDataResource, dataResourceSchema } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities, type OpenXiangdaAppDeclaration } from '../src/index.js';

const read = 'app:comment-app:comments:read';
const create = 'app:comment-app:comments:create';
function source(policy?: { read: boolean | string[]; create: boolean | string[] }): OpenXiangdaAppDeclaration {
  return { app: { code: 'comment-app', name: 'Comments' }, frontend: { root: 'apps/web' },
    authz: { roles: [], capabilities: [{ code: read, kind: 'ui', name: '读评论' }, { code: create, kind: 'ui', name: '发评论' }] },
    modules: [{ code: 'comments', models: [{ code: 'requests', name: 'Requests', mutationOwner: 'action',
      fields: [{ code: 'name', type: 'text.short', label: '名称' }], ...(policy ? { recordComments: policy } : {}) }], crud: [] }] };
}
function compile(config: any, contract: any) {
  const value = { ...contract, configDigest: sha256Digest(config) };
  return compileNativeApplicationConfiguration({ appCode: 'comment-app', configBytes: canonicalJson(config),
    contractBytes: canonicalJson(value), expectedConfigDigest: sha256Digest(config), expectedContractDigest: sha256Digest(value) });
}
test('both compilers retain explicit independent comment policies and automatic capability', () => {
  for (const policy of [undefined, { read: true, create: false }, { read: false, create: true }, { read: [read], create: [create] }]) {
    const app = defineOpenXiangdaApp(source(policy)); const output = compileApplicationSources(app);
    const resource = output.config.value.data.resources[0]!;
    const expected = policy && Object.fromEntries(Object.entries(policy).map(([mode, value]) =>
      [mode, value === true ? [resource.capabilities.read] : value === false ? [] : value]));
    assert.deepEqual(resource.recordComments, expected);
    assert.deepEqual(validateDataResource(resource), []);
    assert.equal(compile(output.config.value, output.contracts.value).appCode, 'comment-app');
    assert.equal(requiredPlatformCapabilities(app).find(item => item.code === 'data.record-comments')?.contractVersion, policy ? '1.0.0' : undefined);
    assert.equal(resource.surface?.mutationOwner, 'action');
    assert.deepEqual(resource.schema.fields.map(field => field.code), ['name']);
    assert.ok(!policy || output.contracts.typescript.includes('recordComments'));
  }
});
test('authoring refuses malformed, partial, duplicate and overly large policies', () => {
  for (const policy of [null, [], {}, { read: true }, { read: true, create: [] }, { read: false, create: ['a', 'a'] },
    { read: true, create: 1 }, { read: true, create: true, delete: true }, { read: true, create: Array.from({ length: 21 }, (_, i) => `cap${i}`) }]) {
    const declaration = source() as any; declaration.modules[0].models[0].recordComments = policy;
    assert.throws(() => defineOpenXiangdaApp(declaration), (error: any) => error.diagnostics?.some(item => item.code === 'APP_CONFIG_RECORD_COMMENTS_POLICY_INVALID'));
  }
});
test('canonical validator and platform compiler refuse open policies and authoring shorthand', () => {
  const output = compileApplicationSources(defineOpenXiangdaApp(source({ read: false, create: false })));
  for (const policy of [{ read: true, create: [] }, { read: [], create: ['a', 'a'] }, { read: [], create: [] , delete: [] }, { create: [] }]) {
    const config = structuredClone(output.config.value) as any; config.data.resources[0].recordComments = policy;
    assert.ok(validateDataResource(config.data.resources[0]).length > 0);
    assert.throws(() => compile(config, output.contracts.value));
  }
  assert.equal((dataResourceSchema.properties as any).recordComments.additionalProperties, false);
});
test('unknown and cross-app capabilities fail independently for each comment operation', () => {
  const output = compileApplicationSources(defineOpenXiangdaApp(source({ read: false, create: false })));
  for (const mode of ['read', 'create']) for (const capability of ['app:other-app:comments:read', 'app:comment-app:missing:read']) {
    assert.throws(() => defineOpenXiangdaApp(source({ read: false, create: false, [mode]: [capability] })));
    const config = structuredClone(output.config.value) as any; config.data.resources[0].recordComments[mode] = [capability];
    assert.throws(() => compile(config, output.contracts.value), (error: any) => error.pointer.includes('recordComments'));
  }
});
test('model and direct resources share one canonical comment declaration', () => {
  const declaration = source({ read: [read], create: [create] });
  const model = declaration.modules![0]!.models[0]!;
  const direct = defineOpenXiangdaApp({ ...declaration, modules: undefined, data: { resources: [{ ...model, fields: [...model.fields] }] } });
  assert.deepEqual(direct.data?.resources[0]?.recordComments, defineOpenXiangdaApp(declaration).data?.resources[0]?.recordComments);
});
