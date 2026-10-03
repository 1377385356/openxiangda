import type { WorkflowApprovalAdministration, WorkflowConfigurableOperation, WorkflowNodeConfigurationPatch, WorkflowNodeOperationPolicy } from '../types.js';
import { validateWorkflowInitiatorApprovalPolicy } from './workflow-initiator-approval.js';

export const WORKFLOW_CONFIGURABLE_OPERATIONS = ['approve', 'reject', 'return', 'transfer', 'delegate', 'add_assignee'] as const;
export const WORKFLOW_CONFIGURABLE_PROVIDERS = ['fixed_users', 'app_role', 'app_role_in_scope'] as const;
const modes = ['single', 'any', 'all', 'sequence'];
type PolicyMap = Partial<Record<WorkflowConfigurableOperation, WorkflowNodeOperationPolicy>>;
export interface WorkflowAdministrationNodeSource {
  kind: string;
  emptyPolicy?: string;
  initiatorApprovalPolicy?: 'manual' | 'auto_approve';
  taskPageCode?: string;
  mode?: string;
  binding?: string;
  allowedOperations?: string[];
  operationPolicy?: PolicyMap;
  administration?: WorkflowApprovalAdministration;
  fieldPolicy?: { default?: string; fields?: Record<string, string> };
}
type BindingSource = { provider: string; scope?: { dimension: string; value?: string; valueFrom?: string } };
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: object, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const boundedList = (value: unknown, allowed: readonly string[], limit: number) => Array.isArray(value) && value.length > 0 && value.length <= limit && new Set(value).size === value.length && value.every(item => typeof item === 'string' && allowed.includes(item));

export function workflowNodeAllowedOperations(node: WorkflowAdministrationNodeSource): string[] {
  return node.allowedOperations || [...WORKFLOW_CONFIGURABLE_OPERATIONS];
}

function policyValid(value: unknown, operation: string, defaults: WorkflowNodeOperationPolicy = {}, configurable = false): boolean {
  if (!record(value) || !Object.keys(value).length || !keys(value, configurable ? ['enabled', 'label', 'commentRequired'] : ['label', 'commentRequired'])) return false;
  if (value.label !== undefined && (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 40 || /[\u0000-\u001f\u007f]/.test(value.label))) return false;
  if (value.enabled !== undefined && (typeof value.enabled !== 'boolean' || (['approve', 'reject'].includes(operation) && !value.enabled))) return false;
  if (value.commentRequired !== undefined && (typeof value.commentRequired !== 'boolean' || !['approve', 'reject'].includes(operation) || ((operation === 'reject' || defaults.commentRequired) && !value.commentRequired))) return false;
  return true;
}

/** Pure shared rule used before compilation, activation and configuration writes. */
export function validateWorkflowAdministration(definition: { nodes?: Record<string, WorkflowAdministrationNodeSource> }, bindings?: { bindings: Record<string, BindingSource> }): string[] {
  const errors: string[] = [];
  for (const [id, node] of Object.entries(definition?.nodes || {})) {
    if (!record(node)) continue;
    const admin = node.administration;
    const policy = node.operationPolicy;
    if (node.kind === 'cc') {
      if (policy !== undefined || admin !== undefined && (!record(admin) || !keys(admin, ['assigneeProviders']))) errors.push(`WORKFLOW_NODE_ADMINISTRATION_INVALID:${id}`);
      if (admin?.assigneeProviders !== undefined && !boundedList(admin.assigneeProviders, WORKFLOW_CONFIGURABLE_PROVIDERS, 3)) errors.push(`WORKFLOW_NODE_ADMINISTRATION_PROVIDERS_INVALID:${id}`);
      if (admin?.assigneeProviders?.includes('app_role_in_scope') && bindings && !bindings.bindings[node.binding || '']?.scope) errors.push(`WORKFLOW_NODE_ADMINISTRATION_SCOPE_REQUIRED:${id}`);
      continue;
    }
    if (node.kind !== 'approval') {
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

export function validateWorkflowNodeConfigurationPatch(node: WorkflowAdministrationNodeSource | undefined, binding: BindingSource | undefined, input: unknown): string[] {
  const errors: string[] = [];
  if (!node || !record(input) || !Object.keys(input).length || !keys(input, ['title', 'description', 'assignee', 'mode', 'operations'])) return ['WORKFLOW_V2_NODE_CONFIGURATION_PATCH_INVALID'];
  const patch = input as WorkflowNodeConfigurationPatch;
  for (const key of ['title', 'description'] as const) if (patch[key] !== undefined && (typeof patch[key] !== 'string' || patch[key]!.length > (key === 'title' ? 255 : 1000) || (key === 'title' && !patch[key]!.trim()))) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_PATCH_INVALID');
  const admin = node.administration;
  if (patch.mode !== undefined && (node.kind !== 'approval' || !admin?.modes?.includes(patch.mode))) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_MODE_READONLY');
  if (patch.operations !== undefined && (node.kind !== 'approval' || !record(patch.operations) || !Object.keys(patch.operations).length || Object.keys(patch.operations).length > 8 || Object.entries(patch.operations).some(([operation, value]) => !admin?.operations?.includes(operation as WorkflowConfigurableOperation) || !workflowNodeAllowedOperations(node).includes(operation) || !policyValid(value, operation, node.operationPolicy?.[operation as WorkflowConfigurableOperation], true)))) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_OPERATION_INVALID');
  if (patch.assignee !== undefined) {
    const value = patch.assignee;
    const allowed = admin?.assigneeProviders || (node.kind === 'approval' && binding && WORKFLOW_CONFIGURABLE_PROVIDERS.includes(binding.provider as any) ? [binding.provider] : []);
    if (!record(value) || !['approval', 'cc'].includes(node.kind) || !allowed.includes(value.provider) || (value.provider === 'app_role_in_scope' && !binding?.scope)) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_PROVIDER_READONLY');
    else if (value.provider === 'fixed_users') {
      if (!keys(value, ['provider', 'users']) || !Array.isArray(value.users) || (value.users.length < 1 && !(node.kind === 'approval' && node.emptyPolicy === 'skip')) || value.users.length > (node.kind === 'cc' ? 20 : 200) || new Set(value.users).size !== value.users.length || value.users.some(id => typeof id !== 'string' || !id.trim() || id.length > 255)) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_USERS_INVALID');
    } else if (!keys(value, ['provider', 'roleCode']) || typeof value.roleCode !== 'string' || !/^[a-z][a-z0-9_-]{0,127}$/.test(value.roleCode)) errors.push('WORKFLOW_V2_NODE_CONFIGURATION_ROLE_INVALID');
  }
  errors.push(...validateWorkflowInitiatorApprovalPolicy({ nodes: { node: { ...node, operationPolicy: projectWorkflowNodePolicy(node, patch).operationPolicy } } }));
  return errors;
}

/** Applies only validated fields; never mutates the immutable definition. */
export function projectWorkflowNodePolicy(node: WorkflowAdministrationNodeSource, patch?: WorkflowNodeConfigurationPatch | null) {
  const operations = Object.fromEntries(workflowNodeAllowedOperations(node).flatMap(operation => {
    const code = operation as WorkflowConfigurableOperation;
    const configured = patch?.operations?.[code];
    const policy = { ...node.operationPolicy?.[code], ...(configured?.label !== undefined ? { label: configured.label } : {}), ...(configured?.commentRequired !== undefined ? { commentRequired: configured.commentRequired } : {}) };
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
