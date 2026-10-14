import type { WorkflowBindingEntry, WorkflowGraphVariable, WorkflowNodeConfigurations } from 'openxiangda-contracts/browser';
import { formatWorkflowSupervisorChain, type WorkflowSupervisorChainParameters } from 'openxiangda-contracts/browser';

/** Presentation only. Source keys and provider parameters remain authoritative. */
export const workflowPeopleProviderLabels: Record<string, string> = {
  fixed_users: '指定成员', app_role: '应用角色', app_role_in_scope: '范围内角色',
  department_supervisor: '部门主管', supervisor_chain: '逐级主管',
  form_field_users: '表单成员字段', input_users: '申请成员变量',
  initiator: '发起人', previous_node_actor: '上个节点处理人',
  initiator_select: '发起时选择', application_provider: '应用人员规则', business_relation: '业务关系',
};
type VariableNames = readonly Pick<WorkflowGraphVariable, 'path' | 'label'>[];
type Principals = WorkflowNodeConfigurations['principals'];

function factName(path: string | undefined, variables: VariableNames, fallback: string) {
  const label = variables.find(variable => variable.path === path)?.label;
  return label && label !== path ? label : fallback;
}
function roleNames(source: WorkflowBindingEntry, principals: Principals) {
  return (source.roleCodes || (source.roleCode ? [source.roleCode] : []))
    .map(code => principals.roles.find(role => role.code === code)?.name || '已发布角色').join('、');
}
export function workflowPeopleSourceSummary(source: WorkflowBindingEntry, variables: VariableNames = [], principals: Principals = { users: [], roles: [] }): string {
  const type = workflowPeopleProviderLabels[source.provider] || '已发布人员规则';
  if (source.provider === 'department_supervisor') {
    const department = factName(source.departmentIdFrom, variables, '申请表中的部门');
    return `${department} · 第 ${source.level || 1} 级主管 · ${source.fallbackToAncestorSupervisor ? '本级无人时向上查找' : '本级无人时阻止办理'}`;
  }
  if (source.provider === 'supervisor_chain') {
    let description = formatWorkflowSupervisorChain(source as WorkflowSupervisorChainParameters);
    if (source.from && typeof source.from === 'object') description = description.replaceAll(source.from.field, factName(source.from.field, variables, '申请表中的部门'));
    if (source.until && typeof source.until === 'object' && 'roleCode' in source.until) description = description.replaceAll(source.until.roleCode, roleNames({ provider: 'app_role', roleCode: source.until.roleCode }, principals));
    return description;
  }
  if (source.provider === 'app_role' || source.provider === 'app_role_in_scope') {
    const roles = roleNames(source, principals) || type;
    return source.provider === 'app_role_in_scope'
      ? `${roles} · ${factName(source.scope?.valueFrom, variables, '已发布的人员范围')}` : roles;
  }
  if (source.provider === 'form_field_users' || source.provider === 'input_users') return `${type} · ${factName(source.inputPath, variables, '申请表中的成员')}`;
  if (source.provider === 'fixed_users') return `${type} · ${source.users?.length || 0} 人`;
  return type;
}
export function workflowPeopleSourceBounds(source: WorkflowBindingEntry): string | undefined {
  if (source.min === undefined && source.max === undefined) return undefined;
  if (source.min !== undefined && source.max === source.min) return `必须解析到 ${source.min} 人`;
  return [source.min === undefined ? undefined : `至少 ${source.min} 人`, source.max === undefined ? undefined : `最多 ${source.max} 人`].filter(Boolean).join('，');
}
