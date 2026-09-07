import type { DataFieldDefinition, DataFieldType } from 'openxiangda-contracts';

export type FieldIndexKind =
  | 'btree' | 'btree-snapshot-expressions' | 'gin-jsonb-path'
  | 'gist-range' | 'gin-trigram' | 'none';

export interface FieldPhysicalPlan {
  storage: string;
  index: FieldIndexKind;
  rangeBoundary?: 'closed' | 'half-open';
  childResource?: string;
}

const JSONB_TYPES = new Set<DataFieldType>([
  'option.single', 'option.multiple', 'cascade.single', 'cascade.multiple',
  'user.single', 'user.multiple', 'department.single', 'department.multiple',
  'resource-ref.single', 'resource-ref.multiple', 'file', 'image', 'signature',
  'address', 'location', 'json',
]);
const SINGLE_SNAPSHOT_TYPES = new Set<DataFieldType>([
  'option.single', 'user.single', 'department.single', 'resource-ref.single',
]);
const MULTI_SNAPSHOT_TYPES = new Set<DataFieldType>([
  'option.multiple', 'cascade.single', 'cascade.multiple', 'user.multiple',
  'department.multiple', 'resource-ref.multiple', 'address', 'location',
]);

export function physicalPlanForField(
  field: DataFieldDefinition,
  searchable = false
): FieldPhysicalPlan {
  if (field.type === 'subtable') {
    return {
      storage: 'child-resource',
      index: 'none',
      ...(field.subtable?.resourceCode
        ? { childResource: field.subtable.resourceCode }
        : {}),
    };
  }
  const storage = storageForField(field);
  if (searchable) return { storage, index: 'gin-trigram' };
  if (field.type === 'date-range' || field.type === 'datetime-range') {
    if (field.rangeBoundary !== 'closed' && field.rangeBoundary !== 'half-open') {
      throw new Error('DATA_RESOURCE_FIELD_RANGE_BOUNDARY_REQUIRED');
    }
    return {
      storage,
      index: field.indexed ? 'gist-range' : 'none',
      rangeBoundary: field.rangeBoundary,
    };
  }
  if (SINGLE_SNAPSHOT_TYPES.has(field.type)) {
    return {
      storage,
      index: field.indexed ? 'btree-snapshot-expressions' : 'none',
    };
  }
  if (MULTI_SNAPSHOT_TYPES.has(field.type) || field.type === 'json') {
    return { storage, index: field.indexed ? 'gin-jsonb-path' : 'none' };
  }
  return { storage, index: field.indexed ? 'btree' : 'none' };
}

function storageForField(field: DataFieldDefinition): string {
  switch (field.type) {
    case 'text.short': return `varchar(${field.maxLength ?? 255})`;
    case 'text.long': case 'text.rich': return 'text';
    case 'number.integer': return 'bigint';
    case 'number.decimal': return `numeric(${field.precision ?? 38},${field.scale ?? 10})`;
    case 'boolean': return 'boolean';
    case 'date': return 'date';
    case 'time': return 'time(0)';
    case 'datetime': return 'timestamptz';
    case 'date-range': return 'daterange';
    case 'datetime-range': return 'tstzrange';
    case 'uuid': return 'uuid';
    case 'serial-number': return 'varchar(255)';
    default: return JSONB_TYPES.has(field.type) ? 'jsonb' : 'jsonb';
  }
}
