import type { DataResourceSurface } from './surface.js';
import type { DataTransactionOperation } from './types.js';

/** Internal app-admin edit transport; the existing approval outcome does not change. */
export interface WorkflowRecordCorrectionSurface {
  schemaVersion: 'openxiangda.workflow-record-correction-surface/v2';
  appCode: string;
  resourceCode: string;
  recordId: string;
  environmentKey: string;
  record: Record<string, unknown> & { id: string; revision: number };
  expectedRevision: number;
  editableFields: string[];
  surface: DataResourceSurface;
  command: { method: 'POST'; href: string };
  preservesApprovalResult: true;
}

export interface WorkflowRecordCorrectionInput {
  schemaVersion: 'openxiangda.workflow-record-correction/v2';
  environmentKey: string;
  idempotencyKey: string;
  operations: DataTransactionOperation[];
}
