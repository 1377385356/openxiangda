/** Shared field budget for Native records and workflow task forms. */
export const DATA_RESOURCE_MAX_FIELDS = 200;
// At most one binding per field plus the five supported system input sources.
export const WORKFLOW_LAUNCH_MAX_INPUTS = DATA_RESOURCE_MAX_FIELDS + 5;
export function requiresExtendedFieldCapacity(resources: readonly { schema: { fields: readonly unknown[] } }[], definitions: readonly { definition: { taskPages?: Record<string, { fields?: readonly unknown[] }> }; launch?: { submission?: { create?: { inputs?: object }; existing?: { inputs?: object } } } }[] = []): boolean {
  return resources.some(resource => resource.schema.fields.length > 100) || definitions.some(item =>
    Object.values(item.definition.taskPages || {}).some(page => (page.fields?.length ?? 0) > 64) ||
    [item.launch?.submission?.create, item.launch?.submission?.existing].some(intent => Object.keys(intent?.inputs || {}).length > 64));
}

/** Shared bounds for one atomic Native parent/owned-child edit. */
export const DATA_SUBTABLE_MAX_ROWS = 500;
export const DATA_SUBTABLE_DEFAULT_TOTAL_ROWS = 500;
export const DATA_SUBTABLE_MAX_TOTAL_ROWS = 1000;
// A full replacement needs a delete and create per row, plus bounded root work.
export const DATA_TRANSACTION_MAX_OPERATIONS = 2 * DATA_SUBTABLE_MAX_TOTAL_ROWS + 16;
export const DATA_TRANSACTION_MAX_BYTES = 2 * 1024 * 1024;
export const DATA_FORM_DRAFT_MAX_BYTES = 2 * 1024 * 1024;

export function isDataOwnedRowLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= DATA_SUBTABLE_MAX_TOTAL_ROWS;
}

/** Only a compiled resource schema can opt in; requests never override it. */
export function dataOwnedRowLimit(schema: { ownedRowLimit?: number }): number {
  if (schema.ownedRowLimit === undefined) return DATA_SUBTABLE_DEFAULT_TOTAL_ROWS;
  if (!isDataOwnedRowLimit(schema.ownedRowLimit)) throw new Error('NATIVE_DATA_OWNED_ROW_LIMIT_INVALID');
  return schema.ownedRowLimit;
}

export function requiresAggregateOwnedSubtableCapacity(resources: readonly { schema: { ownedRowLimit?: number } }[]): boolean {
  return resources.some(resource => (resource.schema.ownedRowLimit ?? DATA_SUBTABLE_DEFAULT_TOTAL_ROWS) > DATA_SUBTABLE_DEFAULT_TOTAL_ROWS);
}

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
