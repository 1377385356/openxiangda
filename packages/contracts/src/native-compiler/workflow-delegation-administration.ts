import type { WorkflowDelegation } from '../types.js';

export const WORKFLOW_DELEGATION_ADMINISTRATION_SCHEMA = 'openxiangda.workflow-delegation-administration/v2';
export const WORKFLOW_DELEGATION_MUTATION_SCHEMA = 'openxiangda.workflow-delegation-mutation/v2';
export const WORKFLOW_DELEGATION_PREVIEW_SCHEMA = 'openxiangda.workflow-delegation-preview/v2';
export const WORKFLOW_DELEGATION_RECEIPT_SCHEMA = 'openxiangda.workflow-delegation-receipt/v2';

export type WorkflowDelegationEffectiveState = 'active' | 'scheduled' | 'expired' | 'revoked' | 'ineligible';
export interface WorkflowDelegationAdministration extends Omit<WorkflowDelegation, 'schemaVersion'> {
  schemaVersion: typeof WORKFLOW_DELEGATION_ADMINISTRATION_SCHEMA;
  revision: number;
  roleCode: string;
  roleName: string;
  delegatorDisplayName: string;
  delegateDisplayName: string;
  delegatorRoleSubjectRevision: number;
  delegateRoleSubjectRevision: number;
  effectiveState: WorkflowDelegationEffectiveState;
  evaluatedAt: string;
  issues: string[];
  canRevoke: boolean;
  revokedBy: string | null;
  revokeReason: string | null;
  taskPolicy: 'future-assignments-only';
}
interface WorkflowDelegationMutationBase {
  schemaVersion: typeof WORKFLOW_DELEGATION_MUTATION_SCHEMA;
  operationId: string;
  environmentKey: 'preproduction' | 'production';
  reason: string;
}
export type WorkflowDelegationMutationRequest = WorkflowDelegationMutationBase & (
  | { operation: 'create'; workflowCode: string | null; nodeId?: string | null; delegatorRoleSubjectKey: string; expectedDelegatorRevision: number;
      delegateUserId: string; delegateRoleSubjectKey: string; expectedDelegateRevision: number; validFrom: string; validTo: string }
  | { operation: 'revoke'; delegationId: string; expectedRevision: number }
);
export type WorkflowDelegationMutationIntent =
  | Omit<Extract<WorkflowDelegationMutationRequest, { operation: 'create' }>, 'environmentKey'>
  | Omit<Extract<WorkflowDelegationMutationRequest, { operation: 'revoke' }>, 'environmentKey'>;
export interface WorkflowDelegationMutationPreview {
  schemaVersion: typeof WORKFLOW_DELEGATION_PREVIEW_SCHEMA;
  operationId: string;
  operation: 'create' | 'revoke';
  requestDigest: string;
  before: WorkflowDelegationAdministration | null;
  /** Proposed creates have no persisted id. */
  after: Omit<WorkflowDelegationAdministration, 'id'> & { id: string | null };
  taskPolicy: 'future-assignments-only';
}
export interface WorkflowDelegationMutationReceipt {
  schemaVersion: typeof WORKFLOW_DELEGATION_RECEIPT_SCHEMA;
  operationId: string;
  operation: 'create' | 'revoke';
  requestDigest: string;
  actorUserId: string;
  appCode: string;
  environmentKey: string;
  committedAt: string;
  delegation: WorkflowDelegationAdministration;
  taskPolicy: 'future-assignments-only';
}
export interface WorkflowDelegationListQuery {
  all?: boolean;
  workflowCode?: string;
  roleCode?: string;
  effectiveState?: WorkflowDelegationEffectiveState;
  keyword?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}
export interface WorkflowDelegationSource {
  roleSubjectKey: string;
  roleSubjectRevision: number;
  roleCode: string;
  roleName: string;
  validFrom: string | null;
  validTo: string | null;
  /** Only the current user's delegatable approval duties, deduplicated by workflow/node. */
  nodeScopes?: Array<{ workflowCode: string; nodeId: string; title: string }>;
}
export interface WorkflowDelegationCatalog {
  appCode: string;
  environmentKey: 'preproduction' | 'production';
  actorUserId: string;
  canReadAll: boolean;
  canCreate: boolean;
  sources: WorkflowDelegationSource[];
  workflows: Array<{ code: string; title: string }>;
  evaluatedAt: string;
  taskPolicy: 'future-assignments-only';
}
export interface WorkflowDelegationCandidateQuery {
  delegatorRoleSubjectKey: string;
  validFrom: string;
  validTo: string;
  workflowCode?: string;
  nodeId?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}
export interface WorkflowDelegationCandidate {
  userId: string;
  displayName: string;
  roleSubjectKey: string;
  roleSubjectRevision: number;
  roleCode: string;
  roleName: string;
  validFrom: string | null;
  validTo: string | null;
}
export interface WorkflowDelegationPage {
  items: WorkflowDelegationAdministration[];
  total: number;
  limit: number;
  offset: number;
  evaluatedAt: string;
}
export interface WorkflowDelegationCandidatePage {
  items: WorkflowDelegationCandidate[];
  total: number;
  limit: number;
  offset: number;
  evaluatedAt: string;
}

const uuid = { type: 'string', format: 'uuid', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' } as const;
const text = { type: 'string', minLength: 1, maxLength: 255 } as const;
const date = { type: 'string', format: 'date-time' } as const;
const positive = { type: 'integer', minimum: 1 } as const;
const nullableDate = { anyOf: [date, { type: 'null' }] } as const;
const nullableText = { anyOf: [text, { type: 'null' }] } as const;
const nodeId = { anyOf: [{ type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$' }, { type: 'null' }] } as const;
const subject = { type: 'string', pattern: '^membership:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' } as const;
const taskPolicy = { const: 'future-assignments-only' } as const;
export const workflowDelegationAdministrationProperties = {
  schemaVersion: { const: WORKFLOW_DELEGATION_ADMINISTRATION_SCHEMA }, id: uuid, appCode: text, environmentKey: text,
  workflowCode: nullableText, nodeId, delegatorUserId: text, delegateUserId: text,
  delegatorRoleSubjectKey: subject, delegateRoleSubjectKey: subject, validFrom: date, validTo: date,
  status: { enum: ['active', 'revoked', 'expired'] }, reason: { type: 'string', minLength: 1, maxLength: 4000 },
  createdBy: text, createdAt: date, revokedAt: nullableDate, revision: positive, roleCode: text, roleName: text,
  delegatorDisplayName: text, delegateDisplayName: text, delegatorRoleSubjectRevision: positive, delegateRoleSubjectRevision: positive,
  effectiveState: { enum: ['active', 'scheduled', 'expired', 'revoked', 'ineligible'] }, evaluatedAt: date,
  issues: { type: 'array', maxItems: 20, uniqueItems: true, items: text }, canRevoke: { type: 'boolean' },
  revokedBy: nullableText, revokeReason: { type: ['string', 'null'], maxLength: 4000 }, taskPolicy,
} as const;
const administrationShape = {
  type: 'object', additionalProperties: false,
  required: Object.keys(workflowDelegationAdministrationProperties).filter(key => key !== 'nodeId'), properties: workflowDelegationAdministrationProperties,
} as const;
export const workflowDelegationAdministrationSchema = { $id: WORKFLOW_DELEGATION_ADMINISTRATION_SCHEMA, ...administrationShape } as const;
const mutationBase = {
  schemaVersion: { const: WORKFLOW_DELEGATION_MUTATION_SCHEMA }, operationId: uuid,
  environmentKey: { enum: ['preproduction', 'production'] }, reason: { type: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' },
} as const;
const createProperties = {
  ...mutationBase, operation: { const: 'create' }, workflowCode: nullableText, nodeId,
  delegatorRoleSubjectKey: subject, expectedDelegatorRevision: positive,
  delegateUserId: text, delegateRoleSubjectKey: subject, expectedDelegateRevision: positive, validFrom: date, validTo: date,
} as const;
const revokeProperties = {
  ...mutationBase, operation: { const: 'revoke' }, delegationId: uuid, expectedRevision: positive,
} as const;
export const workflowDelegationMutationRequestSchema = {
  $id: WORKFLOW_DELEGATION_MUTATION_SCHEMA,
  type: 'object',
  oneOf: [
    { type: 'object', additionalProperties: false, required: Object.keys(createProperties).filter(key => key !== 'nodeId'), properties: createProperties,
      if: { required: ['nodeId'], properties: { nodeId: { type: 'string' } } }, then: { properties: { workflowCode: text } } },
    { type: 'object', additionalProperties: false, required: Object.keys(revokeProperties), properties: revokeProperties },
  ],
} as const;
const digest = { type: 'string', pattern: '^[0-9a-f]{64}$' } as const;
export const workflowDelegationMutationPreviewSchema = {
  $id: WORKFLOW_DELEGATION_PREVIEW_SCHEMA, type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'operationId', 'operation', 'requestDigest', 'before', 'after', 'taskPolicy'],
  properties: {
    schemaVersion: { const: WORKFLOW_DELEGATION_PREVIEW_SCHEMA }, operationId: uuid, operation: { enum: ['create', 'revoke'] }, requestDigest: digest,
    before: { anyOf: [administrationShape, { type: 'null' }] },
    after: { ...administrationShape, properties: { ...workflowDelegationAdministrationProperties, id: { anyOf: [uuid, { type: 'null' }] } } }, taskPolicy,
  },
} as const;
export const workflowDelegationMutationReceiptSchema = {
  $id: WORKFLOW_DELEGATION_RECEIPT_SCHEMA, type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'operationId', 'operation', 'requestDigest', 'actorUserId', 'appCode', 'environmentKey', 'committedAt', 'delegation', 'taskPolicy'],
  properties: {
    schemaVersion: { const: WORKFLOW_DELEGATION_RECEIPT_SCHEMA }, operationId: uuid, operation: { enum: ['create', 'revoke'] }, requestDigest: digest,
    actorUserId: text, appCode: text, environmentKey: text, committedAt: date,
    delegation: administrationShape, taskPolicy,
  },
} as const;
