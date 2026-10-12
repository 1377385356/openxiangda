import type { WorkflowApprovalAdministration, WorkflowConfigurableOperation, WorkflowNodeConfigurationPatch, WorkflowNodeOperationPolicy } from '../types.js';
import { validateWorkflowInitiatorApprovalPolicy, type WorkflowInitiatorApprovalPages } from './workflow-initiator-approval.js';
import { validateWorkflowRoleUnion } from './workflow-role-union.js';
import { WORKFLOW_AUTOMATIC_CC_DEFAULT_RECIPIENTS, WORKFLOW_AUTOMATIC_CC_MAX_RECIPIENTS } from './workflow-automatic-cc.js';

export const WORKFLOW_CONFIGURABLE_OPERATIONS = ['complete', 'approve', 'reject', 'save_form', 'return', 'transfer', 'delegate', 'add_assignee'] as const;
export const WORKFLOW_CONFIGURABLE_PROVIDERS = ['fixed_users', 'app_role', 'app_role_in_scope'] as const;
const modes = ['single', 'any', 'all', 'sequence'];
type PolicyMap = Partial<Record<WorkflowConfigurableOperation, WorkflowNodeOperationPolicy>>;
export interface WorkflowAdministrationNodeSource {
  kind: string;
  emptyPolicy?: string;
  initiatorApprovalPolicy?: 'manual' | 'auto_approve';
  completionDeadline?: import('./workflow-completion-deadline.js').WorkflowCompletionDeadline;
  taskPageCode?: string;
  mode?: string;
  binding?: string;
  allowedOperations?: string[];
  requiredOperations?: WorkflowConfigurableOperation[];
  operationPolicy?: PolicyMap;
  administration?: WorkflowApprovalAdministration;
  fieldPolicy?: { default?: string; fields?: Record<string, string> };
}
type BindingSource = { provider: string; continuous?:boolean; min?: number; max?: number; selectedInputPath?: string; scope?: { dimension: string; value?: string; valueFrom?: string } };
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: object, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const boundedList = (value: unknown, allowed: readonly string[], limit: number) => Array.isArray(value) && value.length > 0 && value.length <= limit && new Set(value).size === value.length && value.every(item => typeof item === 'string' && allowed.includes(item));

export function workflowNodeAllowedOperations(node: WorkflowAdministrationNodeSource): string[] {
  return node.allowedOperations || (node.kind === 'handle' ? ['complete', 'save_form', 'return', 'transfer', 'delegate'] : WORKFLOW_CONFIGURABLE_OPERATIONS.filter(operation => operation !== 'complete')).filter(operation => operation !== 'save_form' || !!node.taskPageCode);
}

/** Frozen task policy wins; legacy rejection requires a comment when omitted. */
export function workflowOperationCommentRequired(operation: string, policy?: WorkflowNodeOperationPolicy): boolean {
  return policy?.opinion !== undefined ? policy.opinion === 'required' : policy?.commentRequired ?? operation === 'reject';
}

/** Omission preserves audited reasons; admin reassign always requires one. */
export function workflowOperationReasonRequired(operation: string, policy?: WorkflowNodeOperationPolicy): boolean {
  if (!['transfer', 'delegate', 'add_assignee', 'return'].includes(operation)) return true;
  return policy?.opinion !== undefined ? policy.opinion === 'required' : policy?.reasonRequired !== false;
}

const opinions = ['none', 'optional', 'required'] as const;

export function workflowOperationOpinion(operation: string, policy?: WorkflowNodeOperationPolicy): typeof opinions[number] {
  if (operation === 'save_form') return 'none';
  if (policy?.opinion) return policy.opinion;
  return (['complete', 'approve', 'reject'].includes(operation) ? workflowOperationCommentRequired(operation, policy) : workflowOperationReasonRequired(operation, policy)) ? 'required' : 'optional';
}

export function workflowOperationMinimumOpinion(operation: string, policy?: WorkflowNodeOperationPolicy): typeof opinions[number] {
  return policy?.minimumOpinion ?? (workflowOperationOpinion(operation, policy) === 'required' ? 'required' : 'none');
}

/** Availability only: callers must still enforce actor authorization and task state. */
export function workflowTaskSaveEnabled(input: { allowedOperations?: readonly string[]; operationModel?: string; hasTaskPage: boolean }): boolean {
  return input.hasTaskPage && (input.operationModel == null || input.operationModel === 'configured-v1' && input.allowedOperations?.includes('save_form') === true);
}

function policyValid(value: unknown, operation: string, defaults: WorkflowNodeOperationPolicy = {}, configurable = false): boolean {
  const common = ['label', 'commentRequired', 'reasonRequired', 'opinion'];
  if (!record(value) || !Object.keys(value).length || !keys(value, configurable ? [...common, 'enabled'] : [...common, 'minimumOpinion'])) return false;
  if (value.label !== undefined && (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 40 || /[\u0000-\u001f\u007f]/.test(value.label))) return false;
  if (value.enabled !== undefined && (typeof value.enabled !== 'boolean' || operation === 'approve' && !value.enabled)) return false;
  if (value.opinion !== undefined && (!opinions.includes(value.opinion) || operation === 'save_form')) return false;
  if (value.minimumOpinion !== undefined && (!opinions.includes(value.minimumOpinion) || operation === 'save_form')) return false;
  if (value.commentRequired !== undefined && (typeof value.commentRequired !== 'boolean' || !['complete', 'approve', 'reject'].includes(operation))) return false;
  if (value.reasonRequired !== undefined && (typeof value.reasonRequired !== 'boolean' || !['transfer', 'delegate', 'add_assignee', 'return'].includes(operation))) return false;
  if (value.opinion !== undefined && [value.commentRequired, value.reasonRequired].some(required => required !== undefined && required !== (value.opinion === 'required'))) return false;
  if (configurable && (value.opinion !== undefined || value.commentRequired !== undefined || value.reasonRequired !== undefined)) {
    const next = value.opinion ?? ((value.commentRequired ?? value.reasonRequired) ? 'required' : 'optional');
    if (opinions.indexOf(next) < opinions.indexOf(workflowOperationMinimumOpinion(operation, defaults))) return false;
  }
  if (!configurable && value.minimumOpinion !== undefined && opinions.indexOf(workflowOperationOpinion(operation, value)) < opinions.indexOf(value.minimumOpinion)) return false;
  return true;
}

/** Pure shared rule used before compilation, activation and configuration writes. */
export function validateWorkflowAdministration(definition: { nodes?: Record<string, WorkflowAdministrationNodeSource> }, bindings?: { bindings: Record<string, BindingSource> }): string[] {
  const errors: string[] = [];
  for (const [id, node] of Object.entries(definition?.nodes || {})) {
    if (!record(node)) continue;
    const admin = node.administration;
    const policy = node.operationPolicy;
    if ((node.kind === 'approval' || node.kind === 'handle')) {
      const allowed = workflowNodeAllowedOperations(node);
      if (!allowed.includes(node.kind === 'handle' ? 'complete' : 'approve')) errors.push(`WORKFLOW_NODE_FORWARD_OPERATION_REQUIRED:${id}`);
      if (allowed.includes('save_form') && !node.taskPageCode) errors.push(`WORKFLOW_NODE_SAVE_PAGE_REQUIRED:${id}`);
      if (node.requiredOperations !== undefined && (!boundedList(node.requiredOperations, WORKFLOW_CONFIGURABLE_OPERATIONS, 8) || node.requiredOperations.some(operation => !allowed.includes(operation)))) errors.push(`WORKFLOW_NODE_REQUIRED_OPERATIONS_INVALID:${id}`);
    }
    if (node.kind === 'cc') {
      if (policy !== undefined || admin !== undefined && (!record(admin) || !keys(admin, ['assigneeProviders']))) errors.push(`WORKFLOW_NODE_ADMINISTRATION_INVALID:${id}`);
      if (admin?.assigneeProviders !== undefined && !boundedList(admin.assigneeProviders, WORKFLOW_CONFIGURABLE_PROVIDERS, 3)) errors.push(`WORKFLOW_NODE_ADMINISTRATION_PROVIDERS_INVALID:${id}`);
      if (admin?.assigneeProviders?.includes('app_role_in_scope') && bindings && !bindings.bindings[node.binding || '']?.scope) errors.push(`WORKFLOW_NODE_ADMINISTRATION_SCOPE_REQUIRED:${id}`);
      continue;
    }
    if (!['approval', 'handle'].includes(node.kind)) {
      if (admin !== undefined || policy !== undefined) errors.push(`WORKFLOW_NODE_ADMINISTRATION_APPROVAL_REQUIRED:${id}`);
      continue;
    }
    if (policy !== undefined && (!record(policy) || Object.keys(policy).length > 8 || Object.entries(policy).some(([operation, value]) => !WORKFLOW_CONFIGURABLE_OPERATIONS.includes(operation as WorkflowConfigurableOperation) || !workflowNodeAllowedOperations(node).includes(operation) || !policyValid(value, operation)))) errors.push(`WORKFLOW_NODE_OPERATION_POLICY_INVALID:${id}`);
    if (admin === undefined) continue;
    if (!record(admin) || !keys(admin, ['modes', 'assigneeProviders', 'operations'])) {
      errors.push(`WORKFLOW_NODE_ADMINISTRATION_INVALID:${id}`);
      continue;
    }
    if (admin.modes !== undefined && (!boundedList(admin.modes, modes, 4) || !admin.modes.includes(node.mode as any))) errors.push(`WORKFLOW_NODE_ADMINISTRATION_MODES_INVALID:${id}`);
    if (admin.assigneeProviders !== undefined && !boundedList(admin.assigneeProviders, WORKFLOW_CONFIGURABLE_PROVIDERS, 3)) errors.push(`WORKFLOW_NODE_ADMINISTRATION_PROVIDERS_INVALID:${id}`);
    const binding = bindings?.bindings[node.binding || ''];
    if (binding && Array.isArray(admin.assigneeProviders) && admin.assigneeProviders.includes('app_role_in_scope') && !binding.scope) errors.push(`WORKFLOW_NODE_ADMINISTRATION_SCOPE_REQUIRED:${id}`);
    if (admin.operations !== undefined && (!boundedList(admin.operations, WORKFLOW_CONFIGURABLE_OPERATIONS, 8) || admin.operations.some(operation => !workflowNodeAllowedOperations(node).includes(operation)))) errors.push(`WORKFLOW_NODE_ADMINISTRATION_OPERATIONS_INVALID:${id}`);
  }
  return errors;
}

export function validateWorkflowNodeConfigurationPatch(node: WorkflowAdministrationNodeSource | undefined, binding: BindingSource | undefined, input: unknown, taskPages?: WorkflowInitiatorApprovalPages): string[] {
  const errors: string[] = [];
  if (!node || !record(input) || !Object.keys(input).length || !keys(input, ['title', 'description', 'assignee', 'mode', 'operations'])) return ['WORKFLOW_V2_NODE_CONFIGURATION_PATCH_INVALID'];
  const patch = input as WorkflowNodeConfigurationPatch;
  if (!patch.assignee && binding?.provider === 'supervisor_chain' && binding.continuous !== false && (patch.mode || node.mode) !== 'sequence') errors.push('WORKFLOW_SUPERVISOR_CHAIN_SEQUENCE_REQUIRED');
  if (Object.entries(patch.operations || {}).some(([operation, policy]) => policy?.enabled === false && node.requiredOperations?.includes(operation as WorkflowConfigurableOperation))) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_REQUIRED_OPERATION');
  for (const key of ['title', 'description'] as const) if (patch[key] !== undefined && (typeof patch[key] !== 'string' || patch[key]!.length > (key === 'title' ? 255 : 1000) || (key === 'title' && !patch[key]!.trim()))) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_PATCH_INVALID');
  const admin = node.administration;
  if (patch.mode !== undefined && (!['approval', 'handle'].includes(node.kind) || !admin?.modes?.includes(patch.mode))) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_MODE_READONLY');
  if (patch.operations !== undefined && (!['approval', 'handle'].includes(node.kind) || !record(patch.operations) || !Object.keys(patch.operations).length || Object.keys(patch.operations).length > 8 || Object.entries(patch.operations).some(([operation, value]) => !admin?.operations?.includes(operation as WorkflowConfigurableOperation) || !workflowNodeAllowedOperations(node).includes(operation) || !policyValid(value, operation, node.operationPolicy?.[operation as WorkflowConfigurableOperation], true)))) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_OPERATION_INVALID');
  if (patch.assignee !== undefined) {
    const value = patch.assignee;
    const allowed = admin?.assigneeProviders || ((node.kind === 'approval' || node.kind === 'handle') && binding && WORKFLOW_CONFIGURABLE_PROVIDERS.includes(binding.provider as any) ? [binding.provider] : []);
    if (binding?.selectedInputPath && !['app_role', 'app_role_in_scope'].includes(value?.provider || '')) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_PROVIDER_READONLY');
    if (!record(value) || !['approval', 'handle', 'cc'].includes(node.kind) || !allowed.includes(value.provider) || (value.provider === 'app_role_in_scope' && !binding?.scope)) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_PROVIDER_READONLY');
    else if (value.provider === 'fixed_users') {
      const minimum = node.kind === 'cc' ? binding?.min ?? 1 : node.emptyPolicy === 'skip' ? 0 : 1;
      const maximum = node.kind === 'cc' ? Math.min(binding?.max ?? WORKFLOW_AUTOMATIC_CC_DEFAULT_RECIPIENTS, WORKFLOW_AUTOMATIC_CC_MAX_RECIPIENTS) : 200;
      if (!keys(value, ['provider', 'users']) || !Array.isArray(value.users) || value.users.length < minimum || value.users.length > maximum || new Set(value.users).size !== value.users.length || value.users.some(id => typeof id !== 'string' || !id.trim() || id.length > 255)) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_USERS_INVALID');
    } else if (value.roleCodes !== undefined) {
      if (!keys(value, ['provider', 'roleCodes']) || validateWorkflowRoleUnion({ ...value, ...(value.provider === 'app_role_in_scope' ? { scope: binding?.scope } : {}) }).length) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_ROLE_INVALID');
    } else if (!keys(value, ['provider', 'roleCode']) || typeof value.roleCode !== 'string' || !/^[a-z][a-z0-9_-]{0,127}$/.test(value.roleCode)) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_ROLE_INVALID');
  }
  errors.push(...validateWorkflowInitiatorApprovalPolicy({ nodes: { node: { ...node, operationPolicy: projectWorkflowNodePolicy(node, patch).operationPolicy } }, ...(taskPages ? { taskPages } : {}) }));
  if (node.completionDeadline && projectWorkflowNodePolicy(node, patch).operationPolicy.approve?.commentRequired === true) errors.push('WORKFLOW_COMPLETION_DEADLINE_INPUT_REQUIRED:node');
  return errors;
}

/** Applies only validated fields; never mutates the immutable definition. */
export function projectWorkflowNodePolicy(node: WorkflowAdministrationNodeSource, patch?: WorkflowNodeConfigurationPatch | null) {
  const operations = Object.fromEntries(workflowNodeAllowedOperations(node).flatMap(operation => {
    const code = operation as WorkflowConfigurableOperation;
    const configured = patch?.operations?.[code];
    const policy = { ...node.operationPolicy?.[code], ...(configured?.label !== undefined ? { label: configured.label } : {}), ...(configured?.commentRequired !== undefined ? { commentRequired: configured.commentRequired } : {}), ...(configured?.reasonRequired !== undefined ? { reasonRequired: configured.reasonRequired } : {}), ...(configured?.opinion !== undefined ? { opinion: configured.opinion } : {}) };
    if (configured?.opinion === undefined && (configured?.commentRequired !== undefined || configured?.reasonRequired !== undefined) && policy.opinion !== undefined) policy.opinion = (configured.commentRequired ?? configured.reasonRequired) ? 'required' : 'optional';
    if (policy.opinion !== undefined) {
      if (['complete', 'approve', 'reject'].includes(code)) policy.commentRequired = policy.opinion === 'required';
      if (['transfer', 'delegate', 'add_assignee', 'return'].includes(code)) policy.reasonRequired = policy.opinion === 'required';
    }
    return Object.keys(policy).length ? [[code, policy]] : [];
  })) as PolicyMap;
  return {
    mode: patch?.mode || node.mode,
    initiatorApprovalPolicy: node.initiatorApprovalPolicy || 'manual',
    allowedOperations: workflowNodeAllowedOperations(node).filter(operation => patch?.operations?.[operation as WorkflowConfigurableOperation]?.enabled !== false),
    operationPolicy: operations,
    fieldPolicy: { default: node.fieldPolicy?.default || 'readonly', fields: { ...node.fieldPolicy?.fields } },
  };
}
