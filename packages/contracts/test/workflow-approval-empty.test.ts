import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateWorkflowApprovalEmptyPolicy, workflowApprovalCanSkip, workflowBindingAllowsEmptyUsers } from '../src/native-compiler/workflow-approval-empty.js';
import { validateWorkflowNodeConfigurationPatch } from '../src/native-compiler/workflow-node-administration.js';
import { projectWorkflowGraph } from '../src/native-compiler/workflow-graph.js';

const node = { id: 'review', title: 'Review', kind: 'approval', binding: 'reviewers', mode: 'all', emptyPolicy: 'skip', onApprove: 'end', onReject: 'end' } as const;
const resolution = { provider: 'app_role', emptyResult: 'no_candidates', candidates: [], selected: [], warnings: [] } as const;

test('empty selection requires a trusted empty result without candidates or warnings', () => {
  const empty = { ...resolution, candidates: [], selected: [], warnings: [] };
  assert.equal(workflowApprovalCanSkip(node, empty), true);
  for (const patch of [{ emptyResult: undefined }, { candidates: [{}] }, { selected: [{}] }, { warnings: [{ code: 'PROVIDER_FAILED' }] }, { provider: 'application_provider' }])
    assert.equal(workflowApprovalCanSkip(node, { ...empty, ...patch }), false);
  for (const emptyPolicy of [undefined, 'block']) assert.equal(workflowApprovalCanSkip({ ...node, emptyPolicy }, empty), false);
});

test('only explicit supported sources can skip, and administrators cannot widen the policy', () => {
  for (const provider of ['fixed_users', 'input_users', 'form_field_users', 'app_role', 'app_role_in_scope'])
    assert.deepEqual(validateWorkflowApprovalEmptyPolicy({ nodes: { review: node } }, { bindings: { reviewers: { provider } } }), []);
  for (const provider of ['initiator_select', 'application_provider', 'department_supervisor', 'business_relation', 'previous_node_actor'])
    assert.deepEqual(validateWorkflowApprovalEmptyPolicy({ nodes: { review: node } }, { bindings: { reviewers: { provider } } }), ['WORKFLOW_APPROVAL_EMPTY_PROVIDER_UNSUPPORTED:review']);
  for (const emptyPolicy of ['approve', null, false])
    assert.deepEqual(validateWorkflowApprovalEmptyPolicy({ nodes: { review: { ...node, emptyPolicy } } }), ['WORKFLOW_APPROVAL_EMPTY_POLICY_INVALID:review']);
  assert.ok(validateWorkflowNodeConfigurationPatch(node, { provider: 'app_role' }, { emptyPolicy: 'skip' }).length);
});

test('fixed graph exposes the code policy without changing approval edges', () => {
  const graph = projectWorkflowGraph({ code: 'review', title: 'Review', startAt: 'review', inputSchema: {}, nodes: { review: node, end: { id: 'end', kind: 'end', outcome: 'approved' } } }, 'frozen');
  assert.equal(graph.nodes[0]!.emptyPolicy, 'skip');
  assert.deepEqual(graph.edges.map(edge => [edge.kind, edge.to]), [['approve', 'end'], ['reject', 'end']]);
});

test('empty fixed lists only apply to explicitly skipping consumers and bounded configuration', () => {
  assert.equal(workflowBindingAllowsEmptyUsers({ nodes: { review: node } }, 'reviewers'), true);
  assert.equal(workflowBindingAllowsEmptyUsers({ nodes: { review: node, final: { ...node, emptyPolicy: 'block' } } }, 'reviewers'), false);
  assert.equal(workflowBindingAllowsEmptyUsers({ nodes: { review: node } }, 'unknown'), false);
  const patch = { assignee: { provider: 'fixed_users', users: [] } };
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(node, { provider: 'fixed_users' }, patch), []);
  assert.ok(validateWorkflowNodeConfigurationPatch({ ...node, emptyPolicy: 'block' }, { provider: 'fixed_users' }, patch).length);
});
