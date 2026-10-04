/** Code-owned text and recipient source; no administrator or caller overrides. */
export interface WorkflowRejectionNotification {
  recipient: 'record_last_modifier';
  title: string;
  summary: string;
}

export const WORKFLOW_REJECTION_NOTIFICATION_SCHEMA =
  'openxiangda.workflow-rejection-notification/v1' as const;
export const WORKFLOW_REJECTION_NOTIFICATION_MAX_BYTES = 4096;

export type WorkflowRejectionNotificationSnapshot = {
  schemaVersion: typeof WORKFLOW_REJECTION_NOTIFICATION_SCHEMA;
  recipient: 'record_last_modifier';
  title: string;
  summary: string;
} & (
  | { status: 'ready'; userId: string; sourceRevision: number }
  | {
      status: 'skipped';
      reason: 'record_missing' | 'modifier_missing' | 'modifier_ineligible';
      sourceRevision: number | null;
    }
);

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(',') === keys.sort().join(',');
}

export function validateWorkflowRejectionNotification(definition: {
  rejectionNotification?: unknown;
  subject?: { resourceCode?: unknown };
}): string[] {
  const policy = definition?.rejectionNotification;
  if (policy === undefined) return [];
  if (!object(policy) || !exactKeys(policy, ['recipient', 'title', 'summary']) ||
      policy.recipient !== 'record_last_modifier' || !text(policy.title, 160) || !text(policy.summary, 500)) {
    return ['WORKFLOW_REJECTION_NOTIFICATION_INVALID'];
  }
  if (!text(definition.subject?.resourceCode, 63)) {
    return ['WORKFLOW_REJECTION_NOTIFICATION_SUBJECT_REQUIRED'];
  }
  return [];
}

/** Read only a frozen Workflow-owned fact; never interpret it as a send request. */
export function isWorkflowRejectionNotificationSnapshot(
  value: unknown,
): value is WorkflowRejectionNotificationSnapshot {
  if (!object(value) || value.schemaVersion !== WORKFLOW_REJECTION_NOTIFICATION_SCHEMA ||
      value.recipient !== 'record_last_modifier' || !text(value.title, 160) || !text(value.summary, 500)) return false;
  const base = ['schemaVersion', 'recipient', 'title', 'summary', 'status', 'sourceRevision'];
  if (value.status === 'ready') {
    if (!exactKeys(value, [...base, 'userId']) || !text(value.userId, 255) ||
        !Number.isSafeInteger(value.sourceRevision) || Number(value.sourceRevision) < 1) return false;
  } else if (value.status === 'skipped') {
    if (!exactKeys(value, [...base, 'reason']) ||
        !['record_missing', 'modifier_missing', 'modifier_ineligible'].includes(String(value.reason)) ||
        (value.reason === 'record_missing' ? value.sourceRevision !== null :
          !Number.isSafeInteger(value.sourceRevision) || Number(value.sourceRevision) < 1)) return false;
  } else return false;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= WORKFLOW_REJECTION_NOTIFICATION_MAX_BYTES;
}
