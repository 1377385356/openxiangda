import type { WorkflowApprovalMode, WorkflowBinding, WorkflowDefinition, WorkflowNodeOperationPolicy, WorkflowConfigurableOperation } from '../types.js';
import { validateWorkflowDesignerCapabilities,validateWorkflowDesignerDocument } from './workflow-designer.js';
import { workflowAuthoringCatalog } from './workflow-authoring.js';
import { workflowBindingRoleCodes } from './workflow-role-union.js';

export const WORKFLOW_SOURCE_BUNDLE_SCHEMA = 'openxiangda.workflow-source-bundle/v1';
export const WORKFLOW_SOURCE_BUNDLE_MAX_BYTES = 3 * 1024 * 1024;
export interface WorkflowSourceDigests { definitionDigest: string; bindingDigest: string }
export interface WorkflowSourceReferences {
  taskPages: Array<{ code: string; digest: string }>;
  steps: Array<{ code: string; version: number; digest: string }>;
  bindingKeys: string[];
  roles: string[];
}
export interface WorkflowSourceHandling {
  mode?: WorkflowApprovalMode;
  operations?: Partial<Record<WorkflowConfigurableOperation, Omit<WorkflowNodeOperationPolicy,'minimumOpinion'> & { enabled?: boolean }>>;
  assignee?: { kind: 'roles'; roleCodes: string[] } | { kind: 'named_people'; count: number };
}
export interface WorkflowSourceBundle {
  schemaVersion: typeof WORKFLOW_SOURCE_BUNDLE_SCHEMA;
  appCode: string;
  workflowCode: string;
  origin: WorkflowSourceDigests & { environmentKey: string; headRevision: number; definitionVersion: number; bindingVersion: number; handlingDigest: string; catalogDigest: string };
  definition: WorkflowDefinition;
  binding: WorkflowBinding;
  references: WorkflowSourceReferences;
  handling: Record<string,WorkflowSourceHandling>;
}
export interface WorkflowSourceLock {
  schemaVersion: 'openxiangda.workflow-source-lock/v1';
  workflowCode: string;
  base: WorkflowSourceDigests & { definitionVersion: number; bindingVersion: number };
  origin: { environmentKey: string; headRevision: number };
}
export interface WorkflowRegistrationPlan {
  workflowCode: string;
  definition: { resolution: 'existing' | 'suggested'; number: number; digest: string };
  binding: { resolution: 'existing' | 'suggested'; number: number; digest: string };
  observedHead: (WorkflowSourceDigests & { revision: number }) | null;
}
export interface WorkflowSourceSyncRequest {
  fromEnvironment: 'preproduction' | 'production';
  toEnvironment: 'preproduction' | 'production';
  expectedSourceHeadRevision: number;
  expectedTargetHeadRevision: number;
  operationId: string;
  reason: string;
  scope?: 'running_and_new' | 'new_only';
  acknowledgeExceptions?: boolean;
  copyHandlingDefaults?: boolean;
}
export type WorkflowSourceStatus = 'in_sync' | 'behind' | 'ahead' | 'diverged' | 'not_active';
export const workflowSourceDigestEqual = (a: string,b: string) => a.replace(/^sha256:/,'') === b.replace(/^sha256:/,'');
const equalPair = (a: WorkflowSourceDigests,b: WorkflowSourceDigests) => workflowSourceDigestEqual(a.definitionDigest,b.definitionDigest) && workflowSourceDigestEqual(a.bindingDigest,b.bindingDigest);
const record = (value: unknown): value is Record<string,any> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: unknown,keys: string[]): value is Record<string,any> => record(value) && Object.keys(value).every(key => keys.includes(key) && !['__proto__','constructor','prototype'].includes(key));
const code = (value: unknown) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value);
const digestValue = (value: unknown) => typeof value === 'string' && /^(sha256:)?[a-f0-9]{64}$/.test(value);

/** Only source contracts enter this catalog, never directory results or runtime state. */
export function workflowSourceReferences(definition: WorkflowDefinition,binding: WorkflowBinding,digest: (value: unknown) => string): WorkflowSourceReferences {
  const pages = new Set(Object.values(definition.nodes).flatMap(node => 'taskPageCode' in node && node.taskPageCode ? [node.taskPageCode] : []));
  const steps = new Map<string,{ code: string; version: number; digest: string }>();
  for (const node of Object.values(definition.nodes)) if (node.kind === 'action') steps.set(`${node.handler.code}@${node.handler.version}`,{ code: node.handler.code,version: node.handler.version,digest: digest({ handler: node.handler,inputSchema: node.inputSchema,outputSchema: node.outputSchema }) });
  return { taskPages: [...pages].sort().map(code => ({ code,digest: digest(definition.taskPages?.[code]) })),steps: [...steps.values()].sort((a,b) => a.code.localeCompare(b.code) || a.version-b.version),
    bindingKeys: Object.keys(binding.bindings).sort(),roles: [...new Set(Object.values(binding.bindings).flatMap(workflowBindingRoleCodes))].sort() };
}
export function validateWorkflowSourceBundle(value: unknown,digest: (value: unknown) => string): string[] {
  try { return validateSourceBundle(value,digest); }
  catch { return ['WORKFLOW_BUNDLE_CORRUPT']; }
}
function validateSourceBundle(value: unknown,digest: (value: unknown) => string): string[] {
  const errors: string[] = [];
  if (!exact(value,['schemaVersion','appCode','workflowCode','origin','definition','binding','references','handling']) || value.schemaVersion !== WORKFLOW_SOURCE_BUNDLE_SCHEMA || !code(value.appCode) || !code(value.workflowCode)) return ['WORKFLOW_BUNDLE_CORRUPT'];
  if (new TextEncoder().encode(JSON.stringify(value)).length > WORKFLOW_SOURCE_BUNDLE_MAX_BYTES) return ['WORKFLOW_BUNDLE_TOO_LARGE'];
  const bundle = value as unknown as WorkflowSourceBundle,origin = bundle.origin;
  if (!exact(origin,['environmentKey','headRevision','definitionVersion','bindingVersion','definitionDigest','bindingDigest','handlingDigest','catalogDigest']) || !['preproduction','production'].includes(origin.environmentKey) ||
    ![origin.headRevision,origin.definitionVersion,origin.bindingVersion].every(number => Number.isSafeInteger(number) && number >= 1) || ![origin.definitionDigest,origin.bindingDigest,origin.handlingDigest,origin.catalogDigest].every(digestValue)) return ['WORKFLOW_BUNDLE_CORRUPT'];
  if (!record(bundle.definition?.nodes) || !record(bundle.binding?.bindings) || bundle.definition.code !== bundle.workflowCode || bundle.binding.workflowCode !== bundle.workflowCode) return ['WORKFLOW_BUNDLE_CORRUPT'];
  if (validateWorkflowDesignerDocument(bundle.definition).length) errors.push('WORKFLOW_BUNDLE_DEFINITION_INVALID');
  if (!workflowSourceDigestEqual(digest(bundle.definition),origin.definitionDigest) || !workflowSourceDigestEqual(digest(bundle.binding),origin.bindingDigest) || !workflowSourceDigestEqual(digest(bundle.handling),origin.handlingDigest) || !workflowSourceDigestEqual(digest(bundle.references),origin.catalogDigest)) errors.push('WORKFLOW_BUNDLE_CORRUPT');
  if (!workflowSourceDigestEqual(digest(workflowSourceReferences(bundle.definition,bundle.binding,digest)),digest(bundle.references))) errors.push('WORKFLOW_BUNDLE_CATALOG_CORRUPT');
  if (!record(bundle.handling) || Object.keys(bundle.handling).length > 200) errors.push('WORKFLOW_BUNDLE_HANDLING_INVALID');
  else for (const [id,handling] of Object.entries(bundle.handling)) {
    if (!bundle.definition.nodes[id] || !exact(handling,['mode','operations','assignee'])) { errors.push('WORKFLOW_BUNDLE_HANDLING_INVALID');continue; }
    if (handling.mode !== undefined && !['single','any','all','sequence'].includes(handling.mode)) errors.push('WORKFLOW_BUNDLE_HANDLING_INVALID');
    if (handling.operations !== undefined) {
      const names = ['complete','approve','reject','save_form','return','transfer','delegate','add_assignee'];
      if (!exact(handling.operations,names)) errors.push('WORKFLOW_BUNDLE_HANDLING_INVALID');
      else for (const operation of Object.values(handling.operations)) {
        if (!exact(operation,['enabled','label','opinion','commentRequired','reasonRequired']) ||
          operation.enabled !== undefined && typeof operation.enabled !== 'boolean' ||
          operation.commentRequired !== undefined && typeof operation.commentRequired !== 'boolean' ||
          operation.reasonRequired !== undefined && typeof operation.reasonRequired !== 'boolean' ||
          operation.label !== undefined && (typeof operation.label !== 'string' || !operation.label.trim() || operation.label.length > 255) ||
          operation.opinion !== undefined && !['none','optional','required'].includes(operation.opinion)) errors.push('WORKFLOW_BUNDLE_HANDLING_INVALID');
      }
    }
    const assignee = handling.assignee;
    if (assignee && (assignee.kind === 'named_people' ? !exact(assignee,['kind','count']) || !Number.isSafeInteger(assignee.count) || assignee.count < 0 || assignee.count > 200 :
      assignee.kind === 'roles' ? !exact(assignee,['kind','roleCodes']) || !Array.isArray(assignee.roleCodes) || assignee.roleCodes.length > 200 || !assignee.roleCodes.every(code) : true)) errors.push('WORKFLOW_BUNDLE_HANDLING_INVALID');
  }
  return [...new Set(errors)];
}
export function workflowSourceStatus(input: { declared: WorkflowSourceDigests; base?: WorkflowSourceDigests; activeDeclaration?: WorkflowSourceDigests; head: WorkflowSourceDigests | null }): WorkflowSourceStatus {
  if (!input.head) return 'not_active';
  if (equalPair(input.declared,input.head)) return 'in_sync';
  const base=input.base || input.activeDeclaration;
  if (base && equalPair(base,input.head)) return 'ahead';
  return !base || equalPair(input.declared,base) ? 'behind' : 'diverged';
}
/** The deployment job persists the resulting head revision; observations never modify package bytes. */
export function classifyWorkflowSourceDeployment(input: { declared: WorkflowSourceDigests; base?: WorkflowSourceDigests; head: WorkflowSourceDigests | null; activeDeclaration?: WorkflowSourceDigests }): 'preserve' | 'reuse' | 'advance' | 'diverged' {
  if (!input.head) return 'advance';
  if (equalPair(input.declared,input.head)) return 'reuse';
  if (input.activeDeclaration && equalPair(input.declared,input.activeDeclaration)) return 'preserve';
  if (input.base && equalPair(input.base,input.head) || input.activeDeclaration && equalPair(input.activeDeclaration,input.head)) return 'advance';
  return 'diverged';
}
export function workflowSourceImportDrift(localDefinition: WorkflowDefinition,localBinding: WorkflowBinding,bundle: WorkflowSourceBundle,digest: (value: unknown) => string): string[] {
  const errors = validateWorkflowSourceBundle(bundle,digest);
  if (errors.length) return errors;
  errors.push(...validateWorkflowDesignerCapabilities(localDefinition,bundle.definition,localBinding,bundle.binding).map(error => `WORKFLOW_IMPORT_CODE_OWNED_DRIFT:${error}`));
  for (const page of bundle.references.taskPages) if (!localDefinition.taskPages?.[page.code] || !workflowSourceDigestEqual(digest(localDefinition.taskPages[page.code]),page.digest)) errors.push(`WORKFLOW_IMPORT_CODE_OWNED_DRIFT:taskPage:${page.code}`);
  const releasedSteps = workflowAuthoringCatalog(localDefinition,localBinding).steps.map(step => ({code:step.handler.code,version:step.handler.version,digest:digest({handler:step.handler,inputSchema:step.inputSchema,outputSchema:step.outputSchema})}));
  for (const step of bundle.references.steps) if (!releasedSteps.some(candidate => candidate.code === step.code && candidate.version === step.version && workflowSourceDigestEqual(candidate.digest,step.digest))) errors.push(`WORKFLOW_IMPORT_CODE_OWNED_DRIFT:step:${step.code}@${step.version}`);
  return [...new Set(errors)];
}
