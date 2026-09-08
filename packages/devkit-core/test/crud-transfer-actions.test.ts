import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest, validateDataResource } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, type OpenXiangdaAppDeclaration } from '../src/index.js';

function declaration(actions: unknown, mode: 'default' | 'named' | 'direct'): OpenXiangdaAppDeclaration {
  const model = { code: 'records', name: 'Records', fields: [{code: 'title', label: 'Title', type: 'text.short' as const}] };
  const list = actions === undefined ? {} : {actions: actions as any};
  return {
    app: {code: 'transfer-app', name: 'Transfer'}, frontend: {root: 'apps/web'},
    ...(mode === 'direct' ? {data: {resources: [{...model, list}]}} : {
      modules: [{code: 'records', models: [model], crud: [{
        model: 'records', ...(mode === 'named' ? {code: 'quick', name: 'Quick'} : {}),
        list: {model: 'records', ...list},
      }]}],
    }),
  };
}

for (const mode of ['default', 'named', 'direct'] as const) {
  test(`${mode} CRUD flags survive canonical compilation and platform validation`, () => {
    for (const actions of [undefined, {}, {import: false, export: false}, {import: true}, {export: true}]) {
      const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration(actions, mode)));
      const resource = compiled.config.value.data.resources[0]!;
      const list = mode === 'named' ? resource.surface!.views![0]!.list : resource.surface!.list!;
      assert.deepEqual(list.actions, actions);
      assert.deepEqual(validateDataResource(resource), []);
      assert.equal(compileNativeApplicationConfiguration({
        appCode: 'transfer-app', configBytes: canonicalJson(compiled.config.value),
        contractBytes: canonicalJson(compiled.contracts.value),
        expectedConfigDigest: compiled.config.digest, expectedContractDigest: compiled.contracts.digest,
      }).appCode, 'transfer-app');
    }
  });

  test(`${mode} invalid flags fail at authoring and platform boundaries`, () => {
    for (const actions of [null, [], false, {import: 'false'}, {export: 0}, {download: false}]) {
      assert.throws(() => defineOpenXiangdaApp(declaration(actions, mode)));
      const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration(undefined, mode)));
      const config = structuredClone(compiled.config.value);
      const resource = config.data.resources[0]!;
      const list = mode === 'named' ? resource.surface!.views![0]!.list : resource.surface!.list!;
      (list as any).actions = actions;
      assert.ok(validateDataResource(resource).length);
      const contract = {...compiled.contracts.value, configDigest: sha256Digest(config)};
      assert.throws(() => compileNativeApplicationConfiguration({
        appCode: 'transfer-app', configBytes: canonicalJson(config), contractBytes: canonicalJson(contract),
        expectedConfigDigest: sha256Digest(config), expectedContractDigest: sha256Digest(contract),
      }));
    }
  });
}
