const FIELD_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const RESOURCE_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const OPENXIANGDA_NATIVE_DATA_FIELD_TYPES_V2 = [
  'text.short',
  'text.long',
  'text.rich',
  'number.integer',
  'number.decimal',
  'boolean',
  'date',
  'time',
  'datetime',
  'date-range',
  'datetime-range',
  'option.single',
  'option.multiple',
  'cascade.single',
  'cascade.multiple',
  'user.single',
  'user.multiple',
  'department.single',
  'department.multiple',
  'resource-ref.single',
  'resource-ref.multiple',
  'image',
  'signature',
  'address',
  'location',
  'uuid',
  'json',
  'file',
  'serial-number',
  'subtable',
] as const;

export type NativeDataFieldTypeV2 =
  (typeof OPENXIANGDA_NATIVE_DATA_FIELD_TYPES_V2)[number];

export type NativeDataRangeBoundaryV2 = 'closed' | 'half-open';

const FIELD_TYPE_SET = new Set<string>(OPENXIANGDA_NATIVE_DATA_FIELD_TYPES_V2);
const MULTI_TYPES = new Set<NativeDataFieldTypeV2>([
  'option.multiple',
  'cascade.multiple',
  'user.multiple',
  'department.multiple',
  'resource-ref.multiple',
  'file',
  'image',
  'subtable',
]);
const OPTION_TYPES = new Set<NativeDataFieldTypeV2>([
  'option.single',
  'option.multiple',
  'cascade.single',
  'cascade.multiple',
]);
const RESOURCE_REFERENCE_TYPES = new Set<NativeDataFieldTypeV2>([
  'resource-ref.single',
  'resource-ref.multiple',
]);

export interface NativeDataFieldOptionV2 {
  label: string;
  value: string;
  description?: string;
  color?: string;
  children?: NativeDataFieldOptionV2[];
}

export type NativeDataFieldSourceFilterV2 =
  | { field: string; operator: 'eq' | 'in'; value: unknown }
  | {
      field: string;
      operator: 'eq' | 'in';
      binding: { kind: 'field'; field: string };
    };

export interface NativeDataFieldResourceSourceV2 {
  kind: 'resource';
  resourceCode: string;
  labelField: string;
  searchFields?: string[];
  descriptionFields?: string[];
  snapshotFields?: string[];
  filters?: NativeDataFieldSourceFilterV2[];
  pageSize?: number;
  loadMode?: 'search' | 'all';
}

export interface NativeDataFieldV2 {
  code: string;
  type: NativeDataFieldTypeV2;
  /**
   * Runtime-only leaf types derived from the active resource graph. This is
   * deliberately absent from the authored field parser and is attached as a
   * non-enumerable property by the Native resource resolver.
   */
  readonly queryPathTypes?: Readonly<Record<string, NativeDataFieldTypeV2>>;
  nullable?: boolean;
  indexed?: boolean;
  options?: NativeDataFieldOptionV2[];
  source?: NativeDataFieldResourceSourceV2;
  maxLength?: number;
  precision?: number;
  scale?: number;
  min?: number;
  max?: number;
  rangeBoundary?: NativeDataRangeBoundaryV2;
  timePrecision?: 'minute' | 'second';
  file?: {
    maxCount?: number;
    maxSizeMb?: number;
    accept?: string[];
  };
  serial?: {
    prefix?: string;
    digits?: number;
    start?: number;
  };
  subtable?: {
    resourceCode: string;
    foreignKey: string;
    orderField: string;
    maxRows?: number;
  };
}

export interface NativeDataResourceInvariantV2 {
  code: string;
  message?: string;
  expression: {
    leftField: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
    rightField: string;
  };
}

export const OPENXIANGDA_NATIVE_SYSTEM_FIELDS_V2: readonly NativeDataFieldV2[] =
  [
    { code: 'id', type: 'uuid', nullable: false },
    { code: 'revision', type: 'number.integer', nullable: false },
    { code: 'created_by', type: 'text.short', nullable: false },
    { code: 'updated_by', type: 'text.short', nullable: false },
    { code: 'created_at', type: 'datetime', nullable: false },
    { code: 'updated_at', type: 'datetime', nullable: false },
  ];

export const OPENXIANGDA_NATIVE_SYSTEM_FIELD_MAP_V2 = new Map(
  OPENXIANGDA_NATIVE_SYSTEM_FIELDS_V2.map(field => [field.code, field])
);

export class NativeDataFieldContractV2Error extends Error {
  constructor(readonly code: string, readonly pointer: string) {
    super(code);
    this.name = 'NativeDataFieldContractV2Error';
  }
}

export function isNativeMultiValueFieldV2(type: NativeDataFieldTypeV2) {
  return MULTI_TYPES.has(type);
}

/** 数组不可为 null 的存储约束不等于业务必填；显式必填事实由字段 surface 保留。 */
export function nativeFieldRequiresCreateInputV2(
  field: Pick<NativeDataFieldV2, 'type' | 'nullable'>,
  surface: { system?: boolean; requiredHint?: boolean } = {}
) {
  return (
    field.type !== 'serial-number' &&
    surface.system !== true &&
    field.nullable === false &&
    (!isNativeMultiValueFieldV2(field.type) || surface.requiredHint === true)
  );
}

export function parseNativeDataFieldsV2(
  value: unknown,
  pointer: string,
  maximum = 500
): NativeDataFieldV2[] {
  if (!Array.isArray(value)) issue('NATIVE_ARRAY_REQUIRED', pointer);
  if (value.length === 0) issue('NATIVE_DATA_FIELDS_REQUIRED', pointer);
  if (value.length > maximum) issue('NATIVE_ARRAY_LIMIT_EXCEEDED', pointer);
  const seen = new Set<string>();
  return value.map((rawField, index) => {
    const fieldPointer = `${pointer}/${index}`;
    const field = record(rawField, fieldPointer);
    exactKeys(
      field,
      [
        'code',
        'type',
        'nullable',
        'indexed',
        'options',
        'source',
        'maxLength',
        'precision',
        'scale',
        'min',
        'max',
        'rangeBoundary',
        'timePrecision',
        'file',
        'serial',
        'subtable',
      ],
      fieldPointer
    );
    const code = requiredString(field.code, `${fieldPointer}/code`, 63);
    if (!FIELD_CODE_PATTERN.test(code)) {
      issue('NATIVE_FIELD_CODE_INVALID', `${fieldPointer}/code`);
    }
    if (seen.has(code)) {
      issue('NATIVE_DATA_FIELD_DUPLICATE', `${fieldPointer}/code`);
    }
    seen.add(code);
    const type = requiredString(field.type, `${fieldPointer}/type`, 32);
    if (!FIELD_TYPE_SET.has(type)) {
      issue('NATIVE_DATA_FIELD_TYPE_INVALID', `${fieldPointer}/type`);
    }
    const semanticType = type as NativeDataFieldTypeV2;
    const nullable = optionalBoolean(
      field.nullable,
      `${fieldPointer}/nullable`
    );
    const indexed = optionalBoolean(field.indexed, `${fieldPointer}/indexed`);
    if (nullable === true && MULTI_TYPES.has(semanticType)) {
      issue(
        'NATIVE_DATA_MULTI_FIELD_NULLABLE_INVALID',
        `${fieldPointer}/nullable`
      );
    }
    const options = parseOptions(field.options, semanticType, fieldPointer);
    const source = parseSource(field.source, semanticType, fieldPointer);
    const scalar = parseScalarConfiguration(field, semanticType, fieldPointer);
    const rangeBoundary = parseRangeBoundary(
      field.rangeBoundary,
      semanticType,
      fieldPointer
    );
    const file = parseFile(field.file, semanticType, fieldPointer);
    const serial = parseSerial(field.serial, semanticType, fieldPointer);
    const subtable = parseSubtable(field.subtable, semanticType, fieldPointer);
    return {
      code,
      type: semanticType,
      ...(nullable === undefined ? {} : { nullable }),
      ...(indexed === undefined ? {} : { indexed }),
      ...(options ? { options } : {}),
      ...(source ? { source } : {}),
      ...scalar,
      ...(rangeBoundary ? { rangeBoundary } : {}),
      ...(file ? { file } : {}),
      ...(serial ? { serial } : {}),
      ...(subtable ? { subtable } : {}),
    };
  });
}

function parseRangeBoundary(
  value: unknown,
  type: NativeDataFieldTypeV2,
  fieldPointer: string
): NativeDataRangeBoundaryV2 | undefined {
  const pointer = `${fieldPointer}/rangeBoundary`;
  const rangeType = type === 'date-range' || type === 'datetime-range';
  if (!rangeType) {
    if (value !== undefined) {
      issue('NATIVE_DATA_FIELD_RANGE_BOUNDARY_TYPE_INVALID', pointer);
    }
    return undefined;
  }
  if (value !== 'closed' && value !== 'half-open') {
    issue('NATIVE_DATA_FIELD_RANGE_BOUNDARY_REQUIRED', pointer);
  }
  return value;
}

export function validateNativeDataResourceReferencesV2(
  resources: unknown,
  pointer: string
) {
  if (!Array.isArray(resources)) issue('NATIVE_ARRAY_REQUIRED', pointer);
  const declared = new Map<
    string,
    { pointer: string; fields: NativeDataFieldV2[] }
  >();
  resources.forEach((rawResource, resourceIndex) => {
    const resourcePointer = `${pointer}/${resourceIndex}`;
    const resource = record(rawResource, resourcePointer);
    const code = requiredString(resource.code, `${resourcePointer}/code`, 64);
    if (!RESOURCE_CODE_PATTERN.test(code) || declared.has(code)) {
      issue('NATIVE_RESOURCE_CODE_INVALID', `${resourcePointer}/code`);
    }
    const schema = record(resource.schema, `${resourcePointer}/schema`);
    declared.set(code, {
      pointer: resourcePointer,
      fields: parseNativeDataFieldsV2(
        schema.fields,
        `${resourcePointer}/schema/fields`
      ),
    });
  });
  for (const [resourceCode, declaration] of declared) {
    const ownFields = new Map(
      declaration.fields.map(field => [field.code, field])
    );
    const aggregateMaxRows = declaration.fields
      .filter(field => field.type === 'subtable')
      .reduce((total, field) => total + (field.subtable?.maxRows ?? 20), 0);
    if (aggregateMaxRows > 49) {
      issue(
        'NATIVE_DATA_FIELD_SUBTABLE_AGGREGATE_MAX_ROWS_EXCEEDED',
        `${declaration.pointer}/schema/fields`
      );
    }
    declaration.fields.forEach((field, fieldIndex) => {
      const fieldPointer = `${declaration.pointer}/schema/fields/${fieldIndex}`;
      if (field.source) {
        validateSourceReferences(
          field.source,
          ownFields,
          declared,
          `${fieldPointer}/source`
        );
      }
      if (field.subtable) {
        const target = declared.get(field.subtable.resourceCode);
        if (!target || field.subtable.resourceCode === resourceCode) {
          issue(
            'NATIVE_DATA_FIELD_SUBTABLE_TARGET_MISSING',
            `${fieldPointer}/subtable/resourceCode`
          );
        }
        const foreignKey = target.fields.find(
          candidate => candidate.code === field.subtable?.foreignKey
        );
        if (
          !foreignKey ||
          foreignKey.type !== 'uuid' ||
          foreignKey.nullable !== false
        ) {
          issue(
            'NATIVE_DATA_FIELD_SUBTABLE_FOREIGN_KEY_INVALID',
            `${fieldPointer}/subtable/foreignKey`
          );
        }
        const orderField = target.fields.find(
          candidate => candidate.code === field.subtable?.orderField
        );
        if (
          !orderField ||
          orderField.type !== 'number.integer' ||
          orderField.nullable !== false
        ) {
          issue(
            'NATIVE_DATA_FIELD_SUBTABLE_ORDER_FIELD_INVALID',
            `${fieldPointer}/subtable/orderField`
          );
        }
      }
    });
  }
}

export function parseNativeDataResourceInvariantsV2(
  value: unknown,
  fields: NativeDataFieldV2[],
  pointer: string
): NativeDataResourceInvariantV2[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    issue('NATIVE_DATA_RESOURCE_INVARIANTS_INVALID', pointer);
  }
  const declared = new Map(fields.map(field => [field.code, field]));
  const codes = new Set<string>();
  return value.map((rawInvariant, index) => {
    const invariantPointer = `${pointer}/${index}`;
    const invariant = record(rawInvariant, invariantPointer);
    exactKeys(invariant, ['code', 'message', 'expression'], invariantPointer);
    const code = requiredString(invariant.code, `${invariantPointer}/code`, 128);
    if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(code) || codes.has(code)) {
      issue('NATIVE_DATA_RESOURCE_INVARIANT_CODE_INVALID', `${invariantPointer}/code`);
    }
    codes.add(code);
    const message = optionalString(
      invariant.message,
      `${invariantPointer}/message`,
      500
    );
    if (message !== undefined && message.length === 0) {
      issue('NATIVE_DATA_RESOURCE_INVARIANT_MESSAGE_INVALID', `${invariantPointer}/message`);
    }
    const expression = record(
      invariant.expression,
      `${invariantPointer}/expression`
    );
    exactKeys(
      expression,
      ['leftField', 'operator', 'rightField'],
      `${invariantPointer}/expression`
    );
    const leftField = fieldCode(
      expression.leftField,
      `${invariantPointer}/expression/leftField`
    );
    const rightField = fieldCode(
      expression.rightField,
      `${invariantPointer}/expression/rightField`
    );
    const left = declared.get(leftField);
    const right = declared.get(rightField);
    if (!left || !right) {
      issue('NATIVE_DATA_RESOURCE_INVARIANT_FIELD_UNKNOWN', `${invariantPointer}/expression`);
    }
    const comparable =
      left.type === right.type ||
      (['number.integer', 'number.decimal'].includes(left.type) &&
        ['number.integer', 'number.decimal'].includes(right.type));
    if (!comparable) {
      issue('NATIVE_DATA_RESOURCE_INVARIANT_FIELD_TYPES_INVALID', `${invariantPointer}/expression`);
    }
    const operator = String(expression.operator);
    if (!['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(operator)) {
      issue('NATIVE_DATA_RESOURCE_INVARIANT_OPERATOR_INVALID', `${invariantPointer}/expression/operator`);
    }
    if (
      !['eq', 'neq'].includes(operator) &&
      ![
        'number.integer',
        'number.decimal',
        'date',
        'time',
        'datetime',
        'text.short',
        'text.long',
        'text.rich',
        'serial-number',
        'uuid',
      ].includes(left.type)
    ) {
      issue('NATIVE_DATA_RESOURCE_INVARIANT_FIELD_TYPES_INVALID', `${invariantPointer}/expression`);
    }
    return {
      code,
      ...(message === undefined ? {} : { message }),
      expression: {
        leftField,
        operator: operator as NativeDataResourceInvariantV2['expression']['operator'],
        rightField,
      },
    };
  });
}

function validateSourceReferences(
  source: NativeDataFieldResourceSourceV2,
  ownFields: Map<string, NativeDataFieldV2>,
  resources: Map<string, { pointer: string; fields: NativeDataFieldV2[] }>,
  pointer: string
) {
  const target = resources.get(source.resourceCode);
  if (!target) {
    issue('NATIVE_DATA_FIELD_SOURCE_TARGET_MISSING', `${pointer}/resourceCode`);
  }
  const targetFields = new Map(target.fields.map(field => [field.code, field]));
  const label = targetFields.get(source.labelField);
  if (!label || !['text.short', 'text.long'].includes(label.type)) {
    issue('NATIVE_DATA_FIELD_SOURCE_LABEL_INVALID', `${pointer}/labelField`);
  }
  for (const key of [
    'searchFields',
    'descriptionFields',
    'snapshotFields',
  ] as const) {
    for (const fieldCode of source[key] || []) {
      if (!targetFields.has(fieldCode)) {
        issue('NATIVE_DATA_FIELD_SOURCE_FIELD_MISSING', `${pointer}/${key}`);
      }
    }
  }
  for (const [index, filter] of (source.filters || []).entries()) {
    if (!targetFields.has(filter.field)) {
      issue(
        'NATIVE_DATA_FIELD_SOURCE_FILTER_FIELD_MISSING',
        `${pointer}/filters/${index}/field`
      );
    }
    if ('binding' in filter && !ownFields.has(filter.binding.field)) {
      issue(
        'NATIVE_DATA_FIELD_SOURCE_BINDING_FIELD_MISSING',
        `${pointer}/filters/${index}/binding/field`
      );
    }
  }
}

function parseOptions(
  value: unknown,
  type: NativeDataFieldTypeV2,
  fieldPointer: string
): NativeDataFieldOptionV2[] | undefined {
  const pointer = `${fieldPointer}/options`;
  if (value === undefined) {
    if (OPTION_TYPES.has(type))
      issue('NATIVE_DATA_FIELD_OPTIONS_REQUIRED', pointer);
    return undefined;
  }
  if (!OPTION_TYPES.has(type) || !Array.isArray(value)) {
    issue('NATIVE_DATA_FIELD_OPTIONS_TYPE_INVALID', pointer);
  }
  if (value.length < 1 || value.length > 100) {
    issue('NATIVE_DATA_FIELD_OPTIONS_INVALID', pointer);
  }
  let total = 0;
  const visit = (
    values: unknown[],
    currentPointer: string,
    depth: number
  ): NativeDataFieldOptionV2[] => {
    if (depth > 5)
      issue('NATIVE_DATA_FIELD_OPTIONS_DEPTH_EXCEEDED', currentPointer);
    const siblings = new Set<string>();
    return values.map((rawOption, index) => {
      total += 1;
      if (total > 1000)
        issue('NATIVE_DATA_FIELD_OPTIONS_COUNT_EXCEEDED', pointer);
      const optionPointer = `${currentPointer}/${index}`;
      const option = record(rawOption, optionPointer);
      exactKeys(
        option,
        ['label', 'value', 'description', 'color', 'children'],
        optionPointer
      );
      const label = requiredString(option.label, `${optionPointer}/label`, 500);
      const optionValue = requiredString(
        option.value,
        `${optionPointer}/value`,
        500
      );
      if (siblings.has(optionValue)) {
        issue(
          'NATIVE_DATA_FIELD_OPTION_VALUE_DUPLICATE',
          `${optionPointer}/value`
        );
      }
      siblings.add(optionValue);
      const description = optionalString(
        option.description,
        `${optionPointer}/description`,
        2000
      );
      const color = optionalString(option.color, `${optionPointer}/color`, 64);
      let children: NativeDataFieldOptionV2[] | undefined;
      if (option.children !== undefined) {
        if (!type.startsWith('cascade.') || !Array.isArray(option.children)) {
          issue(
            'NATIVE_DATA_FIELD_OPTION_CHILDREN_INVALID',
            `${optionPointer}/children`
          );
        }
        if (option.children.length < 1 || option.children.length > 100) {
          issue(
            'NATIVE_DATA_FIELD_OPTION_CHILDREN_INVALID',
            `${optionPointer}/children`
          );
        }
        children = visit(
          option.children,
          `${optionPointer}/children`,
          depth + 1
        );
      }
      return {
        label,
        value: optionValue,
        ...(description === undefined ? {} : { description }),
        ...(color === undefined ? {} : { color }),
        ...(children ? { children } : {}),
      };
    });
  };
  return visit(value, pointer, 1);
}

function parseSource(
  value: unknown,
  type: NativeDataFieldTypeV2,
  fieldPointer: string
): NativeDataFieldResourceSourceV2 | undefined {
  const pointer = `${fieldPointer}/source`;
  if (value === undefined) {
    if (RESOURCE_REFERENCE_TYPES.has(type))
      issue('NATIVE_DATA_FIELD_SOURCE_REQUIRED', pointer);
    return undefined;
  }
  if (!RESOURCE_REFERENCE_TYPES.has(type)) {
    issue('NATIVE_DATA_FIELD_SOURCE_TYPE_INVALID', pointer);
  }
  const source = record(value, pointer);
  exactKeys(
    source,
    [
      'kind',
      'resourceCode',
      'labelField',
      'searchFields',
      'descriptionFields',
      'snapshotFields',
      'filters',
      'pageSize',
      'loadMode',
    ],
    pointer
  );
  if (source.kind !== 'resource') {
    issue('NATIVE_DATA_FIELD_SOURCE_KIND_INVALID', `${pointer}/kind`);
  }
  const resourceCode = requiredString(
    source.resourceCode,
    `${pointer}/resourceCode`,
    64
  );
  if (!RESOURCE_CODE_PATTERN.test(resourceCode)) {
    issue('NATIVE_RESOURCE_CODE_INVALID', `${pointer}/resourceCode`);
  }
  const labelField = fieldCode(source.labelField, `${pointer}/labelField`);
  const searchFields = optionalFieldCodes(
    source.searchFields,
    `${pointer}/searchFields`,
    10
  );
  const descriptionFields = optionalFieldCodes(
    source.descriptionFields,
    `${pointer}/descriptionFields`,
    10
  );
  const snapshotFields = optionalFieldCodes(
    source.snapshotFields,
    `${pointer}/snapshotFields`,
    50
  );
  const pageSize = optionalInteger(
    source.pageSize,
    `${pointer}/pageSize`,
    1,
    100
  );
  let loadMode: 'search' | 'all' | undefined;
  if (source.loadMode !== undefined) {
    if (!['search', 'all'].includes(String(source.loadMode))) {
      issue(
        'NATIVE_DATA_FIELD_SOURCE_LOAD_MODE_INVALID',
        `${pointer}/loadMode`
      );
    }
    loadMode = source.loadMode as 'search' | 'all';
  }
  const filters = parseSourceFilters(source.filters, `${pointer}/filters`);
  return {
    kind: 'resource',
    resourceCode,
    labelField,
    ...(searchFields ? { searchFields } : {}),
    ...(descriptionFields ? { descriptionFields } : {}),
    ...(snapshotFields ? { snapshotFields } : {}),
    ...(filters ? { filters } : {}),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(loadMode ? { loadMode } : {}),
  };
}

function parseSourceFilters(
  value: unknown,
  pointer: string
): NativeDataFieldSourceFilterV2[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) {
    issue('NATIVE_DATA_FIELD_SOURCE_FILTERS_INVALID', pointer);
  }
  return value.map((rawFilter, index) => {
    const filterPointer = `${pointer}/${index}`;
    const filter = record(rawFilter, filterPointer);
    const hasValue = Object.prototype.hasOwnProperty.call(filter, 'value');
    const hasBinding = Object.prototype.hasOwnProperty.call(filter, 'binding');
    exactKeys(
      filter,
      hasValue
        ? ['field', 'operator', 'value']
        : ['field', 'operator', 'binding'],
      filterPointer
    );
    if (hasValue === hasBinding) {
      issue('NATIVE_DATA_FIELD_SOURCE_FILTER_VALUE_INVALID', filterPointer);
    }
    const filterField = fieldCode(filter.field, `${filterPointer}/field`);
    if (!['eq', 'in'].includes(String(filter.operator))) {
      issue(
        'NATIVE_DATA_FIELD_SOURCE_FILTER_OPERATOR_INVALID',
        `${filterPointer}/operator`
      );
    }
    const operator = filter.operator as 'eq' | 'in';
    if (hasValue) return { field: filterField, operator, value: filter.value };
    const binding = record(filter.binding, `${filterPointer}/binding`);
    exactKeys(binding, ['kind', 'field'], `${filterPointer}/binding`);
    if (binding.kind !== 'field') {
      issue(
        'NATIVE_DATA_FIELD_SOURCE_BINDING_KIND_INVALID',
        `${filterPointer}/binding/kind`
      );
    }
    return {
      field: filterField,
      operator,
      binding: {
        kind: 'field' as const,
        field: fieldCode(binding.field, `${filterPointer}/binding/field`),
      },
    };
  });
}

function parseScalarConfiguration(
  field: Record<string, any>,
  type: NativeDataFieldTypeV2,
  pointer: string
) {
  const result: Pick<
    NativeDataFieldV2,
    'maxLength' | 'precision' | 'scale' | 'min' | 'max' | 'timePrecision'
  > = {};
  if (field.maxLength !== undefined) {
    if (!['text.short', 'text.long', 'text.rich'].includes(type)) {
      issue(
        'NATIVE_DATA_FIELD_MAX_LENGTH_TYPE_INVALID',
        `${pointer}/maxLength`
      );
    }
    result.maxLength = requiredInteger(
      field.maxLength,
      `${pointer}/maxLength`,
      1,
      1_000_000
    );
  }
  if (field.precision !== undefined || field.scale !== undefined) {
    if (type !== 'number.decimal' || field.precision === undefined) {
      issue('NATIVE_DATA_FIELD_DECIMAL_CONFIG_INVALID', pointer);
    }
    result.precision = requiredInteger(
      field.precision,
      `${pointer}/precision`,
      1,
      1000
    );
    result.scale =
      field.scale === undefined
        ? 0
        : requiredInteger(field.scale, `${pointer}/scale`, 0, result.precision);
  }
  if (field.min !== undefined || field.max !== undefined) {
    if (!['number.integer', 'number.decimal'].includes(type)) {
      issue('NATIVE_DATA_FIELD_NUMERIC_BOUNDS_TYPE_INVALID', pointer);
    }
    const minimum = optionalFiniteNumber(field.min, `${pointer}/min`);
    const maximum = optionalFiniteNumber(field.max, `${pointer}/max`);
    if (
      type === 'number.integer' &&
      [minimum, maximum].some(
        value => value !== undefined && !Number.isSafeInteger(value)
      )
    ) {
      issue('NATIVE_DATA_FIELD_NUMERIC_BOUNDS_INVALID', pointer);
    }
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      issue('NATIVE_DATA_FIELD_NUMERIC_BOUNDS_INVALID', pointer);
    }
    if (minimum !== undefined) result.min = minimum;
    if (maximum !== undefined) result.max = maximum;
  }
  if (field.timePrecision !== undefined) {
    if (
      type !== 'time' ||
      !['minute', 'second'].includes(field.timePrecision)
    ) {
      issue(
        'NATIVE_DATA_FIELD_TIME_PRECISION_INVALID',
        `${pointer}/timePrecision`
      );
    }
    result.timePrecision = field.timePrecision;
  }
  return result;
}

function parseFile(
  value: unknown,
  type: NativeDataFieldTypeV2,
  fieldPointer: string
): NativeDataFieldV2['file'] | undefined {
  if (value === undefined) return undefined;
  const pointer = `${fieldPointer}/file`;
  if (!['file', 'image', 'signature'].includes(type)) {
    issue('NATIVE_DATA_FIELD_FILE_TYPE_INVALID', pointer);
  }
  const file = record(value, pointer);
  exactKeys(file, ['maxCount', 'maxSizeMb', 'accept'], pointer);
  const maxCount = optionalInteger(
    file.maxCount,
    `${pointer}/maxCount`,
    1,
    100
  );
  if (type === 'signature' && maxCount !== undefined && maxCount !== 1) {
    issue('NATIVE_DATA_FIELD_SIGNATURE_COUNT_INVALID', `${pointer}/maxCount`);
  }
  const maxSizeMb = optionalInteger(
    file.maxSizeMb,
    `${pointer}/maxSizeMb`,
    1,
    1024
  );
  let accept: string[] | undefined;
  if (file.accept !== undefined) {
    if (!Array.isArray(file.accept) || file.accept.length > 50) {
      issue('NATIVE_DATA_FIELD_FILE_ACCEPT_INVALID', `${pointer}/accept`);
    }
    accept = file.accept.map((item, index) =>
      requiredString(item, `${pointer}/accept/${index}`, 255)
    );
    if (new Set(accept).size !== accept.length) {
      issue('NATIVE_DATA_FIELD_FILE_ACCEPT_INVALID', `${pointer}/accept`);
    }
  }
  return {
    ...(maxCount === undefined ? {} : { maxCount }),
    ...(maxSizeMb === undefined ? {} : { maxSizeMb }),
    ...(accept === undefined ? {} : { accept }),
  };
}

function parseSerial(
  value: unknown,
  type: NativeDataFieldTypeV2,
  fieldPointer: string
): NativeDataFieldV2['serial'] | undefined {
  const pointer = `${fieldPointer}/serial`;
  if (value === undefined) {
    if (type === 'serial-number')
      issue('NATIVE_DATA_FIELD_SERIAL_REQUIRED', pointer);
    return undefined;
  }
  if (type !== 'serial-number')
    issue('NATIVE_DATA_FIELD_SERIAL_TYPE_INVALID', pointer);
  const serial = record(value, pointer);
  exactKeys(serial, ['prefix', 'digits', 'start'], pointer);
  const prefix = optionalString(serial.prefix, `${pointer}/prefix`, 64);
  const digits = optionalInteger(serial.digits, `${pointer}/digits`, 1, 32);
  const start = optionalInteger(
    serial.start,
    `${pointer}/start`,
    0,
    Number.MAX_SAFE_INTEGER
  );
  return {
    ...(prefix === undefined ? {} : { prefix }),
    ...(digits === undefined ? {} : { digits }),
    ...(start === undefined ? {} : { start }),
  };
}

function parseSubtable(
  value: unknown,
  type: NativeDataFieldTypeV2,
  fieldPointer: string
): NativeDataFieldV2['subtable'] | undefined {
  const pointer = `${fieldPointer}/subtable`;
  if (value === undefined) {
    if (type === 'subtable')
      issue('NATIVE_DATA_FIELD_SUBTABLE_REQUIRED', pointer);
    return undefined;
  }
  if (type !== 'subtable')
    issue('NATIVE_DATA_FIELD_SUBTABLE_TYPE_INVALID', pointer);
  const subtable = record(value, pointer);
  exactKeys(
    subtable,
    ['resourceCode', 'foreignKey', 'orderField', 'maxRows'],
    pointer
  );
  const resourceCode = requiredString(
    subtable.resourceCode,
    `${pointer}/resourceCode`,
    64
  );
  if (!RESOURCE_CODE_PATTERN.test(resourceCode)) {
    issue('NATIVE_RESOURCE_CODE_INVALID', `${pointer}/resourceCode`);
  }
  const foreignKey = fieldCode(subtable.foreignKey, `${pointer}/foreignKey`);
  const orderField = fieldCode(subtable.orderField, `${pointer}/orderField`);
  if (orderField === foreignKey) {
    issue(
      'NATIVE_DATA_FIELD_SUBTABLE_ORDER_FIELD_INVALID',
      `${pointer}/orderField`
    );
  }
  const maxRows = optionalInteger(
    subtable.maxRows,
    `${pointer}/maxRows`,
    1,
    49
  );
  return {
    resourceCode,
    foreignKey,
    orderField,
    ...(maxRows === undefined ? {} : { maxRows }),
  };
}

function optionalFieldCodes(
  value: unknown,
  pointer: string,
  maximum: number
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maximum) {
    issue('NATIVE_DATA_FIELD_SOURCE_FIELDS_INVALID', pointer);
  }
  const result = value.map((item, index) =>
    fieldCode(item, `${pointer}/${index}`)
  );
  if (new Set(result).size !== result.length) {
    issue('NATIVE_DATA_FIELD_SOURCE_FIELDS_INVALID', pointer);
  }
  return result;
}

function fieldCode(value: unknown, pointer: string) {
  const result = requiredString(value, pointer, 63);
  if (!FIELD_CODE_PATTERN.test(result))
    issue('NATIVE_FIELD_CODE_INVALID', pointer);
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
  allowed: string[],
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

function optionalString(value: unknown, pointer: string, maximum: number) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maximum) {
    issue('NATIVE_STRING_INVALID', pointer);
  }
  return value;
}

function optionalBoolean(value: unknown, pointer: string) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') issue('NATIVE_BOOLEAN_REQUIRED', pointer);
  return value;
}

function optionalInteger(
  value: unknown,
  pointer: string,
  minimum: number,
  maximum: number
) {
  if (value === undefined) return undefined;
  return requiredInteger(value, pointer, minimum, maximum);
}

function optionalFiniteNumber(value: unknown, pointer: string) {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issue('NATIVE_NUMBER_REQUIRED', pointer);
  }
  return value;
}

function requiredInteger(
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
    issue('NATIVE_INTEGER_OUT_OF_RANGE', pointer);
  }
  return Number(value);
}

function issue(code: string, pointer: string): never {
  throw new NativeDataFieldContractV2Error(code, pointer);
}
