import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, defineOpenXiangdaApp, requiredPlatformCapabilities, type OpenXiangdaAppDeclaration } from '../src/index.js';

function declaration(): OpenXiangdaAppDeclaration {
  return { app: { code: 'lookup-app', name: 'Lookup contexts' }, frontend: { root: 'apps/web' }, modules: [{ code: 'business',
    models: [
      { code: 'areas', name: 'Areas', fields: [{ code: 'name', type: 'text.short', label: 'Name' }, { code: 'kind', type: 'text.short', label: 'Kind' }] },
      { code: 'visits', name: 'Visits', fields: [{ code: 'area', type: 'resource-ref.single', label: 'Area', source: {
        kind: 'resource', resourceCode: 'areas', labelField: 'name', filterWhere: [{ field: 'kind', operator: 'eq', value: 'building' }] } }] },
    ], crud: [{ model: 'visits', code: 'all', name: 'Visits', list: { columns: ['area'], filterFields: ['area'] }, form: { fields: ['area'] } }],
  }] };
}

test('source, surface and native compiler retain the read identity constraint and require the platform context contract', () => {
  const app = defineOpenXiangdaApp(declaration());
  const compiled = compileApplicationSources(app);
  const resource = compiled.config.value.data.resources.find(item => item.code === 'visits')!;
  assert.deepEqual(resource.schema.fields[0]!.source!.filterWhere, [{ field: 'kind', operator: 'eq', value: 'building' }]);
  assert.match(compiled.contracts.typescript, /"filterWhere"/);
  const native = compileNativeApplicationConfiguration({ appCode: 'lookup-app', configBytes: canonicalJson(compiled.config.value),
    contractBytes: canonicalJson(compiled.contracts.value), expectedConfigDigest: compiled.config.digest, expectedContractDigest: compiled.contracts.digest });
  for (const target of [requiredPlatformCapabilities(app), native.requiredPlatformCapabilities]) {
    assert.equal(target.find(item => item.code === 'data.field-source-contexts')?.contractVersion, '1.0.0');
  }
});

test('a missing filter identity field cannot pass application compilation', () => {
  const app = declaration();
  app.modules![0]!.models[1]!.fields[0]!.source!.filterWhere![0]!.field = 'missing';
  assert.throws(() => defineOpenXiangdaApp(app), (error: any) => error.diagnostics?.some((item: any) => item.code === 'APP_CONFIG_DATA_RESOURCE_SOURCE_FILTER_FIELD_NOT_FOUND'));
});
