/** Locator only: the server remains the authority for execution, identity and authorization. */
export interface PendingWorkflowSubmission {
  operationCode: string;
  workflowCode: string;
  idempotencyKey: string;
  requestedAt: string;
  kind: 'standard' | 'named';
}
export type SubmissionLocatorStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function workflowSubmissionScope(appCode: string, environmentKey: string, userId: string, workflowCode: string) {
  return `openxiangda:pending-workflow:v1:${JSON.stringify([appCode, environmentKey, userId, workflowCode])}`;
}
export function readPendingWorkflowSubmission(storage: SubmissionLocatorStorage | undefined, key: string): PendingWorkflowSubmission | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw || raw.length > 2048) return null;
    const value = JSON.parse(raw);
    if (!value || Object.keys(value).sort().join(',') !== 'idempotencyKey,kind,operationCode,requestedAt,workflowCode'
      || !['standard', 'named'].includes(value.kind)
      || ![value.operationCode, value.workflowCode, value.idempotencyKey].every(item => typeof item === 'string' && item.length > 0 && item.length <= 128)
      || typeof value.requestedAt !== 'string' || !Number.isFinite(Date.parse(value.requestedAt))) return null;
    return value;
  } catch { return null; }
}
export function writePendingWorkflowSubmission(storage: SubmissionLocatorStorage | undefined, key: string, value: PendingWorkflowSubmission): boolean {
  try {
    if (!storage) return false;
    // Explicit field projection prevents form values or credentials entering storage accidentally.
    storage.setItem(key, JSON.stringify({ operationCode: value.operationCode, workflowCode: value.workflowCode,
      idempotencyKey: value.idempotencyKey, requestedAt: value.requestedAt, kind: value.kind }));
    return true;
  } catch { return false; }
}
export function clearPendingWorkflowSubmission(storage: SubmissionLocatorStorage | undefined, key: string, idempotencyKey: string): void {
  try {
    if (readPendingWorkflowSubmission(storage, key)?.idempotencyKey === idempotencyKey) storage?.removeItem(key);
  } catch { /* Read-only recovery still works from the in-memory locator. */ }
}
export function standardProcessWasRejected(error: unknown): boolean {
  const value = error as { status?: number; code?: string } | null;
  if (value?.status === 409 && value.code === 'OPENXIANGDA_NATIVE_DATA_REVISION_CONFLICT') return true;
  return Boolean(value && [400, 401, 403, 404, 422].includes(value.status || 0)
    && /^OPENXIANGDA_(STANDARD_PROCESS|NATIVE_DATA|BUSINESS_PROCESS|BUSINESS_ACTION|AUTHORIZATION)_/.test(value.code || ''));
}
export function submissionLocatorStorage(): SubmissionLocatorStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; }
}
