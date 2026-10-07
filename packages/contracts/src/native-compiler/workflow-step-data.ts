import type { DataTransactionGuard, DataTransactionOperation, DataTransactionResult } from '../types.js';
import { DATA_TRANSACTION_MAX_OPERATIONS } from './data-capacity.js';

export const WORKFLOW_STEP_DATA_COMMAND_SCHEMA = 'openxiangda.workflow-step-data-command/v1';
export const WORKFLOW_STEP_DATA_RESOLUTION_SCHEMA = 'openxiangda.workflow-step-data-resolution/v1';

/** Scope and execution identity come from the verified event, not a browser role. */
export interface WorkflowStepDataCommand {
  schemaVersion: typeof WORKFLOW_STEP_DATA_COMMAND_SCHEMA;
  executionId: string;
  data: { guards: DataTransactionGuard[]; operations: DataTransactionOperation[] };
}
export interface WorkflowStepDataIdentity {
  schemaVersion: typeof WORKFLOW_STEP_DATA_COMMAND_SCHEMA;
  executionId: string;
}
export type WorkflowStepDataResolution = {
  schemaVersion: typeof WORKFLOW_STEP_DATA_RESOLUTION_SCHEMA;
  executionId: string;
} & (
  | { outcome: 'not_observed' }
  | { outcome: 'committed'; transaction: DataTransactionResult }
);

/** Incomplete or mismatched replies are unknown results, never permission to replay. */
export function parseWorkflowStepDataResolution(value: unknown, executionId: string, requireCommitted = false): WorkflowStepDataResolution {
  const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
  const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
  const invalid = (): never => { throw new Error('WORKFLOW_STEP_DATA_RESPONSE_INVALID'); };
  if (!object(value) || value.schemaVersion !== WORKFLOW_STEP_DATA_RESOLUTION_SCHEMA || value.executionId !== executionId ||
      Object.keys(value).some(k => !['schemaVersion', 'executionId', 'outcome', 'transaction'].includes(k))) return invalid();
  if (value.outcome === 'not_observed' && !Object.hasOwn(value, 'transaction') && !requireCommitted) return value as WorkflowStepDataResolution;
  const tx = value.transaction;
  if (value.outcome !== 'committed' || !object(tx) || tx.schemaVersion !== 'openxiangda.data-transaction-result/v2' ||
      tx.idempotencyKey !== `workflow-step:${executionId}` || typeof tx.replayed !== 'boolean' ||
      !Array.isArray(tx.items) || tx.items.length < 1 || tx.items.length > DATA_TRANSACTION_MAX_OPERATIONS ||
      (tx.evaluatedAt !== undefined && (typeof tx.evaluatedAt !== 'string' || !Number.isFinite(Date.parse(tx.evaluatedAt))))) return invalid();
  for (const [index, item] of tx.items.entries()) {
    if (!object(item) || item.index !== index) return invalid();
    if (item.operation === 'emitEvent') {
      if (typeof item.eventType !== 'string' || !item.eventType || !uuid(item.eventId)) return invalid();
    } else if (!['create', 'update', 'delete', 'increment'].includes(item.operation) ||
        typeof item.resourceCode !== 'string' || !item.resourceCode || !uuid(item.id) ||
        !Number.isSafeInteger(item.revision) || item.revision < 1) return invalid();
  }
  return value as WorkflowStepDataResolution;
}
