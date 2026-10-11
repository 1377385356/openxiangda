import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalJson, sha256Digest } from '../src/canonical.js';
import { compileNativeApplicationConfiguration } from '../dist/native-compiler/index.js';
import { validateWorkflowHandlingNodes } from '../src/native-compiler/workflow-handle.js';
import { validateWorkflowDesignerCapabilities } from '../src/native-compiler/workflow-designer.js';
import { projectWorkflowGraph } from '../src/native-compiler/workflow-graph.js';

function fixture() {
  const corpus = JSON.parse(readFileSync(new URL('./fixtures/configuration-compatibility-corpus.json', import.meta.url), 'utf8'));
  const config = JSON.parse(corpus.configuration.canonical);
  const definition = config.workflows.definitions[0].definition;
  const approval = definition.nodes.review;
  const work = { id: approval.id, kind: 'handle', title: '资料办理', binding: approval.binding, mode: 'all', next: approval.onApprove, allowedOperations: ['complete'], requiredOperations: ['complete'] };
  definition.nodes.review = work;
  delete definition.nodes.rejected;
  const binding = config.workflows.bindings[0].binding;
  const input = () => {
    const contract = { ...JSON.parse(corpus.contract.canonical), configDigest: sha256Digest(config) };
    contract.workflows[0].allowedOperations = ['complete'];
    return { appCode: corpus.appCode, configBytes: canonicalJson(config), expectedConfigDigest: sha256Digest(config), contractBytes: canonicalJson(contract), expectedContractDigest: sha256Digest(contract) };
  };
  return { config, definition, work, binding, input };
}
test('whole-install validation negotiates handling and projects its actual forward edge', () => {
  const { definition, work, input } = fixture();
  assert.equal(compileNativeApplicationConfiguration(input()).requiredPlatformCapabilities.find(cap => cap.code === 'workflow.handling-nodes')?.contractVersion, '1.0.0');
  assert.deepEqual(validateWorkflowHandlingNodes(definition), []);
  const graph = projectWorkflowGraph(definition, 'test');
  assert.ok(graph.edges.some(edge => edge.from === 'review' && edge.to === work.next && edge.label === '办理完成'));
});
test('handling refuses approval policies, noncompletion actions and unknown successors', () => {
  const { definition, work } = fixture();
  for (const change of [{ onReject: 'rejected' }, { emptyPolicy: 'skip' }, { completionDeadline: { afterSeconds: 1, action: 'approve' } }, { allowedOperations: ['approve'] }, { requiredOperations: [] }, { next: 'missing' }]) {
    const candidate = structuredClone(definition); candidate.nodes.review = { ...work, ...change };
    assert.ok(validateWorkflowHandlingNodes(candidate).length);
  }
});
test('canvas handling insertion requires a released template and retains completion minima', () => {
  const { definition, work, binding } = fixture();
  const next = structuredClone(definition); next.nodes.additional = { ...work, id: 'additional' }; next.startAt = 'additional'; next.nodes.additional.next = 'review';
  assert.deepEqual(validateWorkflowDesignerCapabilities(definition, next, binding, binding), []);
  next.nodes.additional.requiredOperations = [];
  assert.ok(validateWorkflowDesignerCapabilities(definition, next, binding, binding).some(error => error.includes('TEMPLATE_REQUIRED')));
  const approvalBase = structuredClone(definition); approvalBase.nodes.review = { ...work, kind: 'approval', onApprove: work.next, onReject: 'rejected', allowedOperations: ['approve'], requiredOperations: ['approve'] }; delete approvalBase.nodes.review.next; approvalBase.nodes.rejected = { id: 'rejected', kind: 'end', title: '拒绝', outcome: 'rejected' };
  assert.ok(validateWorkflowDesignerCapabilities(approvalBase, next, binding, binding).some(error => error.includes('TEMPLATE_REQUIRED')));
});
