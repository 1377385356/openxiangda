/** Shared bounds for one atomic Native parent/owned-child edit. */
export const DATA_SUBTABLE_MAX_ROWS = 500;
export const DATA_SUBTABLE_MAX_TOTAL_ROWS = 500;
// A full replacement needs a delete and create per row, plus bounded root work.
export const DATA_TRANSACTION_MAX_OPERATIONS = 2 * DATA_SUBTABLE_MAX_TOTAL_ROWS + 16;
export const DATA_TRANSACTION_MAX_BYTES = 2 * 1024 * 1024;
export const DATA_FORM_DRAFT_MAX_BYTES = 2 * 1024 * 1024;

/** Negotiate only declarations that exceed the original 100/400 server bounds. */
export function requiresExtendedOwnedSubtableCapacity(resources: readonly { schema: { fields: readonly { type: string; subtable?: { maxRows?: number } }[] } }[]): boolean {
  return resources.some(resource => {
    const limits = resource.schema.fields.filter(field => field.type === 'subtable').map(field => field.subtable?.maxRows ?? 20);
    return limits.some(maximum => maximum > 100) || limits.reduce((total, maximum) => total + maximum, 0) > 400;
  });
}

export function serializedDataBytes(value: unknown): number {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
  catch { return Infinity; }
}
