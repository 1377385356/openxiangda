import { OPENXIANGDA_NATIVE_SYSTEM_FIELDS_V2 } from './data-field.js';

/** Platform-owned provenance columns; id/revision remain protocol fields. */
export const DATA_AUDIT_METADATA_FIELDS = [
  'created_by', 'updated_by', 'created_at', 'updated_at',
] as const;

export function isDataAuditMetadataField(code: string): boolean {
  return (DATA_AUDIT_METADATA_FIELDS as readonly string[]).includes(code);
}

export function hasDataAuditReadPolicy(resource: { fieldPolicies?: Record<string, unknown> }): boolean {
  return DATA_AUDIT_METADATA_FIELDS.some(code =>
    Object.prototype.hasOwnProperty.call(resource.fieldPolicies || {}, code));
}

/**
 * Platform-owned column codes accepted as list sort fields (defaultSort /
 * sortableFields) without a matching resource field declaration. The Data API
 * already accepts these codes in query `order`; this contract extends the same
 * allowance to declared list sorting.
 */
export const DATA_SYSTEM_SORT_FIELD_CODES: readonly string[] =
  OPENXIANGDA_NATIVE_SYSTEM_FIELDS_V2.map(field => field.code);

export function isDataSystemSortField(code: string): boolean {
  return DATA_SYSTEM_SORT_FIELD_CODES.includes(code);
}
