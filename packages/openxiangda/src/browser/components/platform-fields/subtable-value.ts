import type {
  DataFieldSurface,
  DataResourceSurface,
  DataTransactionOperation,
  DataTransactionOperationReference,
} from 'openxiangda-contracts/browser';
import { normalizeFormValues } from './field-form-codec';
import { selectedSurfaceFields } from '../resource/resource-field-selection';

export type SubtableDraftState = 'created' | 'persisted' | 'deleted';

export interface SubtableDraftRow {
  key: string;
  state: SubtableDraftState;
  id?: string;
  revision?: number;
  data: Record<string, unknown>;
  originalData?: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
  originalOrder?: number;
}

export interface SubtableOperationPlanInput {
  rows: SubtableDraftRow[];
  childResourceCode: string;
  childSurface: DataResourceSurface;
  foreignKey: string;
  orderField: string;
  maxRows?: number;
  parent:
    | { operation: 'create'; operationIndex: number }
    | { operation: 'update'; id: string };
  canWrite: (
    fieldCode: string,
    field: DataFieldSurface,
    operation: 'create' | 'update'
  ) => boolean;
  canDelete: boolean;
}

export function buildSubtableOperations(
  input: SubtableOperationPlanInput
): DataTransactionOperation[] {
  const visibleRows = input.rows.filter(row => row.state !== 'deleted');
  const maximum = input.maxRows ?? 20;
  if (visibleRows.length > maximum || maximum < 1 || maximum > 49) {
    throw new Error('OPENXIANGDA_SUBTABLE_MAX_ROWS_EXCEEDED');
  }
  const operations: DataTransactionOperation[] = [];
  for (const row of input.rows.filter(item => item.state === 'deleted')) {
    if (!input.canDelete) {
      throw new Error('OPENXIANGDA_SUBTABLE_DELETE_FORBIDDEN');
    }
    if (!row.id || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1) {
      throw new Error('OPENXIANGDA_SUBTABLE_DELETED_ROW_INVALID');
    }
    operations.push({
      operation: 'delete',
      resourceCode: input.childResourceCode,
      id: row.id,
      expectedRevision: row.revision!,
    });
  }
  visibleRows.forEach((row, order) => {
    const operation = row.state === 'created' ? 'create' : 'update';
    const current = writableData(input, row.data, operation);
    if (operation === 'create') {
      assertLinkFieldsWritable(input, 'create');
      const parentValue: string | DataTransactionOperationReference =
        input.parent.operation === 'create'
          ? { operationIndex: input.parent.operationIndex, field: 'id' }
          : input.parent.id;
      operations.push({
        operation: 'create',
        resourceCode: input.childResourceCode,
        data: {
          ...current,
          [input.foreignKey]: parentValue,
          [input.orderField]: order,
        },
      });
      return;
    }
    if (!row.id || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1) {
      throw new Error('OPENXIANGDA_SUBTABLE_PERSISTED_ROW_INVALID');
    }
    const original = writableData(
      input,
      row.originalData || {},
      'update'
    );
    const changes = changedValues(original, current);
    if (row.originalOrder !== order) {
      assertLinkFieldsWritable(input, 'update');
      changes[input.orderField] = order;
    }
    if (Object.keys(changes).length === 0) return;
    operations.push({
      operation: 'update',
      resourceCode: input.childResourceCode,
      id: row.id,
      expectedRevision: row.revision!,
      data: changes,
    });
  });
  return operations;
}

function assertLinkFieldsWritable(
  input: SubtableOperationPlanInput,
  operation: 'create' | 'update'
) {
  for (const fieldCode of operation === 'create'
    ? [input.foreignKey, input.orderField]
    : [input.orderField]) {
    const field = input.childSurface.fields[fieldCode];
    if (!field || !input.canWrite(fieldCode, field, operation)) {
      throw new Error(`OPENXIANGDA_SUBTABLE_LINK_FIELD_FORBIDDEN:${fieldCode}`);
    }
  }
}

function writableData(
  input: SubtableOperationPlanInput,
  values: Record<string, unknown>,
  operation: 'create' | 'update'
) {
  const selected = new Set(selectedSurfaceFields(input.childSurface, 'form').map(field => field.key));
  const normalized = normalizeFormValues(
    Object.fromEntries(Object.entries(values).filter(([key]) => selected.has(key))),
    input.childSurface
  );
  return Object.fromEntries(
    Object.entries(normalized)
      .filter(([fieldCode]) => {
        if (fieldCode === input.foreignKey || fieldCode === input.orderField) {
          return false;
        }
        const field = input.childSurface.fields[fieldCode];
        return Boolean(
          field &&
            !field.system &&
            field.type !== 'subtable' &&
            field.widget !== 'readonly' &&
            input.canWrite(fieldCode, field, operation)
        );
      })
      .map(([fieldCode, value]) => [
        fieldCode,
        value === undefined
          ? emptyValue(input.childSurface.fields[fieldCode])
          : value,
      ])
  );
}

function emptyValue(field: DataFieldSurface | undefined) {
  return field && isMultiField(field.type) ? [] : null;
}

function isMultiField(type: string) {
  return (
    type.endsWith('.multiple') ||
    type === 'file' ||
    type === 'image' ||
    type === 'subtable'
  );
}

function changedValues(
  original: Record<string, unknown>,
  current: Record<string, unknown>
) {
  return Object.fromEntries(
    Object.keys(current)
      .filter(key => canonicalJson(current[key]) !== canonicalJson(original[key]))
      .map(key => [key, current[key]])
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
