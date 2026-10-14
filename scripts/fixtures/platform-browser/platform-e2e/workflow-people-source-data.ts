// Synthetic component/HTTP data only. No real roles, users or organization facts.
export const sources = {
  handling: { provider: 'department_supervisor', departmentIdFrom: 'dept.value', level: 1, fallbackToAncestorSupervisor: false, min: 1, max: 1 },
  owning: { provider: 'department_supervisor', departmentIdFrom: 'ownerDept.value', level: 2, fallbackToAncestorSupervisor: true, min: 1, max: 1 },
  budget: { provider: 'form_field_users', inputPath: 'budgetOwnerUsers', min: 1, max: 10 },
  scoped: { provider: 'app_role_in_scope', roleCode: 'owner_dept_head', scope: { dimension: 'owner-department', valueFrom: 'ownerDept.value' } },
} as const;
export const rawVariables: any[] = [
  { path: 'major.value', label: '是否重大合同', type: 'string', required: true, source: { kind: 'input' }, usedBy: [] },
  { path: 'dept.value', label: '承办部门', type: 'string', required: true, source: { kind: 'input' }, usedBy: [] },
  { path: 'ownerDept.value', label: '归口部门', type: 'string', required: true, source: { kind: 'input' }, usedBy: [] },
  { path: 'budgetOwnerUsers', label: '所选经费负责人', type: 'array', required: false, source: { kind: 'input' }, usedBy: [] },
];
export const peopleTemplates: any[] = [
  { code: 'dept', title: '按申请中的部门选择主管', entry: sources.handling, parameters: { departmentIdFrom: { values: ['dept.value', 'ownerDept.value'] }, level: { minimum: 1, maximum: 5 }, fallbackToAncestorSupervisor: { values: [false, true] } } },
  { code: 'chain', title: '按发起人逐级查找主管', entry: { provider: 'supervisor_chain', from: 'initiator', until: { level: 2 }, continuous: true, missing: 'block', min: 1, max: 10 }, parameters: { until: { values: [{ level: 1 }, { level: 2 }, 'top'] }, continuous: { values: [true, false] }, missing: { values: ['block', 'skip_level'] } } },
];
const inputSchema = {
  type: 'object', additionalProperties: false, required: ['major', 'dept', 'ownerDept'],
  properties: {
    ...Object.fromEntries(['major', 'dept', 'ownerDept'].map(key => [key, { type: 'object', required: ['value'], properties: { value: { type: 'string' } } }])),
    budgetOwnerUsers: { type: 'array', items: { type: 'string' } },
  },
};
export const peopleDefinition: any = {
  schemaVersion: 'openxiangda.workflow-definition/v2', code: 'review', title: '审批', startAt: 'review', inputSchema,
  organizationContext: { department: { source: 'user_primary_department', required: true } },
  readability: { variables: Object.fromEntries(rawVariables.map(value => [value.path, { label: value.label }])) },
  nodes: {
    review: { id: 'review', kind: 'approval', title: '部门审核', binding: 'review', mode: 'single', onApprove: 'done', onReject: 'rejected', administration: { assigneeProviders: ['fixed_users', 'app_role'], modes: ['single', 'sequence'], operations: ['approve', 'reject'] } },
    done: { id: 'done', kind: 'end', title: '通过', outcome: 'approved' },
    rejected: { id: 'rejected', kind: 'end', title: '拒绝', outcome: 'rejected' },
  },
};
const defaultBinding = { provider: 'app_role', roleCode: 'owner_dept_head', min: 1, max: 2 };
export const peopleConfigurations: any = {
  schemaVersion: 'openxiangda.workflow-node-configurations/v2', workflowCode: 'review', definitionVersion: 1, bindingVersion: 1,
  effect: 'future_node_entries_keep_existing_tasks',
  conditionalAssignment: { definition: peopleDefinition, nativePeopleAuthoring: true, peopleSourceTemplates: peopleTemplates, releasedSources: { ...sources, review: defaultBinding }, scopeDimensionsByNode: { review: ['owner-department'] } },
  nodes: [{ nodeId: 'review', kind: 'approval', defaults: { title: '部门审核', binding: defaultBinding, mode: 'single' }, administration: peopleDefinition.nodes.review.administration, configuration: { revision: 0, patch: null, updatedBy: null, updatedAt: null }, effective: { title: '部门审核', binding: defaultBinding, mode: 'single', revision: 0 } }],
  principals: { users: [], roles: [{ code: 'owner_dept_head', name: '归口部门负责人' }] }, history: [],
};
