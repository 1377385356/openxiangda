/** Fixed, code-owned approval effect. Authorization remains owned by the platform. */
export interface WorkflowApprovedDelegationPolicy {
  confirmationNodeId: string;
  confirmer: 'initiator' | 'delegate';
  requestsField: string;
  maxRequests: number;
}

export interface WorkflowApprovedDelegationRequest {
  key?: string;
  delegatorRoleSubjectKey: string;
  delegatorRoleSubjectRevision: number;
  delegate: { value: string; label: string };
  delegateRoleSubjectKey: string;
  expectedDelegateRevision: number;
  workflowCode: string | null;
  nodeId: string | null;
  validFrom: string;
  validTo: string;
  reason: string;
}

type Definition = {
  approvedDelegation?: WorkflowApprovedDelegationPolicy;
  startAt: string;
  inputSchema: Record<string, any>;
  nodes: Record<string, any>;
  subject?: { factProjection: Record<string, string> };
};
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const field = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const code = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const membership = /^membership:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const WORKFLOW_APPROVED_DELEGATION_MAX_REQUESTS = 500;
export const WORKFLOW_APPROVED_DELEGATION_MAX_BYTES = 256 * 1024;

export function validateWorkflowApprovedDelegation(definition: Definition): string[] {
  if (definition?.approvedDelegation === undefined) return [];
  const policy = definition.approvedDelegation;
  if (!object(policy) || Object.keys(policy).some(key => !['confirmationNodeId', 'confirmer', 'requestsField', 'maxRequests'].includes(key)) ||
    !code.test(policy.confirmationNodeId || '') || !['initiator', 'delegate'].includes(policy.confirmer) ||
    !field.test(policy.requestsField || '') || !Number.isSafeInteger(policy.maxRequests) || policy.maxRequests < 1 || policy.maxRequests > WORKFLOW_APPROVED_DELEGATION_MAX_REQUESTS) return ['WORKFLOW_APPROVED_DELEGATION_POLICY_INVALID'];
  const errors: string[] = [];
  const node = definition.nodes?.[policy.confirmationNodeId];
  if (!node || node.kind !== 'approval' || node.mode !== 'single' || node.emptyPolicy === 'skip' || node.initiatorApprovalPolicy === 'auto_approve' || node.completionDeadline ||
    node.administration?.assigneeProviders?.length || node.administration?.modes?.some((mode: string) => mode !== 'single') ||
    node.allowedOperations?.some((op: string) => ['transfer', 'delegate', 'add_assignee', 'admin_override'].includes(op))) errors.push('WORKFLOW_APPROVED_DELEGATION_CONFIRMATION_INVALID');
  const rows = definition.inputSchema?.properties?.[policy.requestsField];
  if (!rows || rows.type !== 'array' || !Number.isSafeInteger(rows.maxItems) || rows.maxItems < 1 || rows.maxItems > policy.maxRequests ||
    !rows.items || rows.items.type !== 'object' || rows.items.additionalProperties !== false || !definition.subject?.factProjection?.[policy.requestsField]) errors.push('WORKFLOW_APPROVED_DELEGATION_REQUEST_SCHEMA_INVALID');
  const approved = Object.values(definition.nodes || {}).some(node => node.kind === 'end' && node.outcome === 'approved');
  if (!approved) errors.push('WORKFLOW_APPROVED_DELEGATION_APPROVED_END_REQUIRED');
  // A graph path is declaration validation, never evidence of a human decision.
  const pending = [definition.startAt]; const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === policy.confirmationNodeId || visited.has(id)) continue;
    visited.add(id); const current = definition.nodes?.[id]; if (!current) continue;
    if (current.kind === 'end' && current.outcome === 'approved') errors.push('WORKFLOW_APPROVED_DELEGATION_CONFIRMATION_BYPASS');
    if (current.kind === 'approval') pending.push(current.onApprove, current.onReject);
    if (current.kind === 'condition') pending.push(current.otherwise, ...(current.branches || []).map((branch: any) => branch.target));
    if (current.kind === 'cc' || current.kind === 'action') pending.push(current.next);
  }
  return [...new Set(errors)];
}

/** Read only canonical instance facts. Reject coercion, unknown fields and scope expansion. */
export function workflowApprovedDelegationRequests(policy: WorkflowApprovedDelegationPolicy, facts: Record<string, any>): WorkflowApprovedDelegationRequest[] {
  const rows = facts?.data?.[policy.requestsField];
  const fail = (): never => { throw new Error('WORKFLOW_APPROVED_DELEGATION_REQUEST_INVALID'); };
  if (!Array.isArray(rows) || !rows.length || rows.length > policy.maxRequests || rows.length > WORKFLOW_APPROVED_DELEGATION_MAX_REQUESTS ||
    new TextEncoder().encode(JSON.stringify(rows)).byteLength > WORKFLOW_APPROVED_DELEGATION_MAX_BYTES) fail();
  const allowed = ['key', 'delegatorRoleSubjectKey', 'delegatorRoleSubjectRevision', 'delegate', 'delegateRoleSubjectKey', 'expectedDelegateRevision', 'workflowCode', 'nodeId', 'validFrom', 'validTo', 'reason'];
  const text = (value: any, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const date = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(?:Z|[+-](\d\d):(\d\d))$/.exec(value);
    if (!parts) return false;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHour, offsetMinute] = parts;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1]! &&
      Number(hourText) <= 23 && Number(minuteText) <= 59 && Number(secondText) <= 59 &&
      (offsetHour === undefined || Number(offsetHour) <= 23 && Number(offsetMinute) <= 59) && Number.isFinite(Date.parse(value));
  };
  const normalized: WorkflowApprovedDelegationRequest[] = (rows as unknown[]).map(row => {
    if (!object(row)) return fail();
    if (Object.keys(row).some(key => !allowed.includes(key)) ||
      !text(row.delegatorRoleSubjectKey, 255) || !membership.test(row.delegatorRoleSubjectKey) ||
      !text(row.delegateRoleSubjectKey, 255) || !membership.test(row.delegateRoleSubjectKey) ||
      !Number.isSafeInteger(row.delegatorRoleSubjectRevision) || row.delegatorRoleSubjectRevision < 1 ||
      !Number.isSafeInteger(row.expectedDelegateRevision) || row.expectedDelegateRevision < 1 ||
      !object(row.delegate) || Object.keys(row.delegate).some(key => !['value', 'label'].includes(key)) || !text(row.delegate.value, 255) || !text(row.delegate.label, 200) ||
      !(row.workflowCode === null || text(row.workflowCode, 128) && code.test(row.workflowCode)) ||
      !(row.nodeId === null || text(row.nodeId, 128) && /^[A-Za-z0-9._:-]{1,128}$/.test(row.nodeId) && row.workflowCode) ||
      !date(row.validFrom) || !date(row.validTo) || Date.parse(row.validFrom) >= Date.parse(row.validTo) || !text(row.reason, 4000) ||
      row.key !== undefined && !text(row.key, 128)) fail();
    return { ...row, delegate: { value: row.delegate.value, label: row.delegate.label },
      validFrom: new Date(row.validFrom).toISOString(), validTo: new Date(row.validTo).toISOString() } as WorkflowApprovedDelegationRequest;
  });
  if (policy.confirmer === 'delegate' && new Set(normalized.map(row => row.delegate.value)).size !== 1) fail();
  return normalized;
}
