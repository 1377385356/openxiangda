import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { canonicalJson, sha256Digest } from '../src/canonical.js';
import * as esm from '../dist/native-compiler/index.js';
import { workflowSourceReferences } from '../src/native-compiler/workflow-source-sync.js';
import type { WorkflowBindingEntry } from '../src/types.js';
import { workflowBindingSchema } from '../src/native-compiler/workflow-schema.js';
const cjs = createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof esm;
const corpus = JSON.parse(readFileSync(new URL('./fixtures/configuration-compatibility-corpus.json', import.meta.url), 'utf8'));
const entry: WorkflowBindingEntry = {
  provider: 'conditional',
  cases: [{ when: { op: 'literal', value: true }, assignee: { provider: 'app_role', roleCode: 'reviewer' } }],
  otherwise: { provider: 'fixed_users', users: ['member'] },
};
// Canonical types reject mixed/nested declarations, not only their JSON.
// @ts-expect-error standard fields cannot be attached to a conditional declaration
const mixed: WorkflowBindingEntry = { ...entry, roleCode: 'reviewer' };
const nested: WorkflowBindingEntry = { provider: 'conditional', cases: [],
  // @ts-expect-error otherwise must be a nonconditional leaf
  otherwise: entry };
void mixed; void nested;
function config(): any {
  const value = JSON.parse(corpus.configuration.canonical);
  value.workflows.bindings[0].binding.bindings.reviewer = structuredClone(entry);
  return value;
}
function input(config: any) {
  const configDigest = sha256Digest(config);
  const contract = JSON.parse(corpus.contract.canonical);
  contract.configDigest = configDigest;
  const contractBytes = canonicalJson(contract);
  return { appCode: corpus.appCode, configBytes: canonicalJson(config),
    contractBytes, expectedConfigDigest: configDigest, expectedContractDigest: sha256Digest(contract) };
}
const current = (value: any) => value.workflows.bindings[0].binding.bindings.reviewer;
const definition = (value: any) => value.workflows.definitions[0].definition;

test('canonical schemas preserve flat bindings and reject mixed fields and excluded leaves', () => {
  const Ajv = createRequire(new URL('../../devkit-core/package.json', import.meta.url))('ajv/dist/2020.js').default;
  const validate = new Ajv({ strict: false }).compile(workflowBindingSchema);
  const candidate = config().workflows.bindings[0].binding;
  assert.equal(validate(candidate), true);
  for (const change of [{ roleCode: 'reviewer' }, { routing: {} }, { cases: [] },
    { otherwise: { provider: 'conditional' } }, { otherwise: { provider: 'initiator_select', roleCode: 'reviewer' } }]) {
    assert.equal(validate({ ...candidate, bindings: { reviewer: { ...entry, ...change } } }), false);
  }
});

test('ESM and CJS derive conditional and all nested dependency requirements with full rule identity', () => {
  const value = config();
  current(value).cases[0].assignee = { provider: 'app_role', roleCodes: ['reviewer', 'legal'], selectedInputPath: 'people' };
  current(value).cases.push({ when: { op: 'literal', value: false }, assignee: {
    provider: 'supervisor_chain', from: 'initiator', until: { roleCode: 'director' } } });
  current(value).otherwise = { provider: 'app_role', roleCode: 'reviewer', routing: {
    policyCode: 'routing', title: 'Routing', strategy: 'replace_only', dimensions: {},
    sources: { finance: { title: 'Finance', provider: 'app_role', roleCode: 'finance' } },
  } };
  for (const impl of [esm, cjs]) {
    const requirements = impl.compileRequiredPlatformCapabilitiesV3(value);
    for (const code of ['workflow.conditional-assignment', 'workflow.role-union', 'workflow.role-input-selection', 'workflow.supervisor-chain', 'workflow.assignment-routing'])
      assert.equal(requirements.find(item => item.code === code)?.contractVersion, '1.0.0', code);
    const before = requirements.find(item => item.code === 'workflow.conditional-assignment')!.usageDigest;
    current(value).cases.reverse();
    assert.notEqual(impl.compileRequiredPlatformCapabilitiesV3(value).find(item => item.code === 'workflow.conditional-assignment')!.usageDigest, before);
    current(value).cases.reverse();
  }
});

test('source role references include unselected and otherwise leaves', () => {
  const value = config(); current(value).cases[0].assignee = { provider: 'app_role', roleCodes: ['reviewer', 'legal'] };
  current(value).otherwise = { provider: 'supervisor_chain', from: 'initiator', until: { roleCode: 'director' } };
  assert.deepEqual(workflowSourceReferences(definition(value), value.workflows.bindings[0].binding, sha256Digest).roles, ['director', 'legal', 'reviewer']);
});

test('target compilers reject invalid unselected leaves, facts and undeclared roles before contract closure', () => {
  for (const impl of [esm, cjs]) {
    for (const [change, expected] of [
      [(value: any) => { current(value).otherwise.users = []; }, 'WORKFLOW_CONDITIONAL_USERS_INVALID'],
      [(value: any) => { current(value).otherwise = { provider: 'app_role', roleCode: 'undeclared' }; }, 'WORKFLOW_CONDITIONAL_ROLE_UNDECLARED'],
      [(value: any) => { current(value).cases[0].when = { op: 'eq', left: { op: 'path', path: 'unknown' }, right: { op: 'literal', value: 1 } }; }, 'WORKFLOW_CONDITIONAL_FACT_UNAVAILABLE'],
      [(value: any) => { current(value).otherwise = { provider: 'supervisor_chain', from: 'initiator', until: 'top' }; }, 'WORKFLOW_SUPERVISOR_CHAIN_SEQUENCE_REQUIRED'],
      [(value: any) => { definition(value).nodes.review.emptyPolicy = 'skip'; }, 'WORKFLOW_APPROVAL_EMPTY_PROVIDER_UNSUPPORTED'],
    ] as const) {
      const value = config(); change(value);
      assert.throws(() => impl.compileNativeApplicationConfiguration(input(value)), new RegExp(expected));
    }
    // A valid conditional declaration reaches immutable generated-contract matching.
    const compiled = impl.compileNativeApplicationConfiguration(input(config()));
    assert.equal(compiled.requiredPlatformCapabilities.find(item => item.code === 'workflow.conditional-assignment')?.contractVersion, '1.0.0');
  }
});
