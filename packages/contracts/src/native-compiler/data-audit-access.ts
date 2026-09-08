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
