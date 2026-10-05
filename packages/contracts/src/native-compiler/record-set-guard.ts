import type { DataTransactionRecordSetMatchGuard } from '../types.js';

export const DATA_TRANSACTION_RECORD_SET_MAX_RECORDS = 500;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Shape and identity bounds only; row/field authorization remains with Native. */
export function isDataTransactionRecordSetMatchGuard(value: unknown): value is DataTransactionRecordSetMatchGuard {
  if (!object(value) || value.kind !== 'record-set-match' ||
    Object.keys(value).some(key => !['kind', 'resourceCode', 'errorCode', 'records', 'where'].includes(key)) ||
    typeof value.resourceCode !== 'string' || value.resourceCode.length > 64 ||
    !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value.resourceCode) ||
    typeof value.errorCode !== 'string' || !/^OPENXIANGDA_[A-Z0-9_]{1,96}$/.test(value.errorCode) ||
    !Array.isArray(value.records) || !value.records.length || value.records.length > DATA_TRANSACTION_RECORD_SET_MAX_RECORDS ||
    (Object.hasOwn(value, 'where') && !object(value.where))) return false;
  const seen = new Set<string>();
  return value.records.every(record => {
    if (!object(record) || Object.keys(record).length !== 2 ||
      typeof record.id !== 'string' || !uuid.test(record.id) ||
      !Number.isSafeInteger(record.expectedRevision) || Number(record.expectedRevision) < 1) return false;
    const id = record.id.toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
