import type { DataFieldSurface } from 'openxiangda-contracts/browser';
import { fieldValueForData } from '../platform-fields/field-form-codec';

/** Task controls may mount without a value after a conditional field appears. */
export function workflowTaskFieldValueForData(field: DataFieldSurface | undefined, value: unknown) {
  const encoded = fieldValueForData(field, value);
  if (encoded == null && (field?.type === 'file' || field?.type === 'image')) return [];
  return encoded ?? null;
}
