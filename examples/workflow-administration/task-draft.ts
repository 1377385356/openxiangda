import { loadWorkflowTaskDrafts, saveWorkflowTaskDraft } from 'openxiangda/core';
import type { WorkflowTaskDraftSave, WorkflowTaskFormInput } from 'openxiangda-contracts/browser';

/** Capture once before sending; a caller retains this exact request when its result is unknown. */
export function newPrivateTaskDraft(recordRevision: number, values: Record<string, unknown>): WorkflowTaskDraftSave {
  return { id: crypto.randomUUID(), expectedRevision: 0, recordRevision, values: structuredClone(values) };
}

export async function saveThenRead(taskId: string, request: WorkflowTaskDraftSave) {
  const saved = await saveWorkflowTaskDraft(taskId, request);
  const mine = await loadWorkflowTaskDrafts(taskId);
  return { saved, mine };
}

/** The existing Workflow command remains the submission owner; new edits are validated again. */
export function formWithPrivateDraft(request: WorkflowTaskDraftSave, savedRevision: number, values: Record<string, unknown>): WorkflowTaskFormInput {
  return { expectedRevision: request.recordRevision, values, draft: { id: request.id, expectedRevision: savedRevision } };
}
