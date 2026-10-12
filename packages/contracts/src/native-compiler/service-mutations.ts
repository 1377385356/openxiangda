export interface DataMutationGrant {
  resourceCode: string;
  operations: readonly ('create' | 'update' | 'delete' | 'increment')[];
  fieldCodes: readonly string[];
  maxOperations: number;
  /** Opt-in only for the exact active runtime lease holder. */
  allowRuntimeWorker?: true;
}

/** Shape validation never creates authority. Callers supply immutable model fields. */
export function normalizeDataMutationGrants(value: unknown,
  fields?: ReadonlyMap<string, { has(key: string): boolean }>): DataMutationGrant[] {
  const fail = (): never => { throw Object.assign(new Error('DATA_MUTATION_GRANT_INVALID'), { code: 'DATA_MUTATION_GRANT_INVALID' }); };
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return fail();
  const seen = new Set<string>();
  const grants = value.map((v: any) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k =>
      !['resourceCode', 'operations', 'fieldCodes', 'maxOperations', 'allowRuntimeWorker'].includes(k)) ||
      typeof v.resourceCode !== 'string' || !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(v.resourceCode) ||
      (v.allowRuntimeWorker !== undefined && v.allowRuntimeWorker !== true) ||
      seen.has(v.resourceCode) || (fields && !fields.has(v.resourceCode)) ||
      !Array.isArray(v.operations) || v.operations.length < 1 || v.operations.length > 4 ||
      new Set(v.operations).size !== v.operations.length || v.operations.some((op: string) =>
        !['create', 'update', 'delete', 'increment'].includes(op)) ||
      !Array.isArray(v.fieldCodes) || v.fieldCodes.length > 128 || new Set(v.fieldCodes).size !== v.fieldCodes.length ||
      (v.operations.some((op: string) => op !== 'delete') && !v.fieldCodes.length) ||
      v.fieldCodes.some((field: any) => typeof field !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(field) ||
        (fields && !fields.get(v.resourceCode)?.has(field))) ||
      !Number.isSafeInteger(v.maxOperations) || v.maxOperations < 1 || v.maxOperations > 1000) return fail();
    seen.add(v.resourceCode);
    return { resourceCode: v.resourceCode, operations: [...v.operations].sort(), fieldCodes: [...v.fieldCodes].sort(), maxOperations: v.maxOperations, ...(v.allowRuntimeWorker ? {allowRuntimeWorker:true as const} : {}) } as DataMutationGrant;
  });
  return grants.sort((a, b) => a.resourceCode.localeCompare(b.resourceCode));
}
