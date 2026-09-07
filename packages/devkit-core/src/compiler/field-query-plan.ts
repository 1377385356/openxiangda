import type {
  DataFieldType,
  DataQueryOperator,
} from 'openxiangda-contracts';

const SEARCHABLE_TYPES = new Set<DataFieldType>([
  'text.short', 'text.long', 'text.rich', 'option.single', 'user.single',
  'department.single', 'resource-ref.single', 'serial-number',
]);

const UNSORTABLE_TYPES = new Set<DataFieldType>([
  'option.multiple', 'cascade.single', 'cascade.multiple', 'user.multiple',
  'department.multiple', 'resource-ref.multiple', 'file', 'image', 'signature',
  'address', 'location', 'json', 'subtable',
]);

const TEXT_OPERATORS = [
  'eq', 'neq', 'contains', 'startsWith', 'endsWith', 'in', 'isEmpty',
  'isNotEmpty',
] as const satisfies readonly DataQueryOperator[];
const ORDERED_OPERATORS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'isEmpty',
] as const satisfies readonly DataQueryOperator[];
const BOOLEAN_OPERATORS = [
  'eq', 'neq', 'in', 'isEmpty',
] as const satisfies readonly DataQueryOperator[];
const SINGLE_SNAPSHOT_OPERATORS = [
  'eq', 'neq', 'in', 'isEmpty', 'isNotEmpty',
] as const satisfies readonly DataQueryOperator[];
const MULTI_SNAPSHOT_OPERATORS = [
  'has', 'hasAny', 'hasAll', 'isEmpty', 'isNotEmpty',
] as const satisfies readonly DataQueryOperator[];
const RANGE_OPERATORS = [
  'overlaps', 'contains', 'containedBy', 'isEmpty',
] as const satisfies readonly DataQueryOperator[];
const JSON_OPERATORS = [
  'jsonContains', 'isEmpty', 'isNotEmpty',
] as const satisfies readonly DataQueryOperator[];
const EMPTY_OPERATORS = [
  'isEmpty', 'isNotEmpty',
] as const satisfies readonly DataQueryOperator[];
const UUID_OPERATORS = [
  'eq', 'neq', 'in', 'isEmpty',
] as const satisfies readonly DataQueryOperator[];
const SERIAL_OPERATORS = [
  'eq', 'neq', 'in', 'contains', 'startsWith',
] as const satisfies readonly DataQueryOperator[];

const OPERATORS_BY_TYPE: Record<
  DataFieldType,
  readonly DataQueryOperator[]
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
  uuid: UUID_OPERATORS,
  json: JSON_OPERATORS,
  'serial-number': SERIAL_OPERATORS,
  subtable: [],
};

export function supportsSearch(type: DataFieldType) {
  return SEARCHABLE_TYPES.has(type);
}

export function supportsSort(type: DataFieldType) {
  return !UNSORTABLE_TYPES.has(type);
}

export function supportsFilter(type: DataFieldType) {
  return operatorsForField(type).length > 0;
}

export function operatorsForField(type: DataFieldType) {
  return OPERATORS_BY_TYPE[type];
}

export function supportsOperator(
  type: DataFieldType,
  operator: DataQueryOperator
) {
  return operatorsForField(type).includes(operator);
}

export type FieldAggregateMeasure =
  | 'countDistinct'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max';

export interface FieldAggregatePlan {
  valueExpression: 'column' | 'snapshot-value';
  numericResult: boolean;
}

const AGGREGATE_NUMERIC_TYPES = new Set<DataFieldType>([
  'number.integer', 'number.decimal',
]);
const AGGREGATE_ORDERED_TYPES = new Set<DataFieldType>([
  'text.short', 'text.long', 'number.integer', 'number.decimal', 'date', 'time',
  'datetime', 'serial-number',
]);
const AGGREGATE_DISTINCT_SCALAR_TYPES = new Set<DataFieldType>([
  ...AGGREGATE_ORDERED_TYPES, 'boolean', 'uuid',
]);
const AGGREGATE_DISTINCT_SNAPSHOT_TYPES = new Set<DataFieldType>([
  'option.single', 'user.single', 'department.single', 'resource-ref.single',
]);

export function aggregatePlanForField(
  type: DataFieldType,
  measure: FieldAggregateMeasure
): FieldAggregatePlan | null {
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
