import { validateWorkflowRoleInputSelection, validateWorkflowRoleUnion } from './workflow-role-union.js';
import { validateWorkflowSupervisorChainBinding } from './workflow-supervisor-chain.js';
import { validateWorkflowAssignmentRoutingPolicy } from './workflow-assignment-routing.js';
import { workflowStandardBindingEntrySchema } from './workflow-standard-binding-schema.js';
import { WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS } from './workflow-conditional-assignment-schema.js';
const leafSchema = workflowStandardBindingEntrySchema;
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value: object, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const text = (value: unknown, max: number) => typeof value === 'string' && !!value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const path = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,254}$/.test(value) && value.split('.').every(part => !!part && !['__proto__','prototype','constructor'].includes(part));
const role = (value: unknown) => typeof value === 'string' && value.length <= 128 && /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value);
export function validateWorkflowStandardAssignment(entry: unknown, allowIncomplete = false): string[] {
  if (!record(entry) || !WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS.includes(entry.provider) ||
      !keys(entry, Object.keys(leafSchema.properties))) return ['WORKFLOW_CONDITIONAL_LEAF_INVALID'];
  const errors = [...validateWorkflowSupervisorChainBinding(entry), ...validateWorkflowRoleUnion(entry), ...validateWorkflowRoleInputSelection(entry)];
  const providerFields: Record<string, string[]> = {
    fixed_users: ['users'], app_role: ['roleCode', 'roleCodes', 'selectedInputPath', 'routing'],
    app_role_in_scope: ['roleCode', 'roleCodes', 'scope', 'selectedInputPath', 'routing'],
    supervisor_chain: ['from', 'until', 'continuous', 'missing'], department_supervisor: ['departmentIdFrom', 'level', 'fallbackToAncestorSupervisor'],
    form_field_users: ['inputPath', 'candidateField'], input_users: ['inputPath'],
    initiator: [], previous_node_actor: [], business_relation: ['relationCode', 'resourceCode', 'resourceIdFrom'],
  };
  if (!keys(entry, ['provider', 'min', 'max', 'delegatable', ...providerFields[entry.provider]!])) errors.push('WORKFLOW_CONDITIONAL_LEAF_FIELDS_INVALID');
  if (entry.routing !== undefined) errors.push(...validateWorkflowAssignmentRoutingPolicy(entry.routing));
  if (['min', 'max'].some(key => entry[key] !== undefined && (!Number.isInteger(entry[key]) || entry[key] < 1 || entry[key] > 200)) ||
      (entry.min ?? 1) > (entry.max ?? 200) || entry.delegatable !== undefined && typeof entry.delegatable !== 'boolean') errors.push('WORKFLOW_CONDITIONAL_LEAF_BOUNDS_INVALID');
  if (entry.provider === 'fixed_users' && (!Array.isArray(entry.users) || (!allowIncomplete && !entry.users.length) || entry.users.length > 200 ||
      new Set(entry.users).size !== entry.users.length || entry.users.some((id: unknown) => !text(id, 255)))) errors.push('WORKFLOW_CONDITIONAL_USERS_INVALID');
  if (['app_role', 'app_role_in_scope'].includes(entry.provider) && entry.roleCodes === undefined && !(allowIncomplete && entry.roleCode === undefined) && !role(entry.roleCode)) errors.push('WORKFLOW_CONDITIONAL_ROLE_INVALID');
  if (entry.provider === 'app_role_in_scope' && (!record(entry.scope) || !keys(entry.scope, ['dimension', 'value', 'valueFrom']) || !role(entry.scope.dimension) ||
      !(text(entry.scope.value, 255) && entry.scope.valueFrom === undefined || path(entry.scope.valueFrom) && entry.scope.value === undefined))) errors.push('WORKFLOW_CONDITIONAL_SCOPE_INVALID');
  if (['input_users', 'form_field_users'].includes(entry.provider) && !path(entry.inputPath)) errors.push('WORKFLOW_CONDITIONAL_INPUT_PATH_INVALID');
  if (entry.provider === 'business_relation' && (!role(entry.relationCode) || !role(entry.resourceCode) || !path(entry.resourceIdFrom))) errors.push('WORKFLOW_CONDITIONAL_RELATION_INVALID');
  if (entry.provider === 'department_supervisor' && (!path(entry.departmentIdFrom) || entry.level !== undefined && (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > 20) || entry.fallbackToAncestorSupervisor !== undefined && typeof entry.fallbackToAncestorSupervisor !== 'boolean')) errors.push('WORKFLOW_DEPARTMENT_SUPERVISOR_INVALID');
  return errors;
}

