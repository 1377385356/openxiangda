import { NativeDataFieldV2 } from './data-field.js';

const SNAPSHOT_VALUE_TYPES = new Set<NativeDataFieldV2['type']>([
  'option.single',
  'option.multiple',
  'user.single',
  'user.multiple',
  'department.single',
  'department.multiple',
  'resource-ref.single',
  'resource-ref.multiple',
]);
const JSON_FIELD_TYPES = new Set<NativeDataFieldV2['type']>([
  ...SNAPSHOT_VALUE_TYPES,
  'cascade.single',
  'cascade.multiple',
  'file',
  'image',
  'signature',
  'address',
  'location',
  'json',
]);
const FIELD_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const UNSAFE_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export type NativeScopeSourceResourceFieldsV2 = ReadonlyMap<
  string,
  ReadonlyMap<string, NativeDataFieldV2>
>;

export interface NativeScopeSourceDimensionV2 {
  valueType: 'string' | 'uuid';
  valueSourceResourceCode?: string;
}

export interface NativeScopeSourceResolvedFieldPathV2 {
  field: NativeDataFieldV2;
  valuePath?: string;
}

export class NativeScopeSourceFieldPathV2Error extends Error {
  readonly code = 'OPENXIANGDA_SCOPE_PROJECTION_FIELD_PATH_INVALID';

  constructor(readonly path: string) {
    super('OPENXIANGDA_SCOPE_PROJECTION_FIELD_PATH_INVALID');
    this.name = 'NativeScopeSourceFieldPathV2Error';
  }
}

export function resolveNativeScopeSourceFieldPathV2(
  path: unknown,
  fields: ReadonlyMap<string, NativeDataFieldV2>
): NativeScopeSourceResolvedFieldPathV2 | null {
  const segments = nativeScopeSourceFieldPathSegmentsV2(path);
  if (!segments) return null;
  const field = fields.get(segments[0]!);
  if (!field) return null;
  const valuePath = segments.slice(1).join('.') || undefined;
  return { field, ...(valuePath ? { valuePath } : {}) };
}

export function nativeScopeSourceSubjectPathSupportedV2(
  resolved: NativeScopeSourceResolvedFieldPathV2 | null
) {
  return Boolean(
    resolved &&
      resolved.field.type === 'user.single' &&
      resolved.valuePath === 'value'
  );
}

export function nativeScopeSourceGrantPathSupportedV2(
  resolved: NativeScopeSourceResolvedFieldPathV2 | null,
  dimension: NativeScopeSourceDimensionV2 | undefined,
  resources: NativeScopeSourceResourceFieldsV2
) {
  if (!resolved || !dimension || !genericPathSupported(resolved)) return false;
  const { field, valuePath } = resolved;
  if (!valuePath) {
    return dimension.valueType === 'uuid'
      ? field.type === 'uuid'
      : ['text.short', 'text.long', 'serial-number'].includes(field.type);
  }
  if (valuePath === 'value') {
    return !(
      dimension.valueSourceResourceCode &&
      field.type.startsWith('resource-ref.') &&
      field.source?.resourceCode !== dimension.valueSourceResourceCode
    );
  }
  const snapshotField = valuePath.slice('snapshot.'.length);
  const target = resources.get(field.source?.resourceCode || '');
  const targetType = target?.get(snapshotField)?.type;
  return dimension.valueType === 'uuid'
    ? targetType === 'uuid'
    : ['text.short', 'text.long', 'serial-number'].includes(targetType || '');
}

export function nativeScopeSourceFieldValueV2(
  row: Record<string, any>,
  path: unknown
) {
  const segments = nativeScopeSourceFieldPathSegmentsV2(path);
  if (!segments) {
    throw new NativeScopeSourceFieldPathV2Error(String(path || ''));
  }
  let value: unknown = row;
  for (const segment of segments) {
    if (
      !value ||
      typeof value !== 'object' ||
      !Object.prototype.hasOwnProperty.call(value, segment)
    ) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function genericPathSupported(resolved: NativeScopeSourceResolvedFieldPathV2) {
  const { field, valuePath } = resolved;
  if (!valuePath) return !JSON_FIELD_TYPES.has(field.type);
  if (valuePath === 'value') return SNAPSHOT_VALUE_TYPES.has(field.type);
  if (!valuePath.startsWith('snapshot.')) return false;
  const snapshotField = valuePath.slice('snapshot.'.length);
  return (
    FIELD_CODE_PATTERN.test(snapshotField) &&
    field.type.startsWith('resource-ref.') &&
    Boolean(field.source?.snapshotFields?.includes(snapshotField))
  );
}

function nativeScopeSourceFieldPathSegmentsV2(path: unknown) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 192) {
    return null;
  }
  const segments = path.split('.');
  if (
    ![1, 2, 3].includes(segments.length) ||
    segments.some(
      segment =>
        !FIELD_CODE_PATTERN.test(segment) || UNSAFE_SEGMENTS.has(segment)
    ) ||
    (segments.length === 2 && segments[1] !== 'value') ||
    (segments.length === 3 && segments[1] !== 'snapshot')
  ) {
    return null;
  }
  return segments;
}
