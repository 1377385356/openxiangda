import test from 'node:test';
import assert from 'node:assert/strict';
import { projectWorkflowNodePolicy, validateWorkflowAdministration, validateWorkflowNodeConfigurationPatch } from '../src/native-compiler/workflow-node-administration.js';
import type { WorkflowApprovalNode } from '../src/types.js';

const node: WorkflowApprovalNode = {
  id: 'review', kind: 'approval', title: '复审', binding: 'reviewers', mode: 'single', onApprove: 'done', onReject: 'rejected',
  fieldPolicy: { default: 'readonly', fields: { description: 'readonly', evidence: 'edit_required' } },
  operationPolicy: { approve: { commentRequired: true } },
  administration: {
    modes: ['single', 'all', 'sequence'], assigneeProviders: ['fixed_users', 'app_role'],
    operations: ['approve', 'reject', 'transfer'],
  },
};
const binding = { provider: 'app_role', roleCode: 'reviewer' };

test('valid bounded policies project without mutating code defaults', () => {
  assert.deepEqual(validateWorkflowAdministration({ nodes: { review: node } }), []);
  const patch = { mode: 'all', operations: { approve: { label: '材料核验完成', commentRequired: true }, transfer: { enabled: false } } } as const;
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(node, binding, patch), []);
  const effective = projectWorkflowNodePolicy(node, patch);
  assert.equal(effective.mode, 'all');
  assert.equal(effective.allowedOperations.includes('transfer'), false);
  assert.equal(effective.operationPolicy.approve?.label, '材料核验完成');
  assert.equal(effective.fieldPolicy.fields.description, 'readonly');
  assert.equal(node.mode, 'single');
  assert.equal(node.fieldPolicy?.fields?.description, 'readonly');
});

test('declarations reject policy widening, invalid actions and field administration', () => {
  for (const change of [
    { administration: { modes: ['all'] } },
    { administration: { operations: ['admin_override'] } },
    { administration: { fields: { unknown: ['edit'] } } },
    { administration: { fields: { evidence: ['edit_required', 'hidden'] } } },
    { operationPolicy: { reject: { commentRequired: false } } },
    { operationPolicy: { transfer: { commentRequired: true } } },
    { operationPolicy: { approve: { label: 'x'.repeat(41) } } },
  ]) assert.ok(validateWorkflowAdministration({ nodes: { review: { ...node, ...change } as any } }).length);
  assert.ok(validateWorkflowAdministration({ nodes: { review: { kind: 'condition', administration: {} } } }).length);
});

test('configuration cannot edit topology, enlarge policy or remove required decisions', () => {
  for (const patch of [
    { onApprove: 'other' }, { mode: 'any' }, { operations: { approve: { enabled: false } } },
    { operations: { reject: { commentRequired: false } } }, { operations: { approve: { commentRequired: false } } },
    { operations: { add_assignee: { label: '添加' } } }, { fields: { evidence: 'readonly' } }, { fields: { unknown: 'edit' } },
    { assignee: { provider: 'fixed_users', users: ['same', 'same'] } },
  ]) assert.ok(validateWorkflowNodeConfigurationPatch(node, binding, patch).length, JSON.stringify(patch));
});

test('legacy nodes allow only their existing personnel provider and title', () => {
  const legacy = { ...node, administration: undefined, operationPolicy: undefined };
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(legacy, binding, { title: '新标题', assignee: { provider: 'app_role', roleCode: 'reviewer-b' } }), []);
  for (const patch of [{ mode: 'all' }, { fields: { description: 'edit' } }, { operations: { approve: { label: '完成' } } }, { assignee: { provider: 'fixed_users', users: ['other'] } }]) assert.ok(validateWorkflowNodeConfigurationPatch(legacy, binding, patch).length);
});

test('scope computation cannot be introduced by a configuration patch', () => {
  const scoped = { ...node, administration: { assigneeProviders: ['app_role_in_scope'] as const } } as unknown as WorkflowApprovalNode;
  assert.ok(validateWorkflowAdministration({ nodes: { review: scoped } }, { bindings: { reviewers: binding } }).length);
  assert.ok(validateWorkflowNodeConfigurationPatch(scoped, binding, { assignee: { provider: 'app_role_in_scope', roleCode: 'reviewer' } }).length);
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(scoped, { ...binding, scope: { dimension: 'department', valueFrom: 'departmentId' } }, { assignee: { provider: 'app_role_in_scope', roleCode: 'reviewer' } }), []);
});
