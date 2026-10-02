import type { DataTransactionOperation } from 'openxiangda-contracts/browser';
import { DATA_TRANSACTION_MAX_OPERATIONS, DATA_SUBTABLE_MAX_TOTAL_ROWS } from 'openxiangda-contracts/browser';
import { buildSubtableOperations, type SubtableDraftRow, type SubtableOperationPlanInput } from '../platform-fields/subtable-value';
import type { SurfaceField } from './SurfaceFields';
import type { GeneratedResourceDefinition } from './generated-resource-definition';
import type { ResourceRecord } from './resource-page-helpers';

/** One Native parent/child plan shared by ordinary and workflow-owned data editing. */
export function buildResourceFormOperations(input: {
  mode: 'create' | 'edit'; resourceCode: string; record?: ResourceRecord;
  data: Record<string, unknown>; values: Record<string, unknown>; subtableFields: SurfaceField[];
  definitions: Readonly<Record<string, GeneratedResourceDefinition>>;
  canWrite: SubtableOperationPlanInput['canWrite'];
  canDelete: (definition: GeneratedResourceDefinition) => boolean;
}): DataTransactionOperation[] {
  if (input.mode === 'edit' && (!input.record?.id || !Number.isSafeInteger(input.record.revision) || input.record.revision < 1)) {
    throw new Error('OPENXIANGDA_SUBTABLE_PARENT_REVISION_REQUIRED');
  }
  if (input.subtableFields.reduce((total, field) => total + (field.subtable?.maxRows ?? 20), 0) > DATA_SUBTABLE_MAX_TOTAL_ROWS) {
    throw new Error('OPENXIANGDA_SUBTABLE_AGGREGATE_MAX_ROWS_EXCEEDED');
  }
  const operations: DataTransactionOperation[] = [input.mode === 'create'
    ? { operation: 'create', resourceCode: input.resourceCode, data: input.data }
    : { operation: 'update', resourceCode: input.resourceCode, id: input.record!.id, expectedRevision: input.record!.revision, data: input.data }];
  for (const field of input.subtableFields) {
    const config = field.subtable;
    const child = config ? input.definitions[config.resourceCode] : undefined;
    if (!config || !child) throw new Error(`OPENXIANGDA_SUBTABLE_DEFINITION_MISSING:${field.key}`);
    operations.push(...buildSubtableOperations({
      rows: Array.isArray(input.values[field.key]) ? input.values[field.key] as SubtableDraftRow[] : [],
      childResourceCode: config.resourceCode, childSurface: child.surface,
      foreignKey: config.foreignKey, orderField: config.orderField, maxRows: config.maxRows,
      parent: input.mode === 'create' ? { operation: 'create', operationIndex: 0 } : { operation: 'update', id: input.record!.id },
      canWrite: input.canWrite, canDelete: input.canDelete(child),
    }));
  }
  if (operations.length > DATA_TRANSACTION_MAX_OPERATIONS) throw new Error('OPENXIANGDA_DATA_TRANSACTION_TOO_LARGE');
  return operations;
}
