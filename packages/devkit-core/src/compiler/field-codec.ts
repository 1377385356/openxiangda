import type { DataFieldDefinition, DataFieldType } from 'openxiangda-contracts';

const MULTI_VALUE_TYPES = new Set<DataFieldType>([
  'option.multiple', 'cascade.multiple', 'user.multiple',
  'department.multiple', 'resource-ref.multiple', 'file', 'image', 'subtable',
]);

export function isMultiValueField(type: DataFieldType) {
  return MULTI_VALUE_TYPES.has(type);
}

export function isGeneratedField(type: DataFieldType) {
  return type === 'serial-number';
}

/**
 * Shared generated-mutation predicate. System and compiler-generated fields
 * may remain readable, but generated mutation inputs never own them.
 */
export function supportsGeneratedMutation(
  field: Pick<DataFieldDefinition, 'type'> & {
    system?: boolean | undefined;
  }
) {
  return field.system !== true && !isGeneratedField(field.type);
}

export function fieldNullable(field: Pick<DataFieldDefinition, 'type' | 'nullable'>) {
  return !isMultiValueField(field.type) && !isGeneratedField(field.type)
    ? field.nullable !== false
    : false;
}

export function typescriptType(type: DataFieldType): string {
  switch (type) {
    case 'text.short': case 'text.long': case 'text.rich': case 'date':
    case 'time': case 'datetime': case 'uuid': case 'serial-number':
      return 'string';
    case 'number.integer': case 'number.decimal':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date-range': case 'datetime-range':
      return 'DateRangeValue';
    case 'option.single': return 'LabeledValue';
    case 'option.multiple': return 'LabeledValue[]';
    case 'cascade.single': return 'CascadePathValue';
    case 'cascade.multiple': return 'CascadePathValue[]';
    case 'user.single': return 'UserReferenceValue';
    case 'user.multiple': return 'UserReferenceValue[]';
    case 'department.single': return 'DepartmentReferenceValue';
    case 'department.multiple': return 'DepartmentReferenceValue[]';
    case 'resource-ref.single': return 'ResourceReferenceValue';
    case 'resource-ref.multiple': return 'ResourceReferenceValue[]';
    case 'file': return 'DataFileRef[]';
    case 'image': return 'DataImageRef[]';
    case 'signature': return 'StableSignatureValue';
    case 'address': return 'StableAddressValue';
    case 'location': return 'StableLocationValue';
    case 'subtable': return 'Array<Record<string, unknown>>';
    case 'json': return 'unknown';
  }
}

export const FIELD_VALUE_TYPESCRIPT_DECLARATIONS = `
export interface LabeledValue {
  label: string;
  value: string;
  description?: string;
  color?: string;
}
export interface ResourceReferenceValue extends LabeledValue {
  resourceCode: string;
  snapshot?: Record<string, unknown>;
}
export interface DepartmentReferenceValue extends LabeledValue {
  fullPath?: string;
  path?: LabeledValue[];
  parent?: LabeledValue;
}
export interface UserReferenceValue extends LabeledValue {
  avatarUrl?: string;
  employeeNo?: string;
  title?: string;
  mobile?: string;
  email?: string;
  departments?: DepartmentReferenceValue[];
}
export interface DateRangeValue { start: string; end: string; }
export type CascadePathValue = LabeledValue[];
export interface DataFileRef {
  schemaVersion: 'openxiangda.data-file-ref/v2';
  id: string;
  name: string;
  size: number;
  contentType: string;
}
export interface DataImageRef extends DataFileRef {
  width: number;
  height: number;
  thumbnailUrl: string;
  previewUrl: string;
}
export interface StableSignatureValue {
  file: Omit<DataFileRef, 'schemaVersion'>;
  signer?: UserReferenceValue;
  signedAt: string;
  points?: Array<{ x: number; y: number; t: number }>;
  hash: string;
}
export interface StableAddressValue {
  country?: LabeledValue;
  province?: LabeledValue;
  city?: LabeledValue;
  district?: LabeledValue;
  street?: LabeledValue;
  detail?: string;
  fullAddress?: string;
}
export interface StableLocationSnapshot {
  address?: string;
  name?: string;
  province?: string;
  city?: string;
  district?: string;
  accuracy?: number;
  capturedAt?: string;
}
export type StableLocationValue = StableLocationSnapshot & {
  source: 'browser' | 'dingTalk';
  longitude: number;
  latitude: number;
};
`.trim();
