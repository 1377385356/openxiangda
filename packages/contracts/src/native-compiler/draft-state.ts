import { NativeDataFieldContractV2Error } from './data-field.js';

export const OPENXIANGDA_NATIVE_DRAFT_STATE_KEYS_V2 = [
  'version',
  'maxBytes',
  'fields',
] as const;

export function validateNativeDataDraftStateV2(
  value: unknown,
  pointer: string
) {
  if (value === undefined) return;
  const schema = record(value, pointer);
  exactKeys(schema, OPENXIANGDA_NATIVE_DRAFT_STATE_KEYS_V2, pointer);
  const version = boundedInteger(
    schema.version,
    `${pointer}/version`,
    1,
    1_000_000
  );
  const maxBytes = boundedInteger(
    schema.maxBytes,
    `${pointer}/maxBytes`,
    2,
    196_608
  );
  if (!version || !maxBytes)
    issue('NATIVE_DATA_DRAFT_STATE_SCHEMA_INVALID', pointer);
  const fields = record(schema.fields, `${pointer}/fields`);
  const entries = Object.entries(fields);
  if (!entries.length || entries.length > 50)
    issue('NATIVE_DATA_DRAFT_STATE_FIELDS_INVALID', `${pointer}/fields`);
  for (const [code, raw] of entries) {
    const fieldPointer = `${pointer}/fields/${code}`;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(code))
      issue('NATIVE_DATA_DRAFT_STATE_FIELD_CODE_INVALID', fieldPointer);
    const field = record(raw, fieldPointer);
    const type = requiredString(field.type, `${fieldPointer}/type`, 32);
    const allowed =
      type === 'string'
        ? ['type', 'required', 'maxLength', 'enum']
        : type === 'json.object'
          ? ['type', 'required', 'maxBytes']
          : ['type', 'required'];
    if (!['string', 'number', 'integer', 'boolean', 'json.object'].includes(type))
      issue('NATIVE_DATA_DRAFT_STATE_FIELD_TYPE_INVALID', `${fieldPointer}/type`);
    exactKeys(field, allowed, fieldPointer);
    optionalBoolean(field.required, `${fieldPointer}/required`);
    if (type === 'string') {
      const maxLength = boundedInteger(
        field.maxLength,
        `${fieldPointer}/maxLength`,
        1,
        196_608
      );
      if (!maxLength)
        issue('NATIVE_DATA_DRAFT_STATE_FIELD_INVALID', fieldPointer);
      if (field.enum !== undefined) {
        const values = stringArray(
          field.enum,
          `${fieldPointer}/enum`,
          100,
          false
        );
        if (values.some(item => item.length > maxLength))
          issue(
            'NATIVE_DATA_DRAFT_STATE_FIELD_INVALID',
            `${fieldPointer}/enum`
          );
      }
    } else if (type === 'json.object') {
      const fieldMaxBytes = boundedInteger(
        field.maxBytes,
        `${fieldPointer}/maxBytes`,
        2,
        65_536
      );
      if (!fieldMaxBytes || fieldMaxBytes > maxBytes)
        issue('NATIVE_DATA_DRAFT_STATE_FIELD_INVALID', fieldPointer);
    }
  }
}

function stringArray(
  value: unknown,
  pointer: string,
  maximum: number,
  allowEmpty: boolean
) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.length > maximum
  ) {
    issue('NATIVE_DATA_SURFACE_STRING_ARRAY_INVALID', pointer);
  }
  const result = value.map((item, index) =>
    requiredString(item, `${pointer}/${index}`, 255)
  );
  if (new Set(result).size !== result.length) {
    issue('NATIVE_DATA_SURFACE_STRING_ARRAY_INVALID', pointer);
  }
  return result;
}

function record(value: unknown, pointer: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issue('NATIVE_OBJECT_REQUIRED', pointer);
  }
  return value as Record<string, any>;
}

function exactKeys(
  value: Record<string, any>,
  allowed: readonly string[],
  pointer: string
) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key))
      issue('NATIVE_PROPERTY_UNKNOWN', `${pointer}/${key}`);
  }
}

function requiredString(value: unknown, pointer: string, maximum: number) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum
  ) {
    issue('NATIVE_STRING_INVALID', pointer);
  }
  return value;
}

function optionalBoolean(value: unknown, pointer: string) {
  if (value !== undefined && typeof value !== 'boolean') {
    issue('NATIVE_BOOLEAN_REQUIRED', pointer);
  }
}

function boundedInteger(
  value: unknown,
  pointer: string,
  minimum: number,
  maximum: number
) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    issue('NATIVE_INTEGER_INVALID', pointer);
  }
  return Number(value);
}

function issue(code: string, pointer: string): never {
  throw new NativeDataFieldContractV2Error(code, pointer);
}
