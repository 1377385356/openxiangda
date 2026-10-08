import type { SubmissionLocatorStorage } from './workflow-submission-recovery';
import { browserSha256 } from './sha256';

/** Locator only. Never persist the original token, operation input or form values. */
export interface PendingWorkflowTaskCommand {
  taskId: string;
  command: string;
  idempotencyKey: string;
  requestedAt: string;
  tokenDigest: string;
}

export function workflowTaskCommandScope(appCode: string, environmentId: string, userId: string, taskId: string) {
  return `openxiangda:pending-task-command:v1:${JSON.stringify([appCode, environmentId, userId, taskId])}`;
}

export function readPendingWorkflowTaskCommand(storage: SubmissionLocatorStorage | undefined, scope: string): PendingWorkflowTaskCommand | null {
  try {
    const raw = storage?.getItem(scope);
    if (!raw || raw.length > 2048) return null;
    const value = JSON.parse(raw);
    if (!value || Object.keys(value).sort().join(',') !== 'command,idempotencyKey,requestedAt,taskId,tokenDigest'
      || ![value.taskId, value.command, value.idempotencyKey].every(item => typeof item === 'string' && item.length > 0 && item.length <= 255)
      || typeof value.tokenDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.tokenDigest)
      || typeof value.requestedAt !== 'string' || !Number.isFinite(Date.parse(value.requestedAt))) return null;
    return value;
  } catch { return null; }
}

export function writePendingWorkflowTaskCommand(storage: SubmissionLocatorStorage | undefined, scope: string, value: PendingWorkflowTaskCommand): boolean {
  try {
    if (!storage) return false;
    storage.setItem(scope, JSON.stringify({ taskId: value.taskId, command: value.command,
      idempotencyKey: value.idempotencyKey, requestedAt: value.requestedAt, tokenDigest: value.tokenDigest }));
    return true;
  } catch { return false; }
}

export function clearPendingWorkflowTaskCommand(storage: SubmissionLocatorStorage | undefined, scope: string, idempotencyKey: string) {
  try {
    if (readPendingWorkflowTaskCommand(storage, scope)?.idempotencyKey === idempotencyKey) storage?.removeItem(scope);
  } catch { /* The in-memory request remains available. */ }
}

export async function workflowCommandTokenDigest(token: string): Promise<string> {
  return browserSha256(new TextEncoder().encode(token));
}

/** Only a first-attempt, structured server rejection proves no successful write. */
export function workflowTaskCommandWasRejected(error: unknown): boolean {
  const value = error as { status?: number; code?: string } | null;
  return Boolean(value && [400, 401, 403, 404, 409, 413, 422].includes(value.status || 0)
    && /^(WORKFLOW_(V2|TASK)_|OPENXIANGDA_NATIVE_)/.test(value.code || ''));
}
