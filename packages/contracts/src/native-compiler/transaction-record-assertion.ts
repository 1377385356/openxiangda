
import type { DataTransactionRecordAssertion } from '../types.js';
import { DATA_QUERY_OPERATORS, DATA_QUERY_EMPTY_OPERATORS } from './data-query-operators.js';
const field = (value: unknown) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(value);
const comparison = new Set(['eq','neq','gt','gte','lt','lte']);
/** Shared closed shape; Native owns declared type, path and field authorization. */
export function isDataTransactionRecordAssertion(value: unknown): value is DataTransactionRecordAssertion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>, keys = Object.keys(v);
  if (v.kind === 'value') {
    if (keys.some(key => !['kind','field','operator','value','path'].includes(key)) ||
      !field(v.field) || typeof v.operator !== 'string' || !DATA_QUERY_OPERATORS.has(v.operator) ||
      (Object.hasOwn(v,'path') && (typeof v.path !== 'string' || !v.path || v.path.length > 128))) return false;
    return DATA_QUERY_EMPTY_OPERATORS.has(v.operator) ? !Object.hasOwn(v,'value') : Object.hasOwn(v,'value');
  }
  if (v.kind === 'field')
    return keys.length === 4 && ['kind','leftField','operator','rightField'].every(key => keys.includes(key)) &&
      field(v.leftField) && field(v.rightField) && comparison.has(String(v.operator));
  if (v.kind === 'database-now')
    return keys.length === 3 && ['kind','field','operator'].every(key => keys.includes(key)) &&
      field(v.field) && comparison.has(String(v.operator));
  return false;
}
