import { NativeDataFieldTypeV2 } from './data-field.js';

export type NativeDataQueryOperatorV2 =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'between'
  | 'has'
  | 'hasAny'
  | 'hasAll'
  | 'overlaps'
  | 'containedBy'
  | 'jsonContains'
  | 'isEmpty'
  | 'isNotEmpty';

export const NATIVE_DATA_QUERY_OPERATORS_V2: readonly NativeDataQueryOperatorV2[] =
  [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'contains',
    'startsWith',
    'endsWith',
    'in',
    'between',
    'has',
    'hasAny',
    'hasAll',
    'overlaps',
    'containedBy',
    'jsonContains',
    'isEmpty',
    'isNotEmpty',
  ];

const NATIVE_DATA_QUERY_OPERATOR_SET_V2 = new Set<string>(
  NATIVE_DATA_QUERY_OPERATORS_V2
);

export function isNativeDataQueryOperatorV2(
  value: unknown
): value is NativeDataQueryOperatorV2 {
  return NATIVE_DATA_QUERY_OPERATOR_SET_V2.has(String(value));
}

const TEXT_OPERATORS: NativeDataQueryOperatorV2[] = [
  'eq',
  'neq',
  'contains',
  'startsWith',
  'endsWith',
  'in',
  'isEmpty',
  'isNotEmpty',
];
const ORDERED_OPERATORS: NativeDataQueryOperatorV2[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'in',
  'isEmpty',
];
const BOOLEAN_OPERATORS: NativeDataQueryOperatorV2[] = [
  'eq',
  'neq',
  'in',
  'isEmpty',
];
const SINGLE_SNAPSHOT_OPERATORS: NativeDataQueryOperatorV2[] = [
  'eq',
  'neq',
  'in',
  'isEmpty',
  'isNotEmpty',
];
const MULTI_SNAPSHOT_OPERATORS: NativeDataQueryOperatorV2[] = [
  'has',
  'hasAny',
  'hasAll',
  'isEmpty',
  'isNotEmpty',
];
const RANGE_OPERATORS: NativeDataQueryOperatorV2[] = [
  'overlaps',
  'contains',
  'containedBy',
  'isEmpty',
];
const JSON_OPERATORS: NativeDataQueryOperatorV2[] = [
  'jsonContains',
  'isEmpty',
  'isNotEmpty',
];
const EMPTY_OPERATORS: NativeDataQueryOperatorV2[] = ['isEmpty', 'isNotEmpty'];

const OPERATORS_BY_TYPE: Record<
  NativeDataFieldTypeV2,
  readonly NativeDataQueryOperatorV2[]
> = {
  'text.short': TEXT_OPERATORS,
  'text.long': TEXT_OPERATORS,
  'text.rich': TEXT_OPERATORS,
  'number.integer': ORDERED_OPERATORS,
  'number.decimal': ORDERED_OPERATORS,
  boolean: BOOLEAN_OPERATORS,
  date: ORDERED_OPERATORS,
  time: ORDERED_OPERATORS,
  datetime: ORDERED_OPERATORS,
  'date-range': RANGE_OPERATORS,
  'datetime-range': RANGE_OPERATORS,
  'option.single': SINGLE_SNAPSHOT_OPERATORS,
  'option.multiple': MULTI_SNAPSHOT_OPERATORS,
  'cascade.single': MULTI_SNAPSHOT_OPERATORS,
  'cascade.multiple': MULTI_SNAPSHOT_OPERATORS,
  'user.single': SINGLE_SNAPSHOT_OPERATORS,
  'user.multiple': MULTI_SNAPSHOT_OPERATORS,
  'department.single': SINGLE_SNAPSHOT_OPERATORS,
  'department.multiple': MULTI_SNAPSHOT_OPERATORS,
  'resource-ref.single': SINGLE_SNAPSHOT_OPERATORS,
  'resource-ref.multiple': MULTI_SNAPSHOT_OPERATORS,
  file: EMPTY_OPERATORS,
  image: EMPTY_OPERATORS,
  signature: EMPTY_OPERATORS,
  address: JSON_OPERATORS,
  location: JSON_OPERATORS,
  uuid: ['eq', 'neq', 'in', 'isEmpty'],
  json: JSON_OPERATORS,
  'serial-number': ['eq', 'neq', 'in', 'contains', 'startsWith'],
  subtable: [],
};

const SEARCHABLE_TYPES = new Set<NativeDataFieldTypeV2>([
  'text.short',
  'text.long',
  'text.rich',
  'option.single',
  'user.single',
  'department.single',
  'resource-ref.single',
  'serial-number',
]);

const UNSORTABLE_TYPES = new Set<NativeDataFieldTypeV2>([
  'option.multiple',
  'cascade.single',
  'cascade.multiple',
  'user.multiple',
  'department.multiple',
  'resource-ref.multiple',
  'file',
  'image',
  'signature',
  'address',
  'location',
  'json',
  'subtable',
]);

export function nativeOperatorsForFieldV2(type: NativeDataFieldTypeV2) {
  return OPERATORS_BY_TYPE[type];
}

export function nativeFieldSupportsOperatorV2(
  type: NativeDataFieldTypeV2,
  operator: NativeDataQueryOperatorV2
) {
  return nativeOperatorsForFieldV2(type).includes(operator);
}

export function nativeFieldSupportsSearchV2(type: NativeDataFieldTypeV2) {
  return SEARCHABLE_TYPES.has(type);
}

export function nativeFieldSupportsSortV2(type: NativeDataFieldTypeV2) {
  return !UNSORTABLE_TYPES.has(type);
}

export function nativeFieldSupportsFilterV2(type: NativeDataFieldTypeV2) {
  return nativeOperatorsForFieldV2(type).length > 0;
}

export type NativeDataAggregateMeasureTypeV2 =
  | 'countDistinct'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max';

export interface NativeDataFieldAggregatePlanV2 {
  valueExpression: 'column' | 'snapshot-value';
  numericResult: boolean;
}

const AGGREGATE_NUMERIC_TYPES = new Set<NativeDataFieldTypeV2>([
  'number.integer',
  'number.decimal',
]);
const AGGREGATE_ORDERED_TYPES = new Set<NativeDataFieldTypeV2>([
  'text.short',
  'text.long',
  'number.integer',
  'number.decimal',
  'date',
  'time',
  'datetime',
  'serial-number',
]);
const AGGREGATE_DISTINCT_SCALAR_TYPES = new Set<NativeDataFieldTypeV2>([
  ...AGGREGATE_ORDERED_TYPES,
  'boolean',
  'uuid',
]);
const AGGREGATE_DISTINCT_SNAPSHOT_TYPES = new Set<NativeDataFieldTypeV2>([
  'option.single',
  'user.single',
  'department.single',
  'resource-ref.single',
]);

export function nativeFieldAggregatePlanV2(
  type: NativeDataFieldTypeV2,
  measure: NativeDataAggregateMeasureTypeV2
): NativeDataFieldAggregatePlanV2 | null {
  if (measure === 'sum' || measure === 'avg') {
    return AGGREGATE_NUMERIC_TYPES.has(type)
      ? { valueExpression: 'column', numericResult: true }
      : null;
  }
  if (measure === 'min' || measure === 'max') {
    return AGGREGATE_ORDERED_TYPES.has(type)
      ? {
          valueExpression: 'column',
          numericResult: AGGREGATE_NUMERIC_TYPES.has(type),
        }
      : null;
  }
  if (AGGREGATE_DISTINCT_SNAPSHOT_TYPES.has(type)) {
    return { valueExpression: 'snapshot-value', numericResult: true };
  }
  return AGGREGATE_DISTINCT_SCALAR_TYPES.has(type)
    ? { valueExpression: 'column', numericResult: true }
    : null;
}
