
import type { DataTransactionAcceptedTimeValue } from '../types.js';
export const DATA_TRANSACTION_TIME_MAX_OFFSET_MILLISECONDS = 31622400000;
export function isDataTransactionAcceptedTimeValue(value: unknown): value is DataTransactionAcceptedTimeValue {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 2 && (value as any).kind === 'database-accepted-time' &&
    Object.hasOwn(value, 'offsetMilliseconds') &&
    Number.isSafeInteger((value as any).offsetMilliseconds) &&
    Math.abs((value as any).offsetMilliseconds) <= DATA_TRANSACTION_TIME_MAX_OFFSET_MILLISECONDS;
}
/** Named actions opt in; datetime fields are resolved after locks by Native, never here. */
export function databaseAcceptedTime(offsetMilliseconds = 0): DataTransactionAcceptedTimeValue {
  const value: DataTransactionAcceptedTimeValue = { kind: 'database-accepted-time', offsetMilliseconds };
  if (!isDataTransactionAcceptedTimeValue(value)) throw new Error('DATA_TRANSACTION_ACCEPTED_TIME_VALUE_INVALID');
  return value;
}
