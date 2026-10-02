import type { DataFileRef, WorkflowTaskFileUpload, WorkflowTaskFileUploadPlan } from 'openxiangda-contracts/browser';

/** Transient bytes and the original intent. Never persist this object or its upload plan. */
export interface WorkflowTaskFileUploadIntent {
  taskId: string;
  input: WorkflowTaskFileUpload;
  file: File;
  phase: 'initiate' | 'upload' | 'complete';
}

export interface WorkflowTaskFileUploadTransport {
  initiate: (taskId: string, input: WorkflowTaskFileUpload) => Promise<WorkflowTaskFileUploadPlan>;
  read: (taskId: string, fileId: string) => Promise<WorkflowTaskFileUploadPlan>;
  put: (plan: WorkflowTaskFileUploadPlan, file: File) => Promise<void>;
  complete: (taskId: string, fileId: string) => Promise<DataFileRef>;
}

export function assertWorkflowTaskFileUploadPlan(intent: WorkflowTaskFileUploadIntent, plan: WorkflowTaskFileUploadPlan) {
  const { input } = intent;
  if (plan.file.id !== input.id || plan.fieldCode !== input.fieldCode ||
    plan.row?.subtableFieldCode !== input.row?.subtableFieldCode || plan.row?.rowKey !== input.row?.rowKey ||
    plan.file.name !== input.fileName || plan.file.size !== input.fileSize ||
    plan.file.contentType !== (input.contentType || '') || !['pending', 'ready'].includes(plan.state))
    throw new Error('WORKFLOW_TASK_FILE_UPLOAD_RESPONSE_INVALID');
}

/** A ready receipt is final. A lost completion response never causes another PUT. */
export async function runWorkflowTaskFileUpload(intent: WorkflowTaskFileUploadIntent, transport: WorkflowTaskFileUploadTransport, recovery = false): Promise<DataFileRef> {
  let plan: WorkflowTaskFileUploadPlan;
  if (recovery) {
    try { plan = await transport.read(intent.taskId, intent.input.id); }
    catch (error) {
      if ((error as { code?: string }).code !== 'WORKFLOW_TASK_FILE_NOT_FOUND') throw error;
      plan = await transport.initiate(intent.taskId, intent.input);
    }
  } else plan = await transport.initiate(intent.taskId, intent.input);
  assertWorkflowTaskFileUploadPlan(intent, plan);
  if (plan.state === 'ready') return plan.file;
  if (intent.phase !== 'complete') {
    intent.phase = 'upload';
    await transport.put(plan, intent.file);
  }
  intent.phase = 'complete';
  const file = await transport.complete(intent.taskId, intent.input.id);
  assertWorkflowTaskFileUploadPlan(intent, { ...plan, file, state: 'ready' });
  return file;
}
