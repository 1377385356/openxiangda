/** Shared bounds for one atomic Native parent/owned-child edit. */
export const DATA_SUBTABLE_MAX_ROWS = 100;
export const DATA_SUBTABLE_MAX_TOTAL_ROWS = 400;
export const DATA_TRANSACTION_MAX_OPERATIONS = 1000;
export const DATA_TRANSACTION_MAX_BYTES = 2 * 1024 * 1024;
export const DATA_FORM_DRAFT_MAX_BYTES = 2 * 1024 * 1024;

export function serializedDataBytes(value: unknown): number {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
  catch { return Infinity; }
}
