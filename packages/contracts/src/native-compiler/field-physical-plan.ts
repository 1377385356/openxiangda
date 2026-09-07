import { createHash } from 'crypto';
import {
  isNativeMultiValueFieldV2,
  NativeDataFieldTypeV2,
  NativeDataFieldV2,
} from './data-field.js';

export type NativeFieldIndexKindV2 =
  | 'btree'
  | 'btree-snapshot-expressions'
  | 'gin-jsonb-path'
  | 'gist-range'
  | 'gin-trigram'
  | 'none';

export interface NativePhysicalFieldV2 {
  code: string;
  type: NativeDataFieldTypeV2;
  nullable: boolean;
  indexed: boolean;
  storage: string;
  index: NativeFieldIndexKindV2;
  rangeBoundary?: 'closed' | 'half-open';
  serial?: {
    prefix: string;
    digits: number;
    start: number;
  };
  subtable?: {
    resourceCode: string;
    foreignKey: string;
    orderField: string;
    maxRows: number;
  };
}

const SINGLE_SNAPSHOT_TYPES = new Set<NativeDataFieldTypeV2>([
  'option.single',
  'user.single',
  'department.single',
  'resource-ref.single',
]);
const GIN_JSON_TYPES = new Set<NativeDataFieldTypeV2>([
  'option.multiple',
  'cascade.single',
  'cascade.multiple',
  'user.multiple',
  'department.multiple',
  'resource-ref.multiple',
  'address',
  'location',
  'json',
]);
const JSON_ARRAY_TYPES = new Set<NativeDataFieldTypeV2>([
  'option.multiple',
  'cascade.single',
  'cascade.multiple',
  'user.multiple',
  'department.multiple',
  'resource-ref.multiple',
  'file',
  'image',
]);
const JSON_OBJECT_TYPES = new Set<NativeDataFieldTypeV2>([
  'option.single',
  'user.single',
  'department.single',
  'resource-ref.single',
  'signature',
  'address',
  'location',
]);
const JSONB_TYPES = new Set<NativeDataFieldTypeV2>([
  ...SINGLE_SNAPSHOT_TYPES,
  ...JSON_ARRAY_TYPES,
  'signature',
  'address',
  'location',
  'json',
]);

export function nativePhysicalFieldsV2(
  fields: NativeDataFieldV2[],
  surface: Record<string, any> | undefined
): NativePhysicalFieldV2[] {
  const searchable = new Set<string>([
    ...(Array.isArray(surface?.list?.searchableFields)
      ? surface.list.searchableFields
      : []),
    ...Object.entries(surface?.fields || {})
      .filter(
        ([, value]) => (value as Record<string, any>)?.searchable === true
      )
      .map(([code]) => code),
  ]);
  return fields
    .map(field => nativePhysicalFieldV2(field, searchable.has(field.code)))
    .sort((left, right) => left.code.localeCompare(right.code));
}

export function nativePhysicalFieldV2(
  field: NativeDataFieldV2,
  searchable = false
): NativePhysicalFieldV2 {
  const rangeType =
    field.type === 'date-range' || field.type === 'datetime-range';
  if (
    rangeType &&
    field.rangeBoundary !== 'closed' &&
    field.rangeBoundary !== 'half-open'
  ) {
    throw new Error('OPENXIANGDA_NATIVE_DATA_RANGE_BOUNDARY_INVALID');
  }
  return {
    code: field.code,
    type: field.type,
    // Requiredness belongs to the immutable logical declaration and the Data
    // API validator. Physical business columns stay nullable so a new logical
    // requirement never turns an application release into a data migration.
    nullable: true,
    indexed: field.indexed === true,
    storage: storageForField(field),
    index: indexForField(field, searchable),
    ...(rangeType
      ? { rangeBoundary: field.rangeBoundary as 'closed' | 'half-open' }
      : {}),
    ...(field.type === 'serial-number'
      ? {
          serial: {
            prefix: field.serial?.prefix || '',
            digits: field.serial?.digits ?? 6,
            start: field.serial?.start ?? 1,
          },
        }
      : {}),
    ...(field.type === 'subtable' && field.subtable
      ? {
          subtable: {
            resourceCode: field.subtable.resourceCode,
            foreignKey: field.subtable.foreignKey,
            orderField: field.subtable.orderField,
            maxRows: field.subtable.maxRows ?? 20,
          },
        }
      : {}),
  };
}

export function nativeFieldColumnDefinitionV2(
  tableName: string,
  field: NativePhysicalFieldV2
) {
  if (field.type === 'subtable') return null;
  const column = quoteNativeIdentifierV2(field.code);
  const defaultValue = defaultSql(tableName, field);
  const constraints = [
    defaultValue ? ` DEFAULT ${defaultValue}` : '',
    jsonConstraint(column, field),
    rangeConstraint(column, field),
  ].join('');
  return `${column} ${field.storage}${constraints}`;
}

/**
 * Returns the server-owned default expression for a physical field.
 *
 * The prepare path uses the same expression for CREATE TABLE and for
 * reconciliation of an already-existing Native table. Keeping this derived
 * from the physical plan prevents an optional field from inheriting a stale
 * default after its active contract changes.
 */
export function nativeFieldDefaultSqlV2(
  tableName: string,
  field: NativePhysicalFieldV2
) {
  return defaultSql(tableName, field);
}

function rangeConstraint(column: string, field: NativePhysicalFieldV2) {
  if (field.type !== 'date-range' && field.type !== 'datetime-range') return '';
  if (field.rangeBoundary !== 'closed' && field.rangeBoundary !== 'half-open') {
    throw new Error('OPENXIANGDA_NATIVE_DATA_RANGE_BOUNDARY_INVALID');
  }
  const upperInclusive =
    field.type === 'datetime-range' && field.rangeBoundary === 'closed';
  return ` CHECK (${column} IS NULL OR (NOT isempty(${column}) AND lower(${column}) IS NOT NULL AND upper(${column}) IS NOT NULL AND lower_inc(${column}) AND ${
    upperInclusive ? '' : 'NOT '
  }upper_inc(${column})))`;
}

export function nativeFieldHasDefaultV2(field: NativePhysicalFieldV2) {
  return (
    field.type === 'serial-number' ||
    (isNativeMultiValueFieldV2(field.type) && field.type !== 'subtable')
  );
}

export function nativeFieldSequenceStatementsV2(
  tableName: string,
  fields: NativePhysicalFieldV2[]
) {
  return fields
    .filter(field => field.type === 'serial-number')
    .map(field => {
      const sequence = qualifiedSequence(tableName, field.code);
      const start = field.serial?.start ?? 1;
      return `CREATE SEQUENCE IF NOT EXISTS ${sequence} AS bigint MINVALUE ${start} START WITH ${start} CACHE 1`;
    });
}

export function nativeFieldSequenceOwnershipStatementsV2(
  tableName: string,
  fields: NativePhysicalFieldV2[]
) {
  const table = qualifiedTable(tableName);
  return fields
    .filter(field => field.type === 'serial-number')
    .map(
      field =>
        `ALTER SEQUENCE ${qualifiedSequence(
          tableName,
          field.code
        )} OWNED BY ${table}.${quoteNativeIdentifierV2(field.code)}`
    );
}

export function nativeFieldSequenceGrantStatementsV2(
  tableName: string,
  fields: NativePhysicalFieldV2[]
) {
  return fields
    .filter(field => field.type === 'serial-number')
    .map(
      field =>
        `GRANT USAGE, SELECT ON SEQUENCE ${qualifiedSequence(
          tableName,
          field.code
        )} TO "openxiangda_data_api"`
    );
}

export function nativeFieldIndexStatementsV2(
  tableName: string,
  fields: NativePhysicalFieldV2[]
) {
  const table = qualifiedTable(tableName);
  const statements: string[] = [];
  for (const field of fields) {
    if (field.type === 'subtable') continue;
    const column = quoteNativeIdentifierV2(field.code);
    const index = quoteNativeIdentifierV2(
      nativePhysicalObjectNameV2('idx', tableName, field.code, field.index)
    );
    switch (field.index) {
      case 'btree':
        statements.push(
          `CREATE INDEX IF NOT EXISTS ${index} ON ${table} (${column})`
        );
        break;
      case 'btree-snapshot-expressions': {
        const valueIndex = quoteNativeIdentifierV2(
          nativePhysicalObjectNameV2(
            'idx',
            tableName,
            field.code,
            'snapshot-value'
          )
        );
        const labelIndex = quoteNativeIdentifierV2(
          nativePhysicalObjectNameV2(
            'idx',
            tableName,
            field.code,
            'snapshot-label'
          )
        );
        statements.push(
          `CREATE INDEX IF NOT EXISTS ${valueIndex} ON ${table} ((${column} ->> 'value'))`,
          `CREATE INDEX IF NOT EXISTS ${labelIndex} ON ${table} ((${column} ->> 'label'))`
        );
        break;
      }
      case 'gin-jsonb-path':
        statements.push(
          `CREATE INDEX IF NOT EXISTS ${index} ON ${table} USING GIN (${column} jsonb_path_ops)`
        );
        break;
      case 'gist-range':
        statements.push(
          `CREATE INDEX IF NOT EXISTS ${index} ON ${table} USING GIST (${column})`
        );
        break;
      case 'gin-trigram': {
        const expression = SINGLE_SNAPSHOT_TYPES.has(field.type)
          ? `((${column} ->> 'label')) gin_trgm_ops`
          : `${column} gin_trgm_ops`;
        statements.push(
          `CREATE INDEX IF NOT EXISTS ${index} ON ${table} USING GIN (${expression})`
        );
        break;
      }
      case 'none':
        break;
    }
    if (field.type === 'serial-number') {
      const unique = quoteNativeIdentifierV2(
        nativePhysicalObjectNameV2('uidx', tableName, field.code, 'serial')
      );
      statements.push(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${unique} ON ${table} (${column})`
      );
    }
  }
  return statements;
}

export function nativeSubtableConstraintStatementsV2(
  parentTableName: string,
  childTableName: string,
  foreignKey: string,
  orderField: string
) {
  const parent = qualifiedTable(parentTableName);
  const child = qualifiedTable(childTableName);
  const uniqueName = quoteNativeIdentifierV2(
    nativePhysicalObjectNameV2(
      'uidx',
      parentTableName,
      'environment_id',
      'subtable-parent'
    )
  );
  const childIndexName = quoteNativeIdentifierV2(
    nativePhysicalObjectNameV2(
      'idx',
      childTableName,
      foreignKey,
      orderField,
      'subtable-child'
    )
  );
  const constraintName = quoteNativeIdentifierV2(
    nativePhysicalObjectNameV2(
      'fk',
      childTableName,
      foreignKey,
      parentTableName
    )
  );
  const foreignKeyColumn = quoteNativeIdentifierV2(foreignKey);
  const orderColumn = quoteNativeIdentifierV2(orderField);
  return [
    `CREATE UNIQUE INDEX IF NOT EXISTS ${uniqueName} ON ${parent} ("tenant_id", "app_code", "environment_key", "id")`,
    `CREATE INDEX IF NOT EXISTS ${childIndexName} ON ${child} ("tenant_id", "app_code", "environment_key", ${foreignKeyColumn}, ${orderColumn}, "id")`,
    `DO $native_subtable$ BEGIN
       ALTER TABLE ${child}
       ADD CONSTRAINT ${constraintName}
       FOREIGN KEY ("tenant_id", "app_code", "environment_key", ${foreignKeyColumn})
       REFERENCES ${parent} ("tenant_id", "app_code", "environment_key", "id")
       ON DELETE CASCADE;
     EXCEPTION WHEN duplicate_object THEN NULL;
     END $native_subtable$`,
  ];
}

export function nativePhysicalObjectNameV2(prefix: string, ...parts: string[]) {
  return `${prefix}_${createHash('sha256')
    .update(parts.join(':'))
    .digest('hex')
    .slice(0, 32)}`;
}

export function quoteNativeIdentifierV2(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    throw new Error('OPENXIANGDA_NATIVE_IDENTIFIER_INVALID');
  }
  return `"${value}"`;
}

function indexForField(
  field: NativeDataFieldV2,
  searchable: boolean
): NativeFieldIndexKindV2 {
  if (field.type === 'subtable') return 'none';
  if (searchable) return 'gin-trigram';
  if (!field.indexed) return 'none';
  if (['date-range', 'datetime-range'].includes(field.type))
    return 'gist-range';
  if (SINGLE_SNAPSHOT_TYPES.has(field.type)) {
    return 'btree-snapshot-expressions';
  }
  if (GIN_JSON_TYPES.has(field.type)) return 'gin-jsonb-path';
  return 'btree';
}

function storageForField(field: NativeDataFieldV2) {
  switch (field.type) {
    case 'text.short':
      return `varchar(${field.maxLength ?? 255})`;
    case 'text.long':
    case 'text.rich':
      return 'text';
    case 'number.integer':
      return 'bigint';
    case 'number.decimal':
      return `numeric(${field.precision ?? 38},${field.scale ?? 10})`;
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'time':
      return 'time(0)';
    case 'datetime':
      return 'timestamptz';
    case 'date-range':
      return 'daterange';
    case 'datetime-range':
      return 'tstzrange';
    case 'uuid':
      return 'uuid';
    case 'serial-number':
      return 'varchar(255)';
    case 'subtable':
      return 'child-resource';
    default:
      return JSONB_TYPES.has(field.type) ? 'jsonb' : 'jsonb';
  }
}

function defaultSql(tableName: string, field: NativePhysicalFieldV2) {
  if (isNativeMultiValueFieldV2(field.type) && field.type !== 'subtable') {
    return "'[]'::jsonb";
  }
  if (field.type !== 'serial-number') return '';
  const prefix = quoteLiteral(field.serial?.prefix || '');
  const digits = field.serial?.digits ?? 6;
  return `(${prefix} || lpad(nextval(${quoteLiteral(
    qualifiedSequence(tableName, field.code)
  )})::text, ${digits}, '0'))`;
}

function jsonConstraint(column: string, field: NativePhysicalFieldV2) {
  if (JSON_ARRAY_TYPES.has(field.type)) {
    return ` CHECK (${column} IS NULL OR jsonb_typeof(${column}) = 'array')`;
  }
  if (JSON_OBJECT_TYPES.has(field.type)) {
    return ` CHECK (${column} IS NULL OR jsonb_typeof(${column}) = 'object')`;
  }
  return '';
}

function qualifiedTable(tableName: string) {
  return `"app_data".${quoteNativeIdentifierV2(tableName)}`;
}

function qualifiedSequence(tableName: string, fieldCode: string) {
  const name = nativePhysicalObjectNameV2('seq', tableName, fieldCode);
  return `"app_data".${quoteNativeIdentifierV2(name)}`;
}

function quoteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}
