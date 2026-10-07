import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalJson, sha256Digest, contractSchemas, workflowDefinitionSchema } from 'openxiangda-contracts';
import * as esm from 'openxiangda-contracts/native-compiler';
import { assertRequiredCapabilitiesAvailable } from '../src/deployment.js';
import type { PlatformCapabilities } from 'openxiangda-contracts';
import { compileApplicationSources, defineOpenXiangdaApp, adminNavigationGroup, adminResourcePage, defineAdminNavigation } from '../src/index.js';

const cjs = createRequire(import.meta.url)('openxiangda-contracts/native-compiler') as typeof esm;
function declaration(fieldCount = 1, label?: string, frontend: Partial<NonNullable<Parameters<typeof defineOpenXiangdaApp>[0]['frontend']>> = {}) {
  const resources = Array.from({ length: 128 }, (_, i) => ({ code: `records-${i}`, name: `Records ${i}`, dataPolicyCode: `owner-${i}`,
    fields: Array.from({ length: fieldCount }, (_, field) => ({ code: field ? `field_${field}` : 'name',
      type: 'text.short' as const, required: field === 0, label: label ?? (field ? `Field ${field}` : 'Name') })) }));
  const definitions = Array.from({ length: 103 }, (_, i) => ({ version: 1, launch: { mode: 'work-center-only' as const }, definition: {
    schemaVersion: 'openxiangda.workflow-definition/v2' as const, code: `process-${i}`, title: `Process ${i}`, acceptedCommandDeactivationPolicy: 'finish-pinned' as const,
    subject: { resourceCode: `records-${i}`, factProjection: { name: 'name' } }, startAt: 'done',
    inputSchema: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string' } } },
    nodes: { done: { id: 'done', kind: 'end' as const, title: 'Done', outcome: 'approved' } },
  } }));
  return defineOpenXiangdaApp({ app: { code: 'bounded-declarations', name: 'Bounded declarations' },
    frontend: { root: 'apps/web', admin: { navigation: defineAdminNavigation([adminNavigationGroup('records', 'Records', resources.map(r => adminResourcePage(r.code)))]) }, ...frontend },
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
function authenticatedDeclaration(routeCount: number) {
  return declaration(1, undefined, {
    routes: Array.from({ length: routeCount }, (_, i) => ({
      code: `view-${i}`, path: i === 1 ? '/m/home' : `/views/${i}`, label: `View ${i}`, surface: 'user' as const,
    })),
    authentication: {
      accountMode: 'existing-platform-users-only', registration: { mode: 'reject' },
      methods: [{ code: 'password', type: 'password', label: 'Password', presentation: 'primary', required: true }],
      surfaces: {
        desktop: { routeCode: 'login', path: '/login', defaultRouteCode: 'view-0' },
        mobile: { routeCode: 'login-mobile', path: '/m/login', defaultRouteCode: 'view-1' },
      },
    },
  });
}
test('authenticated large applications use the declared route capacity in ESM and CJS', () => {
  for (const routeCount of [501, esm.NATIVE_CONTRACT_CAPACITY_V2.routes]) {
    const sources = compileApplicationSources(authenticatedDeclaration(routeCount));
    const result = esm.compileNativeApplicationConfiguration(input(sources.config.value, sources.contracts.value));
    assert.deepEqual(cjs.compileNativeApplicationConfiguration(input(sources.config.value, sources.contracts.value)), result);
    assert.equal(sources.config.value.frontend.routes.length, routeCount);
    assert.equal(result.requiredPlatformCapabilities.find(item => item.code === 'application.extended-declaration-capacity')?.contractVersion, '1.0.0');
  }
});
test('large authenticated applications retain login validation and the exact route bound', () => {
  const sources = compileApplicationSources(authenticatedDeclaration(501));
  for (const compiler of [esm, cjs]) {
    for (const [defaultRouteCode, expectedCode] of [
      ['absent', 'NATIVE_APPLICATION_AUTH_DEFAULT_ROUTE_INVALID'],
      ['view-1', 'NATIVE_APPLICATION_AUTH_DEFAULT_ROUTE_INVALID'],
    ]) {
      const config = structuredClone(sources.config.value), contract = structuredClone(sources.contracts.value);
      config.frontend.authentication!.surfaces.desktop.defaultRouteCode = defaultRouteCode!;
      assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)),
        (error: any) => error.code === expectedCode && error.pointer === '/config/frontend/authentication/surfaces/desktop/defaultRouteCode');
    }
    const config = structuredClone(sources.config.value), contract = structuredClone(sources.contracts.value);
    config.frontend.authentication!.surfaces.desktop.routeCode = 'view-0';
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)),
      (error: any) => error.code === 'NATIVE_APPLICATION_AUTH_SURFACE_CODE_CONFLICT' && error.pointer === '/config/frontend/authentication/surfaces/desktop/routeCode');
    config.frontend.routes = Array.from({ length: compiler.NATIVE_CONTRACT_CAPACITY_V2.routes + 1 }, () => ({})) as any;
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)),
      (error: any) => error.code === 'NATIVE_ARRAY_LIMIT_EXCEEDED' && error.pointer === '/config/frontend/routes');
  }
});
test('public workflow definition schema accepts the same 200-field task boundary as the compiler', () => {
  const definition = compileApplicationSources(declaration()).config.value.workflows.definitions[0]!.definition;
  definition.taskPages = { budget: { title: '完整预算', fields: Array.from({ length: 200 }, (_, i) => ({ code: `value${i}` })) } };
  const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(workflowDefinitionSchema);
  assert.equal(validate(definition), true, JSON.stringify(validate.errors));
  definition.taskPages.budget!.fields.push({ code: 'overflow' });
  assert.equal(validate(definition), false);
  assert.ok(validate.errors?.some(error => error.instancePath === '/taskPages/budget/fields' && error.keyword === 'maxItems'));
});
test('small sealed corpus remains byte-identical and gains no large-application requirement', () => {
  for (const compiler of [esm, cjs]) {
    const result = compiler.compileNativeApplicationConfiguration(input(JSON.parse(corpus.configuration.canonical), JSON.parse(corpus.contract.canonical)));
    assert.deepEqual(result.requiredPlatformCapabilities, corpus.requiredPlatformCapabilities);
    assert.equal(result.requiredPlatformCapabilities.some(item => item.code === 'application.extended-declaration-capacity'), false);
    assert.equal(result.requiredPlatformCapabilities.some(item => item.code === 'application.extended-artifact-capacity'), false);
    assert.equal(result.requiredPlatformCapabilities.some(item => item.code === 'application.extended-configuration-bytes'), false);
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
    config.extra = 'x'.repeat(esm.NATIVE_ARTIFACT_CAPACITY_V2.configBytes);
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)), /NATIVE_CONFIG_ARTIFACT_TOO_LARGE/);
    config.extra = Array.from({ length: esm.NATIVE_ARTIFACT_CAPACITY_V2.extendedNodes + 1 }, () => null);
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)), /NATIVE_ARTIFACT_NODE_LIMIT_EXCEEDED/);
  }
  const sources = compileApplicationSources(declaration()), config = JSON.parse(sources.config.content), contract = JSON.parse(sources.contracts.content);
  config.authz.dataPolicies[0].matchMode = 'unsafe';
  for (const compiler of [esm, cjs]) assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)), /NATIVE_DATA_POLICY_MATCH_MODE_INVALID/);
});

test('canonical configuration bytes negotiate an independent capability in both compiler formats', () => {
  const app = declaration(32, '文'.repeat(350));
  const sources = compileApplicationSources(app);
  assert.ok(sources.config.artifact.size > esm.NATIVE_ARTIFACT_CAPACITY_V2.legacyConfigBytes);
  assert.ok(sources.config.artifact.size < esm.NATIVE_ARTIFACT_CAPACITY_V2.configBytes);
  const result = esm.compileNativeApplicationConfiguration(input(sources.config.value, sources.contracts.value));
  assert.deepEqual(cjs.compileNativeApplicationConfiguration(input(sources.config.value, sources.contracts.value)), result);
  const requirement = result.requiredPlatformCapabilities.filter(item => item.code === 'application.extended-configuration-bytes');
  assert.equal(requirement.length, 1);
  assert.equal(requirement[0]!.contractVersion, '1.0.0');
  assert.ok(sources.config.value.runtime.protocolCapabilities.includes('application.extended-configuration-bytes'));
  const features = (status?: string, contractVersion = '1.0.0') => ({ features: status ? {
    'application.extended-configuration-bytes': { status, contractVersion },
  } : {} }) as PlatformCapabilities;
  assert.doesNotThrow(() => assertRequiredCapabilitiesAvailable(features('available'), requirement));
  for (const target of [features(), features('disabled'), features('available', '0.9.0')]) {
    assert.throws(() => assertRequiredCapabilitiesAvailable(target, requirement),
      (error: any) => error.code === 'OPENXIANGDA_REQUIRED_CAPABILITY_UNAVAILABLE');
  }
});

test('UTF-8 configuration boundary is inclusive and does not expand single-string or contract budgets', () => {
  const base = { padding: '' };
  const overhead = Buffer.byteLength(canonicalJson(base));
  for (const compiler of [esm, cjs]) {
    base.padding = '文'.repeat(Math.floor((compiler.NATIVE_ARTIFACT_CAPACITY_V2.legacyConfigBytes - overhead) / 3));
    base.padding += 'a'.repeat(compiler.NATIVE_ARTIFACT_CAPACITY_V2.legacyConfigBytes - Buffer.byteLength(canonicalJson(base)));
    assert.equal(compiler.requiresExtendedConfigurationBytes(base), false);
    base.padding += 'a';
    assert.equal(compiler.requiresExtendedConfigurationBytes(base), true);
    const config = JSON.parse(corpus.configuration.canonical), contract = JSON.parse(corpus.contract.canonical);
    config.extra = Array.from({ length: 7 }, () => 'a'.repeat(compiler.NATIVE_ARTIFACT_CAPACITY_V2.stringBytes));
    config.extra.push('');
    config.extra[7] = 'a'.repeat(compiler.NATIVE_ARTIFACT_CAPACITY_V2.configBytes - Buffer.byteLength(canonicalJson(config)));
    assert.equal(Buffer.byteLength(canonicalJson(config)), compiler.NATIVE_ARTIFACT_CAPACITY_V2.configBytes);
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)),
      (error: any) => !['NATIVE_CONFIG_ARTIFACT_TOO_LARGE', 'NATIVE_ARTIFACT_STRING_LIMIT_EXCEEDED'].includes(error.code));
    config.extra[7] += 'a';
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)),
      (error: any) => error.code === 'NATIVE_CONFIG_ARTIFACT_TOO_LARGE' && error.pointer === '/configBytes');
  }
  assert.equal(esm.NATIVE_ARTIFACT_CAPACITY_V2.contractBytes, 8 * 1024 * 1024);
});

test('a complete large field/workflow closure negotiates artifact capacity identically in ESM and CJS', () => {
  const sources = compileApplicationSources(declaration(48));
  const config = JSON.parse(sources.config.content), contract = JSON.parse(sources.contracts.content);
  assert.equal(esm.requiresExtendedArtifactCapacity(config), true);
  const result = esm.compileNativeApplicationConfiguration(input(config, contract));
  assert.deepEqual(cjs.compileNativeApplicationConfiguration(input(config, contract)), result);
  const requirement = result.requiredPlatformCapabilities.filter(item => item.code === 'application.extended-artifact-capacity');
  assert.equal(requirement.length, 1);
  assert.equal(requirement[0]!.contractVersion, '1.0.0');
  assert.equal(config.runtime.protocolCapabilities.includes('application.extended-artifact-capacity'), true);
  const features = (status?: string) => ({ features: status ? {
    'application.extended-artifact-capacity': { status, contractVersion: '1.0.0' },
  } : {} }) as PlatformCapabilities;
  assert.doesNotThrow(() => assertRequiredCapabilitiesAvailable(features('available'), requirement));
  for (const target of [features(), features('disabled')]) assert.throws(
    () => assertRequiredCapabilitiesAvailable(target, requirement),
    (error: any) => error.code === 'OPENXIANGDA_REQUIRED_CAPABILITY_UNAVAILABLE');
});

test('artifact extension retains precise global limits and cannot be asserted by a contract', () => {
  const count = (value: unknown): number => 1 + (value && typeof value === 'object'
    ? Object.values(value).reduce<number>((sum, child) => sum + count(child), 0) : 0);
  for (const compiler of [esm, cjs]) {
    const config = JSON.parse(corpus.configuration.canonical), contract = JSON.parse(corpus.contract.canonical);
    const maximum = compiler.NATIVE_ARTIFACT_CAPACITY_V2.extendedNodes;
    config.extra = [];
    config.extra = Array.from({ length: maximum - count(config) }, () => null);
    // At the exact global budget the unrelated extra key reaches semantic
    // validation, rather than failing budget inspection.
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)),
      (error: any) => error.code !== 'NATIVE_ARTIFACT_NODE_LIMIT_EXCEEDED');
    config.extra.push(null);
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)),
      (error: any) => error.code === 'NATIVE_ARTIFACT_NODE_LIMIT_EXCEEDED' && error.pointer.startsWith('/config/'));
    delete config.extra;
    contract.extra = Array.from({ length: compiler.NATIVE_ARTIFACT_CAPACITY_V2.legacyNodes }, () => null);
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)),
      (error: any) => error.code === 'NATIVE_ARTIFACT_NODE_LIMIT_EXCEEDED' && error.pointer.startsWith('/contracts/'));
    delete contract.extra;
    config.extra = 'x'.repeat(compiler.NATIVE_ARTIFACT_CAPACITY_V2.stringBytes + 1);
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)), /NATIVE_ARTIFACT_STRING_LIMIT_EXCEEDED/);
    config.extra = Array.from({ length: compiler.NATIVE_ARTIFACT_CAPACITY_V2.depth + 1 }).reduce(value => ({ child: value }), null);
    assert.throws(() => compiler.compileNativeApplicationConfiguration(input(config, contract)), /NATIVE_ARTIFACT_DEPTH_LIMIT_EXCEEDED/);
  }
});
