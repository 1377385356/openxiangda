import {
  DATA_FIELD_TYPES,
  type Diagnostic,
} from './types.js';
import {
  diagnostic,
  isDataFieldCode,
  isRecord,
  requireString,
} from './validation-common.js';

const DATA_FIELD_TYPE_SET = new Set<string>(DATA_FIELD_TYPES);

export const DATA_MULTI_FIELD_TYPES = new Set([
  'option.multiple',
  'cascade.multiple',
  'user.multiple',
  'department.multiple',
  'resource-ref.multiple',
  'file',
  'image',
  'subtable',
]);

const DATA_OPTION_FIELD_TYPES = new Set([
  'option.single',
  'option.multiple',
  'cascade.single',
  'cascade.multiple',
]);

const DATA_RESOURCE_REFERENCE_FIELD_TYPES = new Set([
  'resource-ref.single',
  'resource-ref.multiple',
]);

const DATA_FIELD_PROPERTIES = new Set([
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
]);

/** Resources use the same lower kebab-case convention as app codes. */
export const RESOURCE_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isCanonicalResourceCode(value: string) {
  return RESOURCE_CODE_PATTERN.test(value);
}

export function validateDataFieldDefinition(
  field: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[]
) {
  for (const key of Object.keys(field)) {
    if (!DATA_FIELD_PROPERTIES.has(key)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_PROPERTY_UNKNOWN',
          `${path}.${key} 不是受支持的字段属性`,
          `${path}.${key}`
        )
      );
    }
  }
  for (const key of ['nullable', 'indexed']) {
    if (field[key] !== undefined && typeof field[key] !== 'boolean') {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_BOOLEAN_INVALID',
          `${path}.${key} 必须为 boolean`,
          `${path}.${key}`
        )
      );
    }
  }
  const type = String(field.type || '');
  if (!DATA_FIELD_TYPE_SET.has(type)) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_TYPE_UNSUPPORTED',
        `${path}.type 不受支持`,
        `${path}.type`
      )
    );
  }
  if (field.nullable === true && DATA_MULTI_FIELD_TYPES.has(type)) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_MULTI_FIELD_NULLABLE_INVALID',
        `${path} 是多值字段，空值必须使用 []，不能声明 nullable`,
        `${path}.nullable`
      )
    );
  }
  validateOptions(field, path, diagnostics);
  validateSource(field, path, diagnostics);
  validateScalarConfig(field, path, diagnostics);
  validateRangeBoundary(field, path, diagnostics);
  validateFileConfig(field, path, diagnostics);
  validateSerialConfig(field, path, diagnostics);
  validateSubtableConfig(field, path, diagnostics);
}

function validateRangeBoundary(
  field: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[]
) {
  const type = String(field.type || '');
  const rangeType = type === 'date-range' || type === 'datetime-range';
  if (rangeType && !['closed', 'half-open'].includes(String(field.rangeBoundary))) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_RANGE_BOUNDARY_REQUIRED',
        `${path}.rangeBoundary 对范围字段必须显式声明 closed 或 half-open`,
        `${path}.rangeBoundary`
      )
    );
    return;
  }
  if (!rangeType && field.rangeBoundary !== undefined) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_RANGE_BOUNDARY_TYPE_INVALID',
        `${path}.rangeBoundary 只能用于 date-range 或 datetime-range`,
        `${path}.rangeBoundary`
      )
    );
  }
}

function validateOptions(
  field: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[]
) {
  const type = String(field.type || '');
  if (field.options === undefined) {
    if (DATA_OPTION_FIELD_TYPES.has(type)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_OPTIONS_REQUIRED',
          `${path}.options 是静态选项字段的必填协议`,
          `${path}.options`
        )
      );
    }
    return;
  }
  if (!DATA_OPTION_FIELD_TYPES.has(type)) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_OPTIONS_TYPE_INVALID',
        `${path}.options 只能用于 option.* 或 cascade.* 字段`,
        `${path}.options`
      )
    );
    return;
  }
  if (
    !Array.isArray(field.options) ||
    field.options.length < 1 ||
    field.options.length > 100
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_OPTIONS_INVALID',
        `${path}.options 必须包含 1 到 100 个选项`,
        `${path}.options`
      )
    );
    return;
  }
  let total = 0;
  const visit = (items: unknown[], itemPath: string, depth: number) => {
    if (depth > 5) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_OPTIONS_DEPTH_EXCEEDED',
          `${itemPath} 级联选项深度不能超过 5`,
          itemPath
        )
      );
      return;
    }
    const siblingValues = new Set<string>();
    items.forEach((item, index) => {
      total += 1;
      const currentPath = `${itemPath}[${index}]`;
      if (total > 1000) return;
      if (!isRecord(item)) {
        diagnostics.push(
          diagnostic(
            'DATA_RESOURCE_FIELD_OPTION_INVALID',
            `${currentPath} 必须是对象`,
            currentPath
          )
        );
        return;
      }
      for (const key of Object.keys(item)) {
        if (!['label', 'value', 'description', 'color', 'children'].includes(key)) {
          diagnostics.push(
            diagnostic(
              'DATA_RESOURCE_FIELD_OPTION_PROPERTY_UNKNOWN',
              `${currentPath}.${key} 不受支持`,
              `${currentPath}.${key}`
            )
          );
        }
      }
      const validLabel = requireString(
        item.label,
        `${currentPath}.label`,
        diagnostics
      );
      const validValue = requireString(
        item.value,
        `${currentPath}.value`,
        diagnostics
      );
      if (validLabel && String(item.label).length > 500) {
        diagnostics.push(
          diagnostic(
            'DATA_RESOURCE_FIELD_OPTION_LABEL_TOO_LONG',
            `${currentPath}.label 最长 500 个字符`,
            `${currentPath}.label`
          )
        );
      }
      if (validValue) {
        if (
          String(item.value).length > 500 ||
          siblingValues.has(String(item.value))
        ) {
          diagnostics.push(
            diagnostic(
              'DATA_RESOURCE_FIELD_OPTION_VALUE_INVALID',
              `${currentPath}.value 过长或同级重复`,
              `${currentPath}.value`
            )
          );
        }
        siblingValues.add(String(item.value));
      }
      if (item.children === undefined) return;
      if (!type.startsWith('cascade.')) {
        diagnostics.push(
          diagnostic(
            'DATA_RESOURCE_FIELD_OPTION_CHILDREN_INVALID',
            `${currentPath}.children 只能用于级联字段`,
            `${currentPath}.children`
          )
        );
      } else if (
        !Array.isArray(item.children) ||
        item.children.length < 1 ||
        item.children.length > 100
      ) {
        diagnostics.push(
          diagnostic(
            'DATA_RESOURCE_FIELD_OPTION_CHILDREN_INVALID',
            `${currentPath}.children 必须包含 1 到 100 个选项`,
            `${currentPath}.children`
          )
        );
      } else {
        visit(item.children, `${currentPath}.children`, depth + 1);
      }
    });
  };
  visit(field.options, `${path}.options`, 1);
  if (total > 1000) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_OPTIONS_COUNT_EXCEEDED',
        `${path}.options 总数不能超过 1000`,
        `${path}.options`
      )
    );
  }
}

function validateSource(
  field: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[]
) {
  const type = String(field.type || '');
  if (field.source === undefined) {
    if (DATA_RESOURCE_REFERENCE_FIELD_TYPES.has(type)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_SOURCE_REQUIRED',
          `${path}.source 是动态资源引用的必填协议`,
          `${path}.source`
        )
      );
    }
    return;
  }
  if (!DATA_RESOURCE_REFERENCE_FIELD_TYPES.has(type) || !isRecord(field.source)) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SOURCE_INVALID',
        `${path}.source 只能用于 resource-ref.* 且必须是对象`,
        `${path}.source`
      )
    );
    return;
  }
  const source = field.source;
  const allowed = new Set([
    'kind',
    'resourceCode',
    'labelField',
    'searchFields',
    'descriptionFields',
    'snapshotFields',
    'filters',
    'pageSize',
    'loadMode',
  ]);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_SOURCE_PROPERTY_UNKNOWN',
          `${path}.source.${key} 不受支持`,
          `${path}.source.${key}`
        )
      );
    }
  }
  if (
    source.kind !== 'resource' ||
    !isCanonicalResourceCode(String(source.resourceCode || '')) ||
    !isDataFieldCode(source.labelField)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SOURCE_TARGET_INVALID',
        `${path}.source 必须声明有效的 resourceCode 和 labelField`,
        `${path}.source`
      )
    );
  }
  for (const key of ['searchFields', 'descriptionFields', 'snapshotFields']) {
    if (source[key] === undefined) continue;
    const limit = key === 'snapshotFields' ? 50 : 10;
    const items = Array.isArray(source[key]) ? source[key] : [];
    if (
      !Array.isArray(source[key]) ||
      items.length > limit ||
      items.some(item => !isDataFieldCode(item)) ||
      new Set(items).size !== items.length
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_SOURCE_FIELDS_INVALID',
          `${path}.source.${key} 必须为最多 ${limit} 个不重复字段代码`,
          `${path}.source.${key}`
        )
      );
    }
  }
  if (
    source.pageSize !== undefined &&
    (!Number.isInteger(source.pageSize) ||
      Number(source.pageSize) < 1 ||
      Number(source.pageSize) > 100)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SOURCE_PAGE_SIZE_INVALID',
        `${path}.source.pageSize 必须为 1 到 100`,
        `${path}.source.pageSize`
      )
    );
  }
  if (
    source.loadMode !== undefined &&
    !['search', 'all'].includes(String(source.loadMode))
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SOURCE_LOAD_MODE_INVALID',
        `${path}.source.loadMode 只支持 search/all`,
        `${path}.source.loadMode`
      )
    );
  }
  const filters =
    source.filters === undefined
      ? []
      : Array.isArray(source.filters)
        ? source.filters
        : [];
  if (
    source.filters !== undefined &&
    (!Array.isArray(source.filters) || filters.length > 20)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SOURCE_FILTERS_INVALID',
        `${path}.source.filters 最多包含 20 项`,
        `${path}.source.filters`
      )
    );
  }
  filters.forEach((filter, index) => {
    const filterPath = `${path}.source.filters[${index}]`;
    if (
      !isRecord(filter) ||
      !isDataFieldCode(filter.field) ||
      !['eq', 'in'].includes(String(filter.operator))
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_SOURCE_FILTER_INVALID',
          `${filterPath} 必须声明字段和 eq/in`,
          filterPath
        )
      );
      return;
    }
    const hasValue = Object.prototype.hasOwnProperty.call(filter, 'value');
    const binding = isRecord(filter.binding) ? filter.binding : null;
    const hasBinding = binding?.kind === 'field' && isDataFieldCode(binding.field);
    if (hasValue === hasBinding) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_SOURCE_FILTER_VALUE_INVALID',
          `${filterPath} 必须且只能声明 value 或 field binding`,
          filterPath
        )
      );
    }
  });
}

function validateScalarConfig(
  field: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[]
) {
  const type = String(field.type || '');
  if (
    field.maxLength !== undefined &&
    (!['text.short', 'text.long', 'text.rich'].includes(type) ||
      !Number.isInteger(field.maxLength) ||
      Number(field.maxLength) < 1 ||
      Number(field.maxLength) > 1_000_000)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_MAX_LENGTH_INVALID',
        `${path}.maxLength 只能用于文本且范围为 1 到 1000000`,
        `${path}.maxLength`
      )
    );
  }
  if (field.precision !== undefined || field.scale !== undefined) {
    const precision = Number(field.precision);
    const scale = Number(field.scale ?? 0);
    if (
      type !== 'number.decimal' ||
      !Number.isInteger(precision) ||
      precision < 1 ||
      precision > 1000 ||
      !Number.isInteger(scale) ||
      scale < 0 ||
      scale > precision
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_DECIMAL_CONFIG_INVALID',
          `${path}.precision/scale 必须是合法的 decimal 精度`,
          path
        )
      );
    }
  }
  if (field.min !== undefined || field.max !== undefined) {
    const minimum = field.min === undefined ? undefined : Number(field.min);
    const maximum = field.max === undefined ? undefined : Number(field.max);
    const numericType =
      type === 'number.integer' || type === 'number.decimal';
    const validMinimum = minimum === undefined || Number.isFinite(minimum);
    const validMaximum = maximum === undefined || Number.isFinite(maximum);
    const validIntegerBounds =
      type !== 'number.integer' ||
      ((minimum === undefined || Number.isSafeInteger(minimum)) &&
        (maximum === undefined || Number.isSafeInteger(maximum)));
    if (
      !numericType ||
      !validMinimum ||
      !validMaximum ||
      !validIntegerBounds ||
      (minimum !== undefined &&
        maximum !== undefined &&
        minimum > maximum)
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_NUMERIC_BOUNDS_INVALID',
          `${path}.min/max 只能用于数值字段，必须是有限包含边界且 min <= max`,
          path
        )
      );
    }
  }
  if (
    field.timePrecision !== undefined &&
    (type !== 'time' || !['minute', 'second'].includes(String(field.timePrecision)))
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_TIME_PRECISION_INVALID',
        `${path}.timePrecision 只能用于 time`,
        `${path}.timePrecision`
      )
    );
  }
}

function validateFileConfig(
  field: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[]
) {
  if (field.file === undefined) return;
  if (
    !['file', 'image', 'signature'].includes(String(field.type)) ||
    !isRecord(field.file)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_FILE_INVALID',
        `${path}.file 只能用于 file、image 或 signature 且必须是对象`,
        `${path}.file`
      )
    );
    return;
  }
  const file = field.file;
  for (const key of Object.keys(file)) {
    if (!['maxCount', 'maxSizeMb', 'accept'].includes(key)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_FILE_PROPERTY_UNKNOWN',
          `${path}.file.${key} 不受支持`,
          `${path}.file.${key}`
        )
      );
    }
  }
  if (
    file.maxCount !== undefined &&
    (!Number.isInteger(file.maxCount) ||
      Number(file.maxCount) < 1 ||
      Number(file.maxCount) > 100)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_FILE_COUNT_INVALID',
        `${path}.file.maxCount 必须为 1 到 100`,
        `${path}.file.maxCount`
      )
    );
  }
  if (
    file.maxSizeMb !== undefined &&
    (!Number.isInteger(file.maxSizeMb) ||
      Number(file.maxSizeMb) < 1 ||
      Number(file.maxSizeMb) > 1024)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_FILE_SIZE_INVALID',
        `${path}.file.maxSizeMb 必须为 1 到 1024`,
        `${path}.file.maxSizeMb`
      )
    );
  }
  if (file.accept !== undefined) {
    const accept = Array.isArray(file.accept) ? file.accept : [];
    if (
      !Array.isArray(file.accept) ||
      accept.length > 50 ||
      accept.some(item => typeof item !== 'string' || !item) ||
      new Set(accept).size !== accept.length
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_FILE_ACCEPT_INVALID',
          `${path}.file.accept 必须为最多 50 个不重复非空字符串`,
          `${path}.file.accept`
        )
      );
    }
  }
  if (
    ['image', 'signature'].includes(String(field.type)) &&
    file.maxCount !== undefined &&
    Number(file.maxCount) !== 1 &&
    field.type === 'signature'
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SIGNATURE_COUNT_INVALID',
        `${path}.file.maxCount 对签名必须为 1`,
        `${path}.file.maxCount`
      )
    );
  }
}

function validateSerialConfig(
  field: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[]
) {
  if (field.serial === undefined) {
    if (field.type === 'serial-number') {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_SERIAL_REQUIRED',
          `${path}.serial 是流水号字段的必填协议`,
          `${path}.serial`
        )
      );
    }
    return;
  }
  if (field.type !== 'serial-number' || !isRecord(field.serial)) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SERIAL_INVALID',
        `${path}.serial 只能用于 serial-number`,
        `${path}.serial`
      )
    );
    return;
  }
  const serial = field.serial;
  for (const key of Object.keys(serial)) {
    if (!['prefix', 'digits', 'start'].includes(key)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_SERIAL_PROPERTY_UNKNOWN',
          `${path}.serial.${key} 不受支持`,
          `${path}.serial.${key}`
        )
      );
    }
  }
  if (
    serial.prefix !== undefined &&
    (typeof serial.prefix !== 'string' || serial.prefix.length > 64)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SERIAL_PREFIX_INVALID',
        `${path}.serial.prefix 最长 64 个字符`,
        `${path}.serial.prefix`
      )
    );
  }
  if (
    serial.digits !== undefined &&
    (!Number.isInteger(serial.digits) ||
      Number(serial.digits) < 1 ||
      Number(serial.digits) > 32)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SERIAL_DIGITS_INVALID',
        `${path}.serial.digits 必须为 1 到 32`,
        `${path}.serial.digits`
      )
    );
  }
  if (
    serial.start !== undefined &&
    (!Number.isSafeInteger(serial.start) || Number(serial.start) < 0)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SERIAL_START_INVALID',
        `${path}.serial.start 必须为非负安全整数`,
        `${path}.serial.start`
      )
    );
  }
}

function validateSubtableConfig(
  field: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[]
) {
  if (field.subtable === undefined) {
    if (field.type === 'subtable') {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_SUBTABLE_REQUIRED',
          `${path}.subtable 是子表字段的必填协议`,
          `${path}.subtable`
        )
      );
    }
    return;
  }
  if (field.type !== 'subtable' || !isRecord(field.subtable)) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SUBTABLE_INVALID',
        `${path}.subtable 只能用于 subtable`,
        `${path}.subtable`
      )
    );
    return;
  }
  const subtable = field.subtable;
  if (
    !isCanonicalResourceCode(String(subtable.resourceCode || '')) ||
    !isDataFieldCode(subtable.foreignKey) ||
    !isDataFieldCode(subtable.orderField)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SUBTABLE_TARGET_INVALID',
        `${path}.subtable 必须声明有效子资源、外键和排序字段`,
        `${path}.subtable`
      )
    );
  }
  if (
    subtable.maxRows !== undefined &&
    (!Number.isInteger(subtable.maxRows) ||
      Number(subtable.maxRows) < 1 ||
      Number(subtable.maxRows) > 49)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELD_SUBTABLE_MAX_ROWS_INVALID',
        `${path}.subtable.maxRows 必须为 1 到 49`,
        `${path}.subtable.maxRows`
      )
    );
  }
}
