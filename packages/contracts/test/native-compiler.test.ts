import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalJson, sha256Digest } from '../src/canonical.js';
import * as esm from '../dist/native-compiler/index.js';
const cjs = createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof esm;
const corpus = JSON.parse(readFileSync(new URL('./fixtures/configuration-compatibility-corpus.json', import.meta.url), 'utf8'));
function input(config = JSON.parse(corpus.configuration.canonical)) {
  return {
    appCode: corpus.appCode,
    configBytes: canonicalJson(config), contractBytes: corpus.contract.canonical,
    expectedConfigDigest: sha256Digest(config), expectedContractDigest: corpus.contract.digest,
  };
}

test('fixed task pages automatically require submission and private drafts in ESM and CJS', () => {
  const config = JSON.parse(corpus.configuration.canonical);
  const definition = config.workflows.definitions[0].definition;
  definition.taskPages = { fill: { title: '补填', fields: [{ code: 'name' }, { code: 'status' }] } };
  definition.nodes.review.taskPageCode = 'fill';
  const contract = { ...JSON.parse(corpus.contract.canonical), configDigest: sha256Digest(config) };
  const value = { ...input(config), contractBytes: canonicalJson(contract), expectedContractDigest: sha256Digest(contract) };
  for (const implementation of [esm, cjs]) {
    const capabilities = implementation.compileNativeApplicationConfiguration(value).requiredPlatformCapabilities;
    for (const code of ['workflow.task-page-submit', 'workflow.task-private-drafts'])
      assert.equal(capabilities.find(item => item.code === code)?.contractVersion, '1.0.0');
  }
});

test('approval empty policy is negotiated and unsupported sources fail in both compiler distributions', () => {
  const config = JSON.parse(corpus.configuration.canonical);
  const definition = config.workflows.definitions[0].definition;
  definition.nodes.review.emptyPolicy = 'skip';
  const compileInput = () => {
    const contract = { ...JSON.parse(corpus.contract.canonical), configDigest: sha256Digest(config) };
    const eventType = 'openxiangda.workflow.node.skipped.v2';
    contract.eventProducers.push({ code: `workflow:${eventType}`, source: 'workflow', eventType, dataSchemaVersion: '2.0.0' });
    contract.eventProducers.sort((a: any, b: any) => `${a.source}:${a.code}:${a.eventType}`.localeCompare(`${b.source}:${b.code}:${b.eventType}`));
    contract.eventTypes.push(eventType);
    contract.eventTypes.sort();
    return { ...input(config), contractBytes: canonicalJson(contract), expectedContractDigest: sha256Digest(contract) };
  };
  for (const implementation of [esm, cjs]) {
    assert.equal(implementation.compileNativeApplicationConfiguration(compileInput()).requiredPlatformCapabilities.find(item => item.code === 'workflow.approval-empty-policy')?.contractVersion, '1.0.0');
  }
  const binding = config.workflows.bindings.find((entry: any) => entry.binding.workflowCode === definition.code).binding;
  binding.bindings[definition.nodes.review.binding] = { provider: 'fixed_users', users: [] };
  for (const implementation of [esm, cjs]) {
    assert.ok(implementation.compileNativeApplicationConfiguration(compileInput()));
  }
  binding.bindings[definition.nodes.review.binding].provider = 'previous_node_actor';
  for (const implementation of [esm, cjs])
    assert.throws(() => implementation.compileNativeApplicationConfiguration(compileInput()), /WORKFLOW_APPROVAL_EMPTY_PROVIDER_UNSUPPORTED/);
});

test('automatic cc capability is derived from declarations in both shared compiler distributions', () => {
  const config = JSON.parse(corpus.configuration.canonical);
  const definition = config.workflows.definitions[0].definition;
  const binding = config.workflows.bindings.find((entry: any) => entry.binding.workflowCode === definition.code).binding;
  definition.nodes.copy = { id: 'copy', kind: 'cc', title: '抄送', binding: 'ccReaders', next: definition.startAt, emptyPolicy: 'block' };
  definition.startAt = 'copy';
  binding.bindings.ccReaders = { provider: 'app_role', roleCode: 'reviewer', max: 20 };
  const contract = { ...JSON.parse(corpus.contract.canonical), configDigest: sha256Digest(config) };
  const value = { ...input(config), contractBytes: canonicalJson(contract), expectedContractDigest: sha256Digest(contract) };
  for (const implementation of [esm, cjs]) {
    const result = implementation.compileNativeApplicationConfiguration(value);
    assert.equal(result.requiredPlatformCapabilities.find(item => item.code === 'workflow.automatic-cc')?.contractVersion, '1.0.0');
  }
});

test('editable rich task fields require their capability; readonly fields do not enable uploads', () => {
  for (const type of ['signature', 'text.rich']) {
    for (const readonly of [false, true]) {
      const config = JSON.parse(corpus.configuration.canonical);
      const definition = config.workflows.definitions[0].definition;
      const resource = config.data.resources.find((item: any) => item.code === definition.subject.resourceCode);
      resource.schema.fields.push({ code: 'richEvidence', type, nullable: true });
      resource.surface.fields.richEvidence = { ...resource.surface.fields.name, type, label: '补充材料',
        widget: type === 'signature' ? 'signature' : 'rich-text', requiredHint: false, searchable: false, sortable: false, list: false };
      definition.taskPages = { fill: { title: '办理', fields: [{ code: 'richEvidence', readonly }] } };
      definition.nodes.review.taskPageCode = 'fill';
      for (const implementation of [esm, cjs]) {
        const capabilities = implementation.compileRequiredPlatformCapabilitiesV3(config);
        for (const code of ['workflow.task-managed-files', 'workflow.task-rich-fields'])
          assert.equal(capabilities.some(item => item.code === code && item.contractVersion === '1.0.0'), !readonly);
      }
    }
  }
});

test('editable owned files require the complete upload capability closure in both distributions', () => {
  for (const type of ['file', 'image', 'signature', 'text.rich']) for (const readonly of ['none', 'parent', 'child']) {
    const config = JSON.parse(corpus.configuration.canonical);
    const definition = config.workflows.definitions[0].definition;
    const resource = config.data.resources.find((item: any) => item.code === definition.subject.resourceCode);
    resource.schema.fields.push({ code: 'items', type: 'subtable', subtable: { resourceCode: 'items' } });
    config.data.resources.push({ code: 'items', schema: { fields: [{ code: 'proof', type }] } });
    definition.taskPages = { fill: { title: '材料', fields: [{ code: 'items', readonly: readonly === 'parent',
      subtable: { fields: [{ code: 'proof', readonly: readonly === 'child' }] } }] } };
    for (const implementation of [esm, cjs]) {
      const codes = implementation.compileRequiredPlatformCapabilitiesV3(config).map(item => item.code);
      assert.equal(codes.includes('workflow.task-owned-files'), readonly === 'none');
      assert.equal(codes.includes('workflow.task-managed-files'), readonly === 'none');
      assert.equal(codes.includes('workflow.task-rich-fields'), readonly === 'none' && ['signature', 'text.rich'].includes(type));
    }
  }
});

test('routing declarations automatically require the platform capability and invalid policies fail in both compiler distributions', () => {
  const configuration = JSON.parse(corpus.configuration.canonical);
  const binding = configuration.workflows.bindings[0].binding.bindings.reviewer;
  binding.routing = { policyCode: 'record-review', title: '记录审核规则', strategy: 'replace_then_append',
    dimensions: { name: { title: '记录名称', valueFrom: 'name' } },
    sources: { extra: { title: '补充审核角色', provider: 'app_role', roleCode: 'reviewer' } } };
  const routingInput = (config: typeof configuration) => {
    const contract = { ...JSON.parse(corpus.contract.canonical), configDigest: sha256Digest(config) };
    return { ...input(config), contractBytes: canonicalJson(contract), expectedContractDigest: sha256Digest(contract) };
  };
  for (const implementation of [esm, cjs]) {
    const result = implementation.compileNativeApplicationConfiguration(routingInput(configuration));
    assert.ok(result.requiredPlatformCapabilities.some(item => item.code === 'workflow.assignment-routing' && item.contractVersion === '1.0.0'));
    const invalid = structuredClone(configuration);
    invalid.workflows.bindings[0].binding.bindings.reviewer.routing.dimensions.name.valueFrom = '__proto__.name';
    assert.throws(() => implementation.compileNativeApplicationConfiguration(routingInput(invalid)), /ROUTING/);
  }
});

test('conditional text invariant accepts only declared option values and text fields', () => {
  const fields = [
    { code: 'status', type: 'option.single', options: [{ label: '生效', value: 'effective' }] },
    { code: 'templateContent', type: 'text.long' },
  ] as Parameters<typeof esm.parseNativeDataResourceInvariantsV2>[1];
  const declaration = [{
    code: 'effective-template-has-content',
    expression: {
      kind: 'nonBlankTextWhenOption',
      optionField: 'status',
      optionValue: 'effective',
      textField: 'templateContent',
    },
  }];
  for (const implementation of [esm, cjs]) {
    assert.deepEqual(
      implementation.parseNativeDataResourceInvariantsV2(declaration, fields, '/invariants'),
      declaration
    );
    assert.throws(
      () => implementation.parseNativeDataResourceInvariantsV2(
        [{ ...declaration[0], expression: { ...declaration[0]!.expression, optionValue: 'undeclared' } }],
        fields,
        '/invariants'
      ),
      (error: Error & { code?: string }) =>
        error.code === 'NATIVE_DATA_RESOURCE_INVARIANT_FIELD_TYPES_INVALID'
    );
  }
});

test('one shared validator preserves the reviewed platform projection across ESM and CJS', () => {
  const expected = 'df2836af06f119b343bb7207633e51686d18e19ee7edcf1d7a19a3936142fc00';
  const a = esm.compileNativeApplicationConfiguration(input());
  const b = cjs.compileNativeApplicationConfiguration(input());
  assert.deepEqual(a, b);
  assert.equal(a.aggregateDigest, expected);
  assert.equal(a.projections.data.value.resources.length, corpus.counts.resources);
  assert.equal(a.projections.events.value.producers.length, corpus.counts.eventProducers);
  assert.deepEqual(a.requiredPlatformCapabilities, corpus.requiredPlatformCapabilities);
  assert.equal(a.requiredPlatformCapabilities.find(item => item.code === 'business-process.durable-command')?.contractVersion, '1.1.0');
  assert.match(esm.NATIVE_CONFIGURATION_VALIDATOR_DIGEST, /^[a-f0-9]{64}$/);
  assert.equal(esm.NATIVE_CONFIGURATION_VALIDATOR_DIGEST, cjs.NATIVE_CONFIGURATION_VALIDATOR_DIGEST);
});

test('both distributions preserve rejection codes and pointers without database or network setup', () => {
  const config = JSON.parse(corpus.configuration.canonical);
  const cases = [
    { ...input(), expectedConfigDigest: '0'.repeat(64) },
    { ...input(), configBytes: '{invalid' },
    input({ ...config, unexpected: true }),
    input({ ...config, data: { ...config.data, resources: [{ ...config.data.resources[0], unknownField: 'invalid' }] } }),
  ];
  for (const value of cases) {
    const errors = [esm, cjs].map(implementation => {
      try { implementation.compileNativeApplicationConfiguration(value); assert.fail('invalid input accepted'); }
      catch (error) {
        assert.ok(error instanceof implementation.NativeConfigurationCompilerError);
        assert.match(error.code, /^NATIVE_/); assert.ok(error.pointer.startsWith('/'));
        return { code: error.code, pointer: error.pointer, identifiers: error.identifiers };
      }
    });
    assert.deepEqual(errors[0], errors[1]);
  }
});

test('rejects workflow identifiers that runtime normalization cannot accept', () => {
  const config = JSON.parse(corpus.configuration.canonical);
  config.workflows.definitions[0].definition.code = 'standard_record_approval';
  const invalid = input(config);
  const contract = JSON.parse(invalid.contractBytes);
  contract.configDigest = invalid.expectedConfigDigest;
  invalid.contractBytes = canonicalJson(contract);
  invalid.expectedContractDigest = sha256Digest(contract);
  assert.throws(
    () => esm.compileNativeApplicationConfiguration(invalid),
    error =>
      error instanceof esm.NativeConfigurationCompilerError &&
      error.code === 'NATIVE_WORKFLOW_CODE_INVALID',
  );
});

test('native ESM and server CJS enforce the same annotated variable sources', () => {
  const config = JSON.parse(corpus.configuration.canonical);
  const definition = config.workflows.definitions[0].definition;
  definition.readability = { variables: { missing: { label: '没有来源的变量' } } };
  const invalid = input(config);
  const contract = JSON.parse(invalid.contractBytes);
  contract.configDigest = invalid.expectedConfigDigest;
  invalid.contractBytes = canonicalJson(contract);
  invalid.expectedContractDigest = sha256Digest(contract);
  for (const implementation of [esm, cjs]) assert.throws(
    () => implementation.compileNativeApplicationConfiguration(invalid),
    error => error instanceof implementation.NativeConfigurationCompilerError &&
      error.code === 'WORKFLOW_VARIABLE_SOURCE_UNKNOWN:missing' && error.pointer.endsWith('/readability'),
  );
});
