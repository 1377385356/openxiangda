import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowInitiatorApprovalPolicy, workflowInitiatorApprovalCanComplete } from '../src/native-compiler/workflow-initiator-approval.js';
import { projectWorkflowNodePolicy, validateWorkflowNodeConfigurationPatch } from '../src/native-compiler/workflow-node-administration.js';
import { projectWorkflowGraph } from '../src/native-compiler/workflow-graph.js';

const node = { kind: 'approval', initiatorApprovalPolicy: 'auto_approve' as const, mode: 'all', administration: { modes: ['all', 'sequence'] as any, operations: ['approve'] as any } };
const seat = { user_id: 'applicant', status: 'active', participant_kind: 'primary', source: 'resolution' };

test('readonly detail pages retain automatic direct seats without permitting editable input', () => {
  const display = { ...node, taskPageCode: 'details' };
  const pages = { details: { fields: [{ code: 'phone', readonly: true, required: true }, { code: 'people', subtable: { create: false, delete: false, reorder: false, fields: [{ code: 'bank', readonly: true }] } }] } };
  assert.deepEqual(validateWorkflowInitiatorApprovalPolicy({ nodes: { review: display }, taskPages: pages }), []);
  assert.equal(workflowInitiatorApprovalCanComplete(display, 'normal', 'applicant', seat, pages), true);
  assert.equal(workflowInitiatorApprovalCanComplete(display, 'normal', 'applicant', seat), false);
  assert.equal(workflowInitiatorApprovalCanComplete(display, 'return_review', 'applicant', seat, pages), false);
  assert.equal(workflowInitiatorApprovalCanComplete(display, 'normal', 'applicant', { ...seat, source: 'transfer' }, pages), false);
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(display, undefined, { mode: 'sequence' }, pages), []);
  assert.ok(validateWorkflowNodeConfigurationPatch(display, undefined, { operations: { approve: { commentRequired: true } } }, pages).length);
  for (const field of [{ code: 'phone' }, { code: 'phone', readonly: false }, { code: 'phone', readonly: true, readonlyWhen: { op: 'literal', value: true } },
    { code: 'people', subtable: { create: true, delete: false, reorder: false, fields: [{ code: 'bank', readonly: true }] } },
    { code: 'people', subtable: { create: false, delete: false, reorder: false, fields: [{ code: 'bank' }] } }]) {
    const unsafe = { details: { fields: [field] } };
    assert.ok(validateWorkflowInitiatorApprovalPolicy({ nodes: { review: display }, taskPages: unsafe }).length);
    assert.equal(workflowInitiatorApprovalCanComplete(display, 'normal', 'applicant', seat, unsafe), false);
  }
});

test('automatic approval cannot bypass task input or required approval comments', () => {
  assert.deepEqual(validateWorkflowInitiatorApprovalPolicy({ nodes: { review: node } }), []);
  for (const patch of [{ kind: 'cc' }, { initiatorApprovalPolicy: 'skip' }, { initiatorApprovalPolicy: null },
    { taskPageCode: 'fill' }, { fieldPolicy: { default: 'edit' } },
    { fieldPolicy: { fields: { evidence: 'edit_required' } } }, { operationPolicy: { approve: { commentRequired: true } } }]) {
    assert.ok(validateWorkflowInitiatorApprovalPolicy({ nodes: { review: { ...node, ...patch } } }).length);
  }
  assert.deepEqual(validateWorkflowInitiatorApprovalPolicy({ nodes: { review: { ...node, initiatorApprovalPolicy: 'manual', taskPageCode: 'fill' } } }), []);
});

test('only original direct and active seats qualify; a correction is always manual', () => {
  assert.equal(workflowInitiatorApprovalCanComplete(node, 'normal', 'applicant', seat), true);
  assert.equal(workflowInitiatorApprovalCanComplete(node, 'resume', 'applicant', { ...seat, source: 'resolution_retry' }), true);
  for (const patch of [{ user_id: 'other' }, { status: 'pending' }, { status: 'approved' }, { participant_kind: 'delegate' },
    { source_participant_id: 'original' }, { delegate_authorization_id: 'grant' },
    ...['transfer', 'delegate', 'add_before', 'add_after', 'admin_reassign'].map(source => ({ source }))]) {
    assert.equal(workflowInitiatorApprovalCanComplete(node, 'normal', 'applicant', { ...seat, ...patch }), false);
  }
  assert.equal(workflowInitiatorApprovalCanComplete(node, 'return_review', 'applicant', seat), false);
  assert.equal(workflowInitiatorApprovalCanComplete({ kind: 'approval' }, 'normal', 'applicant', seat), false);
});

test('administrator changes preserve code policy and cannot require an automatic approval comment', () => {
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(node, undefined, { mode: 'sequence' }), []);
  assert.equal(projectWorkflowNodePolicy(node, { mode: 'sequence' }).initiatorApprovalPolicy, 'auto_approve');
  assert.equal(projectWorkflowNodePolicy({ kind: 'approval' }).initiatorApprovalPolicy, 'manual');
  assert.ok(validateWorkflowNodeConfigurationPatch(node, undefined, { initiatorApprovalPolicy: 'manual' }).length);
  assert.ok(validateWorkflowNodeConfigurationPatch(node, undefined, { operations: { approve: { commentRequired: true } } }).length);
});

test('fixed graph explains policy from the selected definition rather than current users', () => {
  const graph = projectWorkflowGraph({ code: 'test', title: 'Test', startAt: 'review', inputSchema: { type: 'object', properties: {} }, nodes: {
    review: { ...node, id: 'review', onApprove: 'end', onReject: 'end' },
    end: { id: 'end', kind: 'end', outcome: 'approved' },
  } }, 'digest');
  assert.equal(graph.nodes.find(item => item.id === 'review')?.initiatorApprovalPolicy, 'auto_approve');
  assert.equal(graph.fixedTopology, true);
});
