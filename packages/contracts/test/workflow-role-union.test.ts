import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowRoleUnion, workflowBindingRoleCodes, validateWorkflowRoleInputSelection, requiresWorkflowRoleInputSelection } from '../src/native-compiler/workflow-role-union.js';
import { validateWorkflowNodeConfigurationPatch } from '../src/native-compiler/workflow-node-administration.js';

const union = { provider: 'app_role', roleCodes: ['student-office', 'organization'] };
test('ordered role union retains primary duty order without sharing the source array', () => {
  assert.deepEqual(validateWorkflowRoleUnion(union), []);
  assert.deepEqual(workflowBindingRoleCodes(union), ['student-office', 'organization']);
  const roles = workflowBindingRoleCodes(union); roles.reverse();
  assert.deepEqual(union.roleCodes, ['student-office', 'organization']);
  assert.deepEqual(workflowBindingRoleCodes({ roleCode: 'original' }), ['original']);
});
for (const entry of [
  { ...union, roleCode: 'original' }, { ...union, candidateField: 'users' }, { ...union, provider: 'fixed_users' },
  { ...union, roleCodes: [] }, { ...union, roleCodes: ['only'] }, { ...union, roleCodes: ['same', 'same'] },
  { ...union, roleCodes: ['valid', 'bad role'] }, { ...union, roleCodes: Array.from({ length: 9 }, (_, i) => `role-${i}`) },
]) test(`invalid union is rejected consistently: ${JSON.stringify(entry)}`, () => {
  assert.ok(validateWorkflowRoleUnion(entry).length);
});
test('scope belongs to the union and cannot be supplied as two different facts', () => {
  const entry = { ...union, provider: 'app_role_in_scope', scope: { dimension: 'department', valueFrom: 'toScopeId' } };
  assert.deepEqual(validateWorkflowRoleUnion(entry), []);
  for (const scope of [undefined, {}, { dimension: 'department' }, { dimension: 'department', valueFrom: 'toScopeId', value: 'other' },
    { dimension: 'department', valueFrom: 'constructor.secret' }, { dimension: 'department', valueFrom: 'toScopeId', override: true }]) {
    assert.ok(validateWorkflowRoleUnion({ ...entry, scope }).length);
  }
  assert.ok(validateWorkflowRoleUnion({ ...union, scope: entry.scope }).length);
});
test('administrator can choose a bounded ordered union without changing scope or topology', () => {
  const node = { kind: 'approval', administration: { assigneeProviders: ['app_role', 'app_role_in_scope'] } } as any;
  const binding = { provider: 'app_role_in_scope', scope: { dimension: 'department', valueFrom: 'toScopeId' } };
  for (const provider of ['app_role', 'app_role_in_scope']) {
    assert.deepEqual(validateWorkflowNodeConfigurationPatch(node, binding, { assignee: { ...union, provider } }), []);
  }
  for (const assignee of [{ ...union, roleCode: 'original' }, { ...union, roleCodes: ['same', 'same'] }, { ...union, scope: binding.scope }]) {
    assert.ok(validateWorkflowNodeConfigurationPatch(node, binding, { assignee }).length);
  }
});


test('code selection stays attached to a role and cannot be overridden by another source', () => {
  const selected = { ...union, selectedInputPath: 'steps.resolve-leaders.userIds' };
  assert.deepEqual(validateWorkflowRoleInputSelection(selected), []);
  assert.equal(requiresWorkflowRoleInputSelection([{ binding: { bindings: { leaders: selected } } }]), true);
  assert.equal(requiresWorkflowRoleInputSelection([{ binding: { bindings: { leaders: union } } }]), false);
  for (const change of [{ provider: 'input_users' }, { selectedInputPath: '' }, { selectedInputPath: 'steps.__proto__.users' }, { selectedInputPath: 'steps.constructor.users' }, { routing: {} }, { inputPath: 'leaders' }, { candidateField: 'leaders' }])
    assert.ok(validateWorkflowRoleInputSelection({ ...selected, ...change }).length);
  const node = { kind: 'approval', administration: { assigneeProviders: ['app_role', 'fixed_users'] } } as any;
  assert.ok(validateWorkflowNodeConfigurationPatch(node, selected, { assignee: { provider: 'fixed_users', users: ['person'] } }).includes('WORKFLOW_V2_NODE_CONFIGURATION_PROVIDER_READONLY'));
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(node, selected, { assignee: { provider: 'app_role', roleCode: 'current-role' } }), []);
});
