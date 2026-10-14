import assert from 'node:assert/strict';
import test from 'node:test';
import { workflowPeopleSourceSummary, workflowPeopleSourceBounds, workflowPeopleProviderLabels } from '../src/browser/components/workflow/workflow-people-source-presentation.js';
import type { WorkflowBindingEntry, WorkflowNodeConfigurations } from 'openxiangda-contracts/browser';

const variables = [{ path: 'dept.value', label: '承办部门' }, { path: 'ownerDept.value', label: '归口部门' }, { path: 'budgetOwnerUsers', label: '经费负责人' }];
const principals: WorkflowNodeConfigurations['principals'] = { users: [], roles: [{ code: 'owner_dept_head', name: '归口部门负责人' }] };
const sources: Record<string, WorkflowBindingEntry> = {
  handling_department_supervisor: { provider: 'department_supervisor', departmentIdFrom: 'dept.value', level: 1, fallbackToAncestorSupervisor: false, min: 1, max: 1 },
  owning_department_supervisor: { provider: 'department_supervisor', departmentIdFrom: 'ownerDept.value', level: 2, fallbackToAncestorSupervisor: true, min: 1, max: 2 },
  owning_department_role: { provider: 'app_role_in_scope', roleCode: 'owner_dept_head', scope: { dimension: 'owner-department', valueFrom: 'ownerDept.value' } },
  budget_owner: { provider: 'form_field_users', inputPath: 'budgetOwnerUsers', min: 1, max: 10 },
  initiator_rule: { provider: 'initiator' },
};

test('department sources describe real departments, levels and empty behavior instead of codes', () => {
  assert.equal(workflowPeopleSourceSummary(sources.handling_department_supervisor!, variables), '承办部门 · 第 1 级主管 · 本级无人时阻止办理');
  assert.equal(workflowPeopleSourceSummary(sources.owning_department_supervisor!, variables), '归口部门 · 第 2 级主管 · 本级无人时向上查找');
});
test('unlabelled department fact remains honest without leaking its encoded path', () => {
  const text = workflowPeopleSourceSummary(sources.handling_department_supervisor!);
  assert.match(text, /申请表中的部门/);
  assert.doesNotMatch(text, /dept\.value|handling_department/);
});
test('a label identical to its path is not presented as a friendly field name', () => {
  assert.doesNotMatch(workflowPeopleSourceSummary(sources.handling_department_supervisor!, [{ path: 'dept.value', label: 'dept.value' }]), /dept\.value/);
});
test('role sources name the actual role and fact scope, not either stable code', () => {
  assert.equal(workflowPeopleSourceSummary(sources.owning_department_role!, variables, principals), '归口部门负责人 · 归口部门');
});
test('missing role display information does not invent a responsibility', () => {
  assert.match(workflowPeopleSourceSummary(sources.owning_department_role!, variables), /已发布角色/);
  assert.doesNotMatch(workflowPeopleSourceSummary(sources.owning_department_role!, variables), /owner_dept_head|owner-department/);
});
test('form members and named members have distinct understandable summaries', () => {
  assert.equal(workflowPeopleSourceSummary(sources.budget_owner!, variables), '表单成员字段 · 经费负责人');
  assert.equal(workflowPeopleSourceSummary({ provider: 'fixed_users', users: ['synthetic-1', 'synthetic-2'] }), '指定成员 · 2 人');
});
test('exact, minimum-only and maximum-only cardinality are not lost', () => {
  assert.equal(workflowPeopleSourceBounds(sources.handling_department_supervisor!), '必须解析到 1 人');
  assert.equal(workflowPeopleSourceBounds(sources.budget_owner!), '至少 1 人，最多 10 人');
  assert.equal(workflowPeopleSourceBounds({ provider: 'initiator', min: 1 }), '至少 1 人');
  assert.equal(workflowPeopleSourceBounds({ provider: 'initiator', max: 10 }), '最多 10 人');
  assert.equal(workflowPeopleSourceBounds({ provider: 'initiator' }), undefined);
});
test('all standard types have Chinese names', () => {
  for (const type of ['department_supervisor', 'supervisor_chain', 'form_field_users', 'initiator', 'previous_node_actor', 'initiator_select', 'business_relation', 'application_provider']) assert.match(workflowPeopleProviderLabels[type]!, /[\u4e00-\u9fff]/);
});
test('summaries and bounds do not mutate exact released rules', () => {
  const before = structuredClone(sources);
  for (const source of Object.values(sources)) { workflowPeopleSourceSummary(source, variables, principals); workflowPeopleSourceBounds(source); }
  assert.deepEqual(sources, before);
});
test('unknown field is described without substituting another published department', () => {
  const text = workflowPeopleSourceSummary({ provider: 'department_supervisor', departmentIdFrom: 'unpublished.value', level: 20 }, variables);
  assert.match(text, /申请表中的部门/);
  assert.doesNotMatch(text, /归口部门|承办部门|unpublished/);
});
test('initiator and previous actor do not invent additional named people', () => {
  assert.equal(workflowPeopleSourceSummary({ provider: 'initiator' }), '发起人');
  assert.equal(workflowPeopleSourceSummary({ provider: 'previous_node_actor' }), '上个节点处理人');
});
