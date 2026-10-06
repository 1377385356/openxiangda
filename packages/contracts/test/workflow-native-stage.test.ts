import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalJson, sha256Digest } from '../src/canonical.js';
import { assertWorkflowNativeStageGuard, assertWorkflowNativeStagePolicy, assertWorkflowNativeStageSourceGuard } from '../src/native-compiler/workflow-native-stage.js';
import * as esm from '../dist/native-compiler/index.js';
const cjs = createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof esm;
const id = '11111111-1111-4111-8111-111111111111';
const policy = { workflowCode: 'approval', resourceCode: 'requests', actor: 'initiator' as const, runningNodeIds: ['confirm'], allowedStatuses: ['approved' as const] };
const guard = { instanceId: id, subjectRecordId: id, expectedInstanceSequence: 3 };
const source: any = { kind: 'record-match', resourceCode: 'requests', id, assertions: [{ kind: 'value', field: 'revision', operator: 'eq', value: 2 }] };
test('a stage precondition cannot choose its policy or replace source visibility and revision checks', () => {
  assertWorkflowNativeStagePolicy(policy); assertWorkflowNativeStageGuard(guard);
  assertWorkflowNativeStageSourceGuard(policy, guard, [source]);
  for (const bad of [{ ...policy, runningNodeIds: [], allowedStatuses: [] }, { ...policy, runningNodeIds: ['confirm', 'confirm'] },
    { ...policy, actor: 'admin' }, { ...policy, allowedStatuses: ['running'] }, { ...policy, sql: 'select 1' }])
    assert.throws(() => assertWorkflowNativeStagePolicy(bad));
  for (const bad of [{ ...guard, expectedInstanceSequence: -1 }, { ...guard, instanceId: 'foreign' }, { ...guard, nodeId: 'chosen' }])
    assert.throws(() => assertWorkflowNativeStageGuard(bad));
  for (const bad of [undefined, [], [{ ...source, resourceCode: 'foreign' }], [{ ...source, id: '22222222-2222-4222-8222-222222222222' }],
    [{ ...source, assertions: [] }], [{ ...source, assertions: [{ ...source.assertions[0], operator: 'gte' }] }]])
    assert.throws(() => assertWorkflowNativeStageSourceGuard(policy, guard, bad), /SOURCE_GUARD_REQUIRED/);
});
test('ESM and CJS preserve the sealed policy, negotiate it only on opt-in and reject wrong references', () => {
  const corpus = JSON.parse(readFileSync(new URL('./fixtures/configuration-compatibility-corpus.json', import.meta.url), 'utf8'));
  const config = JSON.parse(corpus.configuration.canonical), contract = JSON.parse(corpus.contract.canonical);
  const definition = config.workflows.definitions[0].definition;
  const access = config.backend.operations[0].platformAccess;
  const stage = { ...policy, workflowCode: definition.code, resourceCode: definition.subject.resourceCode, runningNodeIds: [definition.startAt] };
  function input() {
    contract.configDigest = sha256Digest(config); contract.operations[0].platformAccess = access;
    return { appCode: corpus.appCode, configBytes: canonicalJson(config), contractBytes: canonicalJson(contract),
      expectedConfigDigest: sha256Digest(config), expectedContractDigest: sha256Digest(contract) };
  }
  for (const compiler of [esm, cjs]) assert.equal(compiler.compileNativeApplicationConfiguration(input()).requiredPlatformCapabilities.some(c => c.code === 'workflow.native-stage-guard'), false);
  access.dataCommands = { mode: 'recoverable-native' }; access.workflow = { codes: [definition.code] }; access.workflowStage = stage;
  for (const compiler of [esm, cjs]) assert.equal(compiler.compileNativeApplicationConfiguration(input()).requiredPlatformCapabilities.find(c => c.code === 'workflow.native-stage-guard')?.contractVersion, '1.0.0');
  for (const patch of [{ runningNodeIds: ['missing'] }, { workflowCode: 'foreign' }, { resourceCode: 'records-02' }]) {
    access.workflowStage = { ...stage, ...patch };
    for (const compiler of [esm, cjs]) assert.throws(() => compiler.compileNativeApplicationConfiguration(input()));
  }
  access.workflowStage = stage; delete access.dataCommands;
  for (const compiler of [esm, cjs]) assert.throws(() => compiler.compileNativeApplicationConfiguration(input()));
});
