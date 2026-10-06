import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalJson, sha256Digest, contractSchemas } from 'openxiangda-contracts';
import * as esm from 'openxiangda-contracts/native-compiler';
import { assertRequiredCapabilitiesAvailable } from '../src/deployment.js';
import type { PlatformCapabilities } from 'openxiangda-contracts';
import { compileApplicationSources, defineOpenXiangdaApp, adminNavigationGroup, adminResourcePage, defineAdminNavigation } from '../src/index.js';

const cjs = createRequire(import.meta.url)('openxiangda-contracts/native-compiler') as typeof esm;
function declaration() {
  const resources = Array.from({ length: 128 }, (_, i) => ({ code: `records-${i}`, name: `Records ${i}`, dataPolicyCode: `owner-${i}`,
    fields: [{ code: 'name', type: 'text.short' as const, required: true, label: 'Name' }] }));
  const definitions = Array.from({ length: 103 }, (_, i) => ({ version: 1, launch: { mode: 'work-center-only' as const }, definition: {
    schemaVersion: 'openxiangda.workflow-definition/v2' as const, code: `process-${i}`, title: `Process ${i}`, acceptedCommandDeactivationPolicy: 'finish-pinned' as const,
    subject: { resourceCode: `records-${i}`, factProjection: { name: 'name' } }, startAt: 'done',
    inputSchema: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string' } } },
    nodes: { done: { id: 'done', kind: 'end' as const, title: 'Done', outcome: 'approved' } },
  } }));
  return defineOpenXiangdaApp({ app: { code: 'bounded-declarations', name: 'Bounded declarations' },
    frontend: { root: 'apps/web', admin: { navigation: defineAdminNavigation([adminNavigationGroup('records', 'Records', resources.map(r => adminResourcePage(r.code)))]) } },
    data: { resources }, authz: { capabilities: [], roles: Array.from({ length: 101 }, (_, i) => ({ code: `reader-${i}`, name: `Reader ${i}`,
      capabilities: i === 0 ? resources.map(r => `app:bounded-declarations:data:${r.code}:read`) : [] })),
    dataPolicies: resources.map((r, i) => ({ code: `owner-${i}`, name: `Owner ${i}`, resourceCode: r.code, unrestrictedRoleCodes: ['reader-0'], matchMode: 'OR' as const,
      rules: [{ subject: 'current_user' as const, field: 'created_by', roleCodes: ['reader-0'] }] })) },
    workflows: { definitions, bindings: definitions.map(item => ({ version: 1, binding: { schemaVersion: 'openxiangda.workflow-binding/v2' as const, workflowCode: item.definition.code, bindings: {} } })),
      activations: definitions.map(item => ({ workflowCode: item.definition.code, definitionVersion: 1, bindingVersion: 1, acceptedCommandDeactivationPolicy: 'finish-pinned' as const })) },
  });
}
function input(config: any, contract: any) {
  contract.configDigest = sha256Digest(config);
  return { appCode: config.appCode, configBytes: canonicalJson(config), contractBytes: canonicalJson(contract), expectedConfigDigest: sha256Digest(config), expectedContractDigest: sha256Digest(contract) };
}
const corpus = JSON.parse(readFileSync(new URL('../../contracts/test/fixtures/configuration-compatibility-corpus.json', import.meta.url), 'utf8'));
test('small sealed corpus remains byte-identical and gains no large-application requirement', () => {
  for (const compiler of [esm, cjs]) {
    const result = compiler.compileNativeApplicationConfiguration(input(JSON.parse(corpus.configuration.canonical), JSON.parse(corpus.contract.canonical)));
    assert.deepEqual(result.requiredPlatformCapabilities, corpus.requiredPlatformCapabilities);
    assert.equal(result.requiredPlatformCapabilities.some(item => item.code === 'application.extended-declaration-capacity'), false);
  }
});
test('128 resources/row policies, 101 roles and 103 workflows compile equally in both formats and public schemas', () => {
  const sources = compileApplicationSources(declaration()), config = JSON.parse(sources.config.content), contract = JSON.parse(sources.contracts.content);
  const result = esm.compileNativeApplicationConfiguration(input(config, contract));
  assert.deepEqual(cjs.compileNativeApplicationConfiguration(input(config, contract)), result);
  assert.equal(result.projections.data.value.resources.length, 128);
  assert.equal(result.projections.authz.value.dataPolicies.length, 128);
  assert.equal(result.requiredPlatformCapabilities.find(item => item.code === 'application.extended-declaration-capacity')?.contractVersion, '1.0.0');
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  for (const schema of Object.values(contractSchemas)) ajv.addSchema(schema);
  for (const [name, value] of [['configurationBundle', config], ['contractBundle', contract]] as const) {
    const { $id: _id, ...schema } = contractSchemas[name];
    const validate = ajv.compile(schema);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
});
test('extended declaration support must be available at the exact contract before upload', () => {
  const sources = compileApplicationSources(declaration());
  const result = esm.compileNativeApplicationConfiguration(input(JSON.parse(sources.config.content), JSON.parse(sources.contracts.content)));
  const requirement = result.requiredPlatformCapabilities.filter(item => item.code === 'application.extended-declaration-capacity');
  assert.equal(requirement.length, 1);
  const features = (version?: string, status = 'available') => ({ features: version ? {
    'application.extended-declaration-capacity': { code: 'application.extended-declaration-capacity', status, contractVersion: version },
  } : {} }) as PlatformCapabilities;
  assert.doesNotThrow(() => assertRequiredCapabilitiesAvailable(features('1.0.0'), requirement));
  for (const target of [features(), features('0.9.0'), features('1.0.0', 'disabled')])
    assert.throws(() => assertRequiredCapabilitiesAvailable(target, requirement),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'OPENXIANGDA_REQUIRED_CAPABILITY_UNAVAILABLE');
});
test('exact declaration and contract limit+1 still fail at the bounded collection pointer', () => {
  const limits = esm.NATIVE_CONTRACT_CAPACITY_V2;
  for (const [path, max] of [['authz.roles', limits.roles], ['authz.dataPolicies', limits.dataPolicies], ['data.resources', limits.resources], ['workflows.definitions', limits.workflows], ['frontend.routes', limits.routes]] as const) {
    const config = JSON.parse(corpus.configuration.canonical), contract = JSON.parse(corpus.contract.canonical);
    const [section, key] = path.split('.'); config[section!][key!] = Array.from({ length: max + 1 }, () => ({}));
    for (const compiler of [esm, cjs]) assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)),
      (error: any) => error.code === 'NATIVE_ARRAY_LIMIT_EXCEEDED' && error.pointer === `/config/${section}/${key}`);
  }
  const config = JSON.parse(corpus.configuration.canonical), contract = JSON.parse(corpus.contract.canonical);
  contract.resources = Array.from({ length: limits.resources + 1 }, () => ({}));
  for (const compiler of [esm, cjs]) assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)),
    (error: any) => error.code === 'NATIVE_ARRAY_LIMIT_EXCEEDED' && error.pointer === '/contracts/resources');
});
test('large declarations retain global byte and JSON-node budgets and real policy validation', () => {
  for (const compiler of [esm, cjs]) {
    const config = JSON.parse(corpus.configuration.canonical), contract = JSON.parse(corpus.contract.canonical);
    config.extra = 'x'.repeat(4 * 1024 * 1024);
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)), /NATIVE_CONFIG_ARTIFACT_TOO_LARGE/);
    config.extra = Array.from({ length: 100_001 }, () => null);
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)), /NATIVE_ARTIFACT_NODE_LIMIT_EXCEEDED/);
  }
  const sources = compileApplicationSources(declaration()), config = JSON.parse(sources.config.content), contract = JSON.parse(sources.contracts.content);
  config.authz.dataPolicies[0].matchMode = 'unsafe';
  for (const compiler of [esm, cjs]) assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)), /NATIVE_DATA_POLICY_MATCH_MODE_INVALID/);
});
