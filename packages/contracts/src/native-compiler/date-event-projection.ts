/** Date producers use the existing subscription field whitelist, never SQL paths. */
export class DateEventProjectionV2Error extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const DATE_EVENT_RESERVED_DATA_FIELDS_V2 = [
  'projection', 'triggerCode', 'resourceCode', 'recordId', 'recordRevision', 'field', 'dueAt',
] as const;

export function dateEventProjectionFieldsV2(
  resourceCode: string,
  subscriptions: { filter?: any; payload?: any }[],
  resource?: any
): string[] {
  const reject = (code: string): never => {
    throw new DateEventProjectionV2Error(code);
  };
  if (subscriptions.length > 100) reject('DATE_TRIGGER_PROJECTION_LIMIT');
  const selected = new Set<string>();
  for (const subscription of subscriptions) {
    const resources = subscription.filter?.resourceCodes || [];
    if (!Array.isArray(resources)) reject('DATE_TRIGGER_PROJECTION_INVALID');
    if (resources.length && !resources.includes(resourceCode)) continue;
    const fields = subscription.payload?.fields || [];
    if (!Array.isArray(fields) || fields.length > 32)
      reject('DATE_TRIGGER_PROJECTION_LIMIT');
    for (const field of fields) {
      if (
        typeof field !== 'string' ||
        !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(field) ||
        ['__proto__', 'constructor', 'prototype'].includes(field)
      )
        reject('DATE_TRIGGER_PROJECTION_FIELD_INVALID');
      selected.add(field);
    }
  }
  if (selected.size > 64) reject('DATE_TRIGGER_PROJECTION_LIMIT');
  if (resource !== undefined) {
    const fields = resource?.schema?.fields ?? resource?.fields;
    if (!Array.isArray(fields))
      reject('DATE_TRIGGER_PROJECTION_RESOURCE_INVALID');
    const declarations = new Map(
      fields.map((field: any) => [field.code, field])
    );
    for (const code of selected) {
      const field: any = declarations.get(code);
      if (!field) reject('DATE_TRIGGER_PROJECTION_FIELD_UNKNOWN');
      if (field.type === 'subtable')
        reject('DATE_TRIGGER_PROJECTION_SUBTABLE_FORBIDDEN');
      if (resource.fieldPolicies?.[code]?.mask === 'omit')
        reject('DATE_TRIGGER_PROJECTION_FIELD_SENSITIVE');
    }
  }
  return [...selected].sort();
}

/** Only source values are deferred; the generated envelope still receives full validation. */
export function dateEventProjectionEnvelopeSchemaV2(schema: any, fields: string[]): any {
  if (!fields.length) return schema;
  const projection = schema?.properties?.projection;
  if (projection?.type !== 'object' || !projection.properties || typeof projection.properties !== 'object' || Array.isArray(projection.properties) ||
      projection.additionalProperties !== false ||
      (projection.required !== undefined && !Array.isArray(projection.required)) ||
      fields.some(field => !Object.hasOwn(projection.properties, field)) ||
      (projection.required || []).some((field: string) => !fields.includes(field))) {
    throw new DateEventProjectionV2Error('DATE_TRIGGER_PROJECTION_SCHEMA_INVALID');
  }
  // An empty structural object stands for runtime Native values. We neither
  // fabricate recipient/value samples nor relax the stored event JSON Schema.
  return { ...schema, properties: { ...schema.properties, projection: {} } };
}
