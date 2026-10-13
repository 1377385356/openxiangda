import type { IsoDateTime, NativeAuthorizationMutationReceipt, NativeEnvironmentAuthorizationStateView } from '../types.js';
import type { WorkflowDesignerDraft } from './workflow-designer.js';
import type { WorkflowBinding, WorkflowDefinition } from '../types.js';

export const NATIVE_WORKFLOW_MANAGEMENT_ACTIONS = [
  'definition.read', 'draft.edit', 'publication.publish', 'handling.configure',
] as const;
export type NativeWorkflowManagementAction = (typeof NATIVE_WORKFLOW_MANAGEMENT_ACTIONS)[number];
export const WORKFLOW_DESIGNER_CLIENT_CONTRACT = 2 as const;
export const WORKFLOW_MANAGEMENT_LIMITS = { memberships: 400, grants: 512, targets: 200, receiptGrantIds: 8 } as const;

export interface NativeWorkflowManagementGrant {
  id: string;
  environmentId: string;
  subjectRoleCode: string;
  manageAllWorkflows: boolean;
  managedWorkflowCodes: string[];
  actions: NativeWorkflowManagementAction[];
  status: 'active' | 'revoked';
  revision: number;
  reason: string;
  createdBy: string;
  updatedBy: string;
  createdAt: IsoDateTime | null;
  updatedAt: IsoDateTime | null;
}
export interface NativeWorkflowManagementGrantPage {
  items: NativeWorkflowManagementGrant[];
  total: number;
  limit: number;
  offset: number;
}
export interface NativeWorkflowManagementGrantMutationResult {
  grant: NativeWorkflowManagementGrant;
  state: NativeEnvironmentAuthorizationStateView;
  receipt: NativeAuthorizationMutationReceipt;
}
export interface NativeWorkflowManagementAuthority {
  unrestricted: boolean;
  workflows: Array<{ workflowCode: string; actions: NativeWorkflowManagementAction[] }>;
}
export interface WorkflowManagementAdmission {
  kind: 'super_admin' | 'legacy_app_manage' | 'workflow_management_grant';
  grantIds: string[];
  more: boolean;
  evaluatedAt: IsoDateTime;
}
export interface WorkflowDesignerAuthority {
  actions: NativeWorkflowManagementAction[];
  admittedBy: 'unrestricted' | 'grant';
  evaluatedAt: IsoDateTime;
}
export interface WorkflowDesignerPublishedView {
  view: 'published';
  authority: WorkflowDesignerAuthority;
  workflowCode: string;
  environmentKey: string;
  headRevision: number;
  definitionVersion: number;
  bindingVersion: number;
  definition: WorkflowDefinition;
  binding: WorkflowBinding;
}
export interface WorkflowDesignerDraftView extends WorkflowDesignerDraft {
  view: 'draft';
  authority: WorkflowDesignerAuthority;
}
export type WorkflowDesignerRead = WorkflowDesignerPublishedView | WorkflowDesignerDraftView;
export type WorkflowDesignerOriginalOutcome =
  | { state: 'committed'; operationKind: string; committedAt: IsoDateTime; draftRevision?: number; publicationId?: string }
  | { state: 'not_committed' }
  | { state: 'undetermined' };

/** Presentation-only union. Unknown actions never grant a control. */
export function workflowManagementActions(values: readonly unknown[]): NativeWorkflowManagementAction[] {
  const held = new Set(values.filter((value): value is NativeWorkflowManagementAction =>
    NATIVE_WORKFLOW_MANAGEMENT_ACTIONS.includes(value as NativeWorkflowManagementAction)));
  if (held.size) held.add('definition.read');
  return NATIVE_WORKFLOW_MANAGEMENT_ACTIONS.filter(action => held.has(action));
}

/** Grant shape validation is strict; the server still validates live roles/workflows. */
export function isWorkflowManagementGrantRequest(value: unknown): value is {
  subjectRoleCode: string; manageAllWorkflows: boolean; managedWorkflowCodes: string[];
  actions: NativeWorkflowManagementAction[]; reason: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  const role = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
  const workflow = /^[a-z][a-z0-9_-]{0,127}$/;
  return typeof request.subjectRoleCode === 'string' && request.subjectRoleCode.length <= 100 && role.test(request.subjectRoleCode) &&
    typeof request.manageAllWorkflows === 'boolean' && Array.isArray(request.managedWorkflowCodes) &&
    request.managedWorkflowCodes.length <= WORKFLOW_MANAGEMENT_LIMITS.targets &&
    (request.manageAllWorkflows ? request.managedWorkflowCodes.length === 0 : request.managedWorkflowCodes.length > 0) &&
    request.managedWorkflowCodes.every(code => typeof code === 'string' && workflow.test(code)) &&
    new Set(request.managedWorkflowCodes).size === request.managedWorkflowCodes.length &&
    Array.isArray(request.actions) && request.actions.length > 0 && request.actions.length <= NATIVE_WORKFLOW_MANAGEMENT_ACTIONS.length &&
    request.actions.every(action => NATIVE_WORKFLOW_MANAGEMENT_ACTIONS.includes(action)) && new Set(request.actions).size === request.actions.length &&
    typeof request.reason === 'string' && request.reason.trim().length > 0 && request.reason.length <= 1000 &&
    Object.keys(request).every(key => ['subjectRoleCode', 'manageAllWorkflows', 'managedWorkflowCodes', 'actions', 'reason'].includes(key));
}
