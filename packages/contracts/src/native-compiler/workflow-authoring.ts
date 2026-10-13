import type { WorkflowBinding, WorkflowBindingEntry, WorkflowDefinition, WorkflowHumanNode, WorkflowNode, WorkflowConfigurableOperation, WorkflowApprovalMode, WorkflowConfigurableAssigneeProvider, WorkflowFieldPolicy } from '../types.js';
import type { WorkflowBusinessStepNode } from './workflow-business-step.js';
import { validateWorkflowConditionalAssignment, workflowAssignmentLeaves } from './workflow-conditional-assignment.js';
import { isWorkflowPlatformNotify } from './workflow-platform-notify.js';
import { workflowOperationMinimumOpinion, workflowOperationOpinion } from './workflow-node-administration.js';

/** Released source declaration, including capabilities not yet used by the workflow. */
export interface WorkflowAuthoring {
  businessSteps?: Array<Omit<WorkflowBusinessStepNode, 'id' | 'kind' | 'next' | 'inputs' | 'notification'>>;
}
export interface WorkflowDesignerCatalog {
  /** Explicit server capability; absence must fail closed. */
  conditionalAssignments?: true;
  appVersionId: string;
  digest: string;
  taskPages: NonNullable<WorkflowDefinition['taskPages']>;
  steps: NonNullable<WorkflowAuthoring['businessSteps']>;
  peopleSources: WorkflowBinding['bindings'];
}
export const workflowCanvasBindingKey = (id: string) => `canvas_${id}`;
export const workflowHumanOperations = (kind: 'approval' | 'handle', hasPage: boolean): WorkflowConfigurableOperation[] => [
  ...(kind === 'approval' ? ['approve', 'reject'] as const : ['complete'] as const),
  ...(hasPage ? ['save_form'] as const : []), 'return', 'transfer', 'delegate', ...(kind === 'approval' ? ['add_assignee'] as const : []),
];
export function workflowAuthoringCatalog(definition: WorkflowDefinition, binding: WorkflowBinding, appVersionId = '', digest = ''): WorkflowDesignerCatalog {
  const steps = new Map<string, WorkflowDesignerCatalog['steps'][number]>();
  for (const node of [...Object.values(definition.nodes), ...definition.authoring?.businessSteps || []]) {
    if (!('handler' in node) || isWorkflowPlatformNotify(node)) continue;
    steps.set(`${node.handler.code}@${node.handler.version}`, { title: node.title, handler: node.handler, inputSchema: node.inputSchema, outputSchema: node.outputSchema });
  }
  return { appVersionId, digest, taskPages: definition.taskPages || {}, steps: [...steps.values()], peopleSources: binding.bindings };
}
/** Standard blank nodes do not borrow authority from a previous human node. */
export function createWorkflowHumanNode(id: string, kind: 'approval' | 'handle' | 'cc', title: string, next: string, pageCode?: string, pages: WorkflowDesignerCatalog['taskPages'] = {}, rejectTarget = next): WorkflowNode {
  const binding = workflowCanvasBindingKey(id);
  if (kind === 'cc') return { id, kind, title, next, binding, emptyPolicy: 'block', notify: true, administration: { assigneeProviders: ['fixed_users', 'app_role'] } };
  const page = pageCode ? pages[pageCode] : undefined;
  const operations = workflowHumanOperations(kind, !!page);
  const human = { id, title, binding, mode: 'single' as const, allowedOperations: operations, requiredOperations: [kind === 'approval' ? 'approve' as const : 'complete' as const],
    administration: { modes: ['single', 'any', 'all', 'sequence'] as WorkflowApprovalMode[], assigneeProviders: ['fixed_users', 'app_role'] as WorkflowConfigurableAssigneeProvider[], operations },
    fieldPolicy: { default: 'readonly' as const, fields: Object.fromEntries((page?.fields || []).map(field => [field.code, field.readonly ? 'readonly' : field.required ? 'edit_required' : 'edit'])) as Record<string,WorkflowFieldPolicy> },
    operationPolicy: { ...(kind === 'approval' ? { approve: { opinion: 'optional' as const, minimumOpinion: 'optional' as const }, reject: { opinion: 'required' as const, minimumOpinion: 'required' as const } } : { complete: { opinion: 'optional' as const, minimumOpinion: 'optional' as const } }),
      return: { opinion: 'required' as const, minimumOpinion: 'required' as const }, transfer: { opinion: 'required' as const, minimumOpinion: 'required' as const }, delegate: { opinion: 'required' as const, minimumOpinion: 'required' as const }, ...(kind === 'approval' ? { add_assignee: { opinion: 'required' as const, minimumOpinion: 'required' as const } } : {}) },
    ...(page ? { taskPageCode: pageCode } : {}) };
  return (kind === 'approval' ? { ...human, kind, onApprove: next, onReject: rejectTarget } : { ...human, kind, next }) as WorkflowNode;
}
const same = (a: unknown, b: unknown): boolean => {
  const sort = (v: any): any => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(key => v[key] !== undefined).map(key => [key, sort(v[key])])) : v;
  return JSON.stringify(sort(a)) === JSON.stringify(sort(b));
};
export function validateWorkflowCanvasHuman(node: WorkflowNode, catalog: WorkflowDesignerCatalog): string[] {
  if (!['approval', 'handle', 'cc'].includes(node.kind) || !('binding' in node) || node.binding !== workflowCanvasBindingKey(node.id)) return ['WORKFLOW_DESIGNER_CANVAS_BINDING_REQUIRED'];
  if (node.kind === 'cc') return same(node.administration, { assigneeProviders: ['fixed_users', 'app_role'] }) ? [] : ['WORKFLOW_DESIGNER_CODE_OWNED:administration'];
  if (node.kind !== 'approval' && node.kind !== 'handle') return [];
  const standard = createWorkflowHumanNode(node.id, node.kind, node.title, '', node.taskPageCode, catalog.taskPages) as WorkflowHumanNode;
  const errors: string[] = [];
  for (const key of ['administration', 'requiredOperations'] as const) if (!same(node[key], standard[key])) errors.push(`WORKFLOW_DESIGNER_CODE_OWNED:${node.id}.${key}`);
  if (node.taskPageCode && !catalog.taskPages[node.taskPageCode]) errors.push(`WORKFLOW_DESIGNER_PAGE_UNRELEASED:${node.id}`);
  const ceiling = standard.fieldPolicy!;
  if (node.fieldPolicy?.default && node.fieldPolicy.default !== 'readonly') errors.push(`WORKFLOW_DESIGNER_FIELD_CEILING:${node.id}`);
  for (const [code, policy] of Object.entries(node.fieldPolicy?.fields || {})) if (!(code in ceiling.fields!) || !['readonly', 'edit', 'edit_required'].includes(policy) || ['edit','edit_required'].includes(policy) && ceiling.fields![code] === 'readonly') errors.push(`WORKFLOW_DESIGNER_FIELD_CEILING:${node.id}.${code}`);
  const operations = workflowHumanOperations(node.kind, !!node.taskPageCode);
  if ((node.allowedOperations || operations).some(operation => !operations.includes(operation as WorkflowConfigurableOperation))) errors.push(`WORKFLOW_DESIGNER_OPERATION_NOT_ALLOWED:${node.id}`);
  for (const [operation, policy] of Object.entries(node.operationPolicy || {})) {
    const baseline = standard.operationPolicy?.[operation as WorkflowConfigurableOperation];
    if (!operations.includes(operation as WorkflowConfigurableOperation) || !same(policy.minimumOpinion, baseline?.minimumOpinion) || ['none','optional','required'].indexOf(workflowOperationOpinion(operation, policy)) < ['none','optional','required'].indexOf(workflowOperationMinimumOpinion(operation, baseline))) errors.push(`WORKFLOW_DESIGNER_OPINION_MINIMUM:${node.id}.${operation}`);
  }
  return errors;
}
/** New bindings can select principals or reuse a released source, never invent a provider implementation. */
export function validateWorkflowCanvasBinding(entry: WorkflowBindingEntry, catalog: WorkflowDesignerCatalog, incomplete = false, context?: { definition: WorkflowDefinition; nodeId: string }): string[] {
  if (entry.provider === 'conditional') {
    if (!catalog.conditionalAssignments || !context) return ['WORKFLOW_DESIGNER_CONDITIONAL_ASSIGNMENT_UNAVAILABLE'];
    const node = context.definition.nodes[context.nodeId];
    if (!node || !['approval', 'handle'].includes(node.kind)) return ['WORKFLOW_CONDITIONAL_HUMAN_REQUIRED'];
    if ('emptyPolicy' in node && node.emptyPolicy === 'skip') return ['WORKFLOW_APPROVAL_EMPTY_PROVIDER_UNSUPPORTED'];
    let releasedSources: Record<string, import('../types.js').WorkflowStandardBindingEntry>;
    try { releasedSources = Object.fromEntries(Object.entries(catalog.peopleSources).flatMap(([key, source]) => workflowAssignmentLeaves(source).map((leaf, index) => [`${key}/${index}`, leaf]))); }
    catch { return ['WORKFLOW_CONDITIONAL_BINDING_INVALID']; }
    return validateWorkflowConditionalAssignment(entry, {
      ...context, releasedSources, standardProviders: ['fixed_users', 'app_role'],
    }, { allowIncomplete: incomplete });
  }
  if (Object.values(catalog.peopleSources).some(source => same(source, entry))) return [];
  const keys = Object.keys(entry);
  if (entry.provider === 'fixed_users' && keys.every(key => ['provider', 'users'].includes(key)) && Array.isArray(entry.users) && entry.users.length <= 200 && (incomplete || entry.users.length > 0) && new Set(entry.users).size === entry.users.length && entry.users.every(id => typeof id === 'string' && !!id.trim() && id.length <= 255)) return [];
  if (entry.provider === 'app_role' && keys.every(key => ['provider', 'roleCode', 'roleCodes'].includes(key))) {
    const roles = entry.roleCodes || (entry.roleCode ? [entry.roleCode] : []);
    if (!(entry.roleCode && entry.roleCodes) && (incomplete || roles.length > 0) && roles.length <= 8 && new Set(roles).size === roles.length && roles.every(role => /^[a-z][a-z0-9_-]{0,127}$/.test(role))) return [];
  }
  return ['WORKFLOW_DESIGNER_BINDING_UNRELEASED'];
}

/** Only unreferenced new canvas bindings are removed; released bindings keep their source identity. */
export function pruneWorkflowCanvasBindings(definition: WorkflowDefinition, binding: WorkflowBinding, published: WorkflowBinding): WorkflowBinding {
  return {...binding,bindings:Object.fromEntries(Object.entries(binding.bindings).filter(([key])=>Object.hasOwn(published.bindings,key)||!key.startsWith('canvas_')||Object.values(definition.nodes).some(node=>'binding' in node&&node.binding===key)))};
}
