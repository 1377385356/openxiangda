import { canonicalJson } from '../canonical.js';
import {
  NativeDataFieldContractV2Error,
  NativeDataFieldTypeV2,
  NativeDataFieldV2,
  nativeFieldRequiresCreateInputV2,
} from './data-field.js';
import {
  nativeFieldSupportsFilterV2,
  nativeFieldSupportsSearchV2,
  nativeFieldSupportsSortV2,
} from './field-query-plan.js';

const MAX_LAYOUT_FIELD_ORDER_ENTRIES = 500;

export const OPENXIANGDA_NATIVE_DATA_SURFACE_KEYS_V2 = {
  surface: [
    'mutationOwner',
    'generated',
    'fields',
    'list',
    'form',
    'detail',
    'mobile',
    'views',
  ],
  generated: ['list', 'detail', 'create', 'update', 'delete'],
  field: [
    'label',
    'type',
    'widget',
    'section',
    'requiredHint',
    'system',
    'hidden',
    'readCapabilities',
    'createCapabilities',
    'updateCapabilities',
    'maxLength',
    'precision',
    'scale',
    'min',
    'max',
    'rangeBoundary',
    'maxCount',
    'maxSizeMb',
    'accept',
    'options',
    'list',
    'searchable',
    'sortable',
    'source',
    'timePrecision',
    'serial',
    'subtable',
  ],
  list: [
    'actions',
    'fieldOrder',
    'defaultPageSize',
    'searchableFields',
    'filterFields',
    'defaultSort',
  ],
  defaultSort: ['field', 'order'],
  layout: ['layout', 'fieldOrder'],
  mobile: ['enabled'],
} as const;

const WIDGETS_BY_TYPE: Record<NativeDataFieldTypeV2, readonly string[]> = {
  'text.short': ['text', 'email', 'phone'],
  'text.long': ['textarea'],
  'text.rich': ['rich-text'],
  'number.integer': ['number', 'rating'],
  'number.decimal': ['number', 'money', 'percent'],
  boolean: ['switch'],
  date: ['date'],
  time: ['time'],
  datetime: ['datetime'],
  'date-range': ['date-range'],
  'datetime-range': ['datetime-range'],
  'option.single': ['select', 'radio'],
  'option.multiple': ['multi-select', 'checkbox'],
  'cascade.single': ['cascade'],
  'cascade.multiple': ['cascade'],
  'user.single': ['directory-user'],
  'user.multiple': ['directory-user'],
  'department.single': ['directory-department', 'scope'],
  'department.multiple': ['directory-department', 'scope'],
  'resource-ref.single': ['select', 'radio', 'resource'],
  'resource-ref.multiple': ['multi-select', 'checkbox', 'resource'],
  file: ['attachment'],
  image: ['image'],
  signature: ['signature'],
  address: ['address'],
  location: ['location'],
  uuid: ['readonly'],
  json: ['json'],
  'serial-number': ['readonly'],
  subtable: ['subtable'],
};

export function validateNativeDataResourceSurfaceV2(
  value: unknown,
  fields: NativeDataFieldV2[],
  pointer: string
) {
  if (value === undefined) return;
  const surface = record(value, pointer);
  exactKeys(surface, OPENXIANGDA_NATIVE_DATA_SURFACE_KEYS_V2.surface, pointer);
  const mutationOwner =
    surface.mutationOwner === undefined
      ? 'native'
      : requiredString(surface.mutationOwner, `${pointer}/mutationOwner`, 16);
  if (!['native', 'action', 'readonly', 'workflow'].includes(mutationOwner)) {
    issue(
      'NATIVE_DATA_SURFACE_MUTATION_OWNER_INVALID',
      `${pointer}/mutationOwner`
    );
  }
  const generated =
    surface.generated === undefined
      ? {}
      : record(surface.generated, `${pointer}/generated`);
  exactKeys(
    generated,
    OPENXIANGDA_NATIVE_DATA_SURFACE_KEYS_V2.generated,
    `${pointer}/generated`
  );
  for (const operation of OPENXIANGDA_NATIVE_DATA_SURFACE_KEYS_V2.generated) {
    optionalBoolean(generated[operation], `${pointer}/generated/${operation}`);
  }
  if (mutationOwner !== 'native') {
    for (const operation of ['create', 'update', 'delete'] as const) {
      if (generated[operation] === true) {
        issue(
          'NATIVE_DATA_SURFACE_MUTATION_OWNER_CONFLICT',
          `${pointer}/generated/${operation}`
        );
      }
    }
  }
  const declared = new Map(fields.map(field => [field.code, field]));
  const surfaceFields = record(surface.fields, `${pointer}/fields`);
  for (const fieldCode of Object.keys(surfaceFields)) {
    if (!declared.has(fieldCode)) {
      issue(
        'NATIVE_DATA_SURFACE_FIELD_MISSING',
        `${pointer}/fields/${fieldCode}`
      );
    }
  }
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(surfaceFields, field.code)) {
      issue(
        'NATIVE_DATA_SURFACE_FIELD_REQUIRED',
        `${pointer}/fields/${field.code}`
      );
    }
    validateSurfaceField(
      surfaceFields[field.code],
      field,
      `${pointer}/fields/${field.code}`
    );
  }
  for (const operation of ['create', 'update'] as const) {
    const enabled = generated[operation] ?? mutationOwner === 'native';
    const writable = fields.some(field => {
      const fieldSurface = record(
        surfaceFields[field.code],
        `${pointer}/fields/${field.code}`
      );
      return nativeSurfaceFieldSupportsGeneratedMutation(
        field,
        fieldSurface,
        operation
      );
    });
    if (enabled && !writable) {
      issue(
        'NATIVE_DATA_SURFACE_WRITABLE_FIELDS_REQUIRED',
        `${pointer}/generated/${operation}`
      );
    }
  }
  validateList(surface.list, declared, `${pointer}/list`);
  validateLayout(surface.form, declared, `${pointer}/form`);
  validateLayout(surface.detail, declared, `${pointer}/detail`);
  if (surface.mobile !== undefined) {
    const mobile = record(surface.mobile, `${pointer}/mobile`);
    exactKeys(
      mobile,
      OPENXIANGDA_NATIVE_DATA_SURFACE_KEYS_V2.mobile,
      `${pointer}/mobile`
    );
    optionalBoolean(mobile.enabled, `${pointer}/mobile/enabled`);
  }
  validateViews(surface, fields, pointer);
}

/** Only presentation properties are projected; access/type/value facts stay shared. */
export function projectNativeDataResourceViewV2(
  surface: Record<string, any>,
  viewCode: string
): Record<string, any> {
  const view = surface.views?.find(
    (item: Record<string, any>) => item.code === viewCode
  );
  if (!view) issue('NATIVE_DATA_VIEW_NOT_FOUND', `/surface/views/${viewCode}`);
  const sections = new Map<string, string>(
    (view.sections || []).flatMap((section: Record<string, any>) =>
      section.fields.map((code: string) => [code, section.title])
    )
  );
  return {
    mutationOwner: surface.mutationOwner || 'native',
    generated: view.generated,
    list: view.list,
    form: view.form,
    detail: view.detail,
    mobile: view.mobile,
    fields: Object.fromEntries(
      Object.entries(surface.fields).map(([code, value]) => {
        const field = { ...(value as Record<string, any>) };
        delete field.section;
        const section = sections.get(code);
        return [
          code,
          {
            ...field,
            ...(section ? { section } : {}),
            list: view.list.fieldOrder.includes(code),
          },
        ];
      })
    ),
  };
}

function validateViews(
  surface: Record<string, any>,
  fields: NativeDataFieldV2[],
  pointer: string
) {
  if (surface.views === undefined) return;
  if (!Array.isArray(surface.views) || surface.views.length > 20)
    issue('NATIVE_DATA_VIEWS_LIMIT_INVALID', `${pointer}/views`);
  const codes = new Set<string>();
  surface.views.forEach((raw: unknown, index: number) => {
    const path = `${pointer}/views/${index}`;
    const view = record(raw, path);
    exactKeys(
      view,
      [
        'code',
        'name',
        'generated',
        'list',
        'form',
        'detail',
        'mobile',
        'sections',
      ],
      path
    );
    const code = requiredString(view.code, `${path}/code`, 64);
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(code) || codes.has(code))
      issue('NATIVE_DATA_VIEW_CODE_INVALID', `${path}/code`);
    codes.add(code);
    requiredString(view.name, `${path}/name`, 255);
    record(view.generated, `${path}/generated`);
    record(view.mobile, `${path}/mobile`);
    for (const operation of ['list', 'detail', 'create', 'update', 'delete']) {
      if (typeof view.generated[operation] !== 'boolean')
        issue(
          'NATIVE_DATA_VIEW_OPERATION_INVALID',
          `${path}/generated/${operation}`
        );
    }
    if (typeof view.mobile.enabled !== 'boolean')
      issue('NATIVE_DATA_VIEW_MOBILE_INVALID', `${path}/mobile/enabled`);
    for (const kind of ['list', 'form', 'detail']) {
      const layout = record(view[kind], `${path}/${kind}`);
      const selected = stringArray(
        layout.fieldOrder,
        `${path}/${kind}/fieldOrder`,
        500,
        true
      );
      for (const key of selected) {
        const field = surface.fields[key];
        if (!field || (field.hidden ?? field.system) === true)
          issue('NATIVE_DATA_VIEW_FIELD_INVALID', `${path}/${kind}/fieldOrder`);
      }
    }
    if (view.sections !== undefined) {
      if (!Array.isArray(view.sections) || view.sections.length > 100)
        issue('NATIVE_DATA_VIEW_SECTIONS_INVALID', `${path}/sections`);
      const grouped = new Set<string>();
      view.sections.forEach((rawSection: unknown, sectionIndex: number) => {
        const sectionPath = `${path}/sections/${sectionIndex}`;
        const section = record(rawSection, sectionPath);
        exactKeys(section, ['title', 'fields'], sectionPath);
        requiredString(section.title, `${sectionPath}/title`, 255);
        for (const key of stringArray(
          section.fields,
          `${sectionPath}/fields`,
          100,
          true
        )) {
          const field = surface.fields[key];
          if (
            !field ||
            (field.hidden ?? field.system) === true ||
            grouped.has(key)
          )
            issue('NATIVE_DATA_VIEW_FIELD_INVALID', `${sectionPath}/fields`);
          grouped.add(key);
        }
      });
    }
    const projected = projectNativeDataResourceViewV2(surface, code);
    validateNativeDataResourceSurfaceV2(projected, fields, path);
    if (
      view.generated.create !== false &&
      (surface.mutationOwner || 'native') === 'native'
    ) {
      for (const field of fields) {
        if (
          nativeFieldRequiresCreateInputV2(field, surface.fields[field.code]) &&
          nativeSurfaceFieldSupportsGeneratedMutation(
            field,
            surface.fields[field.code],
            'create'
          ) &&
          !view.form.fieldOrder.includes(field.code)
        ) {
          issue(
            'NATIVE_DATA_VIEW_CREATE_REQUIRED_FIELD_MISSING',
            `${path}/form/fieldOrder`
          );
        }
      }
    }
  });
}

function nativeSurfaceFieldSupportsGeneratedMutation(
  field: NativeDataFieldV2,
  surface: Record<string, any>,
  operation: 'create' | 'update'
) {
  if (field.type === 'serial-number' || surface.system === true) {
    return false;
  }
  const capabilities = surface[`${operation}Capabilities`];
  return Array.isArray(capabilities) && capabilities.length > 0;
}

function validateSurfaceField(
  value: unknown,
  field: NativeDataFieldV2,
  pointer: string
) {
  const surface = record(value, pointer);
  exactKeys(surface, OPENXIANGDA_NATIVE_DATA_SURFACE_KEYS_V2.field, pointer);
  requiredString(surface.label, `${pointer}/label`, 500);
  if (surface.type !== field.type) {
    issue('NATIVE_DATA_SURFACE_FIELD_TYPE_MISMATCH', `${pointer}/type`);
  }
  const widget = requiredString(surface.widget, `${pointer}/widget`, 64);
  if (!WIDGETS_BY_TYPE[field.type].includes(widget)) {
    issue('NATIVE_DATA_SURFACE_WIDGET_INCOMPATIBLE', `${pointer}/widget`);
  }
  optionalString(surface.section, `${pointer}/section`, 255);
  for (const key of [
    'requiredHint',
    'system',
    'hidden',
    'list',
    'searchable',
    'sortable',
  ]) {
    optionalBoolean(surface[key], `${pointer}/${key}`);
  }
  if (surface.searchable === true && !nativeFieldSupportsSearchV2(field.type)) {
    issue('NATIVE_DATA_SURFACE_SEARCH_UNSUPPORTED', `${pointer}/searchable`);
  }
  if (surface.sortable === true && !nativeFieldSupportsSortV2(field.type)) {
    issue('NATIVE_DATA_SURFACE_SORT_UNSUPPORTED', `${pointer}/sortable`);
  }
  for (const key of [
    'readCapabilities',
    'createCapabilities',
    'updateCapabilities',
  ]) {
    stringArray(surface[key], `${pointer}/${key}`, 100, true);
  }
  if (
    surface.maxCount !== undefined &&
    (!Number.isSafeInteger(surface.maxCount) ||
      Number(surface.maxCount) < 1 ||
      Number(surface.maxCount) > 100)
  ) {
    issue('NATIVE_DATA_SURFACE_MAX_COUNT_INVALID', `${pointer}/maxCount`);
  }
  if (
    surface.maxSizeMb !== undefined &&
    (!Number.isSafeInteger(surface.maxSizeMb) ||
      Number(surface.maxSizeMb) < 1 ||
      Number(surface.maxSizeMb) > 1024)
  ) {
    issue('NATIVE_DATA_SURFACE_MAX_SIZE_INVALID', `${pointer}/maxSizeMb`);
  }
  if (surface.accept !== undefined) {
    const values = Array.isArray(surface.accept)
      ? surface.accept
      : [surface.accept];
    stringArray(values, `${pointer}/accept`, 50, false);
  }
  for (const key of [
    'maxLength',
    'precision',
    'scale',
    'min',
    'max',
    'rangeBoundary',
    'options',
    'source',
    'timePrecision',
    'serial',
    'subtable',
  ] as const) {
    assertProjection(surface, field, key, pointer);
  }
  assertFileProjection(surface, field, pointer);
}

function validateList(
  value: unknown,
  fields: Map<string, NativeDataFieldV2>,
  pointer: string
) {
  if (value === undefined) return;
  const list = record(value, pointer);
  exactKeys(list, OPENXIANGDA_NATIVE_DATA_SURFACE_KEYS_V2.list, pointer);
  if (list.actions !== undefined) {
    const actions = record(list.actions, `${pointer}/actions`);
    exactKeys(actions, ['import', 'export'], `${pointer}/actions`);
    for (const key of ['import', 'export']) {
      if (actions[key] !== undefined && typeof actions[key] !== 'boolean') {
        issue('NATIVE_DATA_SURFACE_LIST_ACTION_INVALID', `${pointer}/actions/${key}`);
      }
    }
  }
  if (list.fieldOrder !== undefined) {
    for (const code of stringArray(
      list.fieldOrder,
      `${pointer}/fieldOrder`,
      500,
      true
    )) {
      if (!fields.has(code)) {
        issue(
          'NATIVE_DATA_SURFACE_LIST_FIELD_INVALID',
          `${pointer}/fieldOrder`
        );
      }
    }
  }
  if (
    list.defaultPageSize !== undefined &&
    (!Number.isSafeInteger(list.defaultPageSize) ||
      Number(list.defaultPageSize) < 1 ||
      Number(list.defaultPageSize) > 200)
  ) {
    issue(
      'NATIVE_DATA_SURFACE_PAGE_SIZE_INVALID',
      `${pointer}/defaultPageSize`
    );
  }
  for (const [key, capability] of [
    ['searchableFields', nativeFieldSupportsSearchV2],
    ['filterFields', nativeFieldSupportsFilterV2],
  ] as const) {
    if (list[key] === undefined) continue;
    const values = stringArray(list[key], `${pointer}/${key}`, 100, true);
    for (const fieldCode of values) {
      const field = fields.get(fieldCode);
      if (!field || !capability(field.type)) {
        issue('NATIVE_DATA_SURFACE_LIST_FIELD_INVALID', `${pointer}/${key}`);
      }
    }
  }
  if (list.defaultSort !== undefined) {
    const sort = record(list.defaultSort, `${pointer}/defaultSort`);
    exactKeys(
      sort,
      OPENXIANGDA_NATIVE_DATA_SURFACE_KEYS_V2.defaultSort,
      `${pointer}/defaultSort`
    );
    const fieldCode = requiredString(
      sort.field,
      `${pointer}/defaultSort/field`,
      63
    );
    const field = fields.get(fieldCode);
    if (!field || !nativeFieldSupportsSortV2(field.type)) {
      issue(
        'NATIVE_DATA_SURFACE_SORT_UNSUPPORTED',
        `${pointer}/defaultSort/field`
      );
    }
    if (sort.order !== undefined && !['asc', 'desc'].includes(sort.order)) {
      issue(
        'NATIVE_DATA_SURFACE_SORT_ORDER_INVALID',
        `${pointer}/defaultSort/order`
      );
    }
  }
}

function validateLayout(
  value: unknown,
  fields: Map<string, NativeDataFieldV2>,
  pointer: string
) {
  if (value === undefined) return;
  const layout = record(value, pointer);
  exactKeys(layout, OPENXIANGDA_NATIVE_DATA_SURFACE_KEYS_V2.layout, pointer);
  if (
    layout.layout !== undefined &&
    !['flat', 'sections'].includes(layout.layout)
  ) {
    issue('NATIVE_DATA_SURFACE_LAYOUT_INVALID', `${pointer}/layout`);
  }
  if (layout.fieldOrder !== undefined) {
    const fieldOrderPointer = `${pointer}/fieldOrder`;
    if (
      !Array.isArray(layout.fieldOrder) ||
      layout.fieldOrder.length > fields.size ||
      layout.fieldOrder.length > MAX_LAYOUT_FIELD_ORDER_ENTRIES
    ) {
      issue('NATIVE_DATA_SURFACE_FIELD_ORDER_INVALID', fieldOrderPointer);
    }
    const fieldOrder = layout.fieldOrder.map((value: unknown, index: number) =>
      requiredString(value, `${fieldOrderPointer}/${index}`, 63)
    );
    if (new Set(fieldOrder).size !== fieldOrder.length) {
      issue('NATIVE_DATA_SURFACE_FIELD_ORDER_INVALID', fieldOrderPointer);
    }
    fieldOrder.forEach((fieldCode: string, index: number) => {
      if (!fields.has(fieldCode)) {
        issue(
          'NATIVE_DATA_SURFACE_FIELD_ORDER_FIELD_MISSING',
          `${fieldOrderPointer}/${index}`
        );
      }
    });
  }
}

function assertProjection(
  surface: Record<string, any>,
  field: NativeDataFieldV2,
  key:
    | 'maxLength'
    | 'precision'
    | 'scale'
    | 'min'
    | 'max'
    | 'rangeBoundary'
    | 'options'
    | 'source'
    | 'timePrecision'
    | 'serial'
    | 'subtable',
  pointer: string
) {
  if (surface[key] === undefined && field[key] === undefined) return;
  if (surface[key] === undefined || field[key] === undefined) {
    issue('NATIVE_DATA_SURFACE_FIELD_PROJECTION_MISMATCH', `${pointer}/${key}`);
  }
  if (canonicalJson(surface[key]) !== canonicalJson(field[key])) {
    issue('NATIVE_DATA_SURFACE_FIELD_PROJECTION_MISMATCH', `${pointer}/${key}`);
  }
}

function assertFileProjection(
  surface: Record<string, any>,
  field: NativeDataFieldV2,
  pointer: string
) {
  const expected = field.file || {};
  const actual = {
    ...(surface.maxCount === undefined ? {} : { maxCount: surface.maxCount }),
    ...(surface.maxSizeMb === undefined
      ? {}
      : { maxSizeMb: surface.maxSizeMb }),
    ...(surface.accept === undefined
      ? {}
      : {
          accept: normalizeFileAccept(surface.accept),
        }),
  };
  for (const key of ['maxCount', 'maxSizeMb', 'accept'] as const) {
    if (actual[key] === undefined && expected[key] === undefined) continue;
    if (actual[key] === undefined || expected[key] === undefined) {
      issue(
        'NATIVE_DATA_SURFACE_FIELD_PROJECTION_MISMATCH',
        `${pointer}/${key}`
      );
    }
    const actualValue =
      key === 'accept' ? normalizeFileAccept(actual[key]) : actual[key];
    const expectedValue =
      key === 'accept' ? normalizeFileAccept(expected[key]) : expected[key];
    if (canonicalJson(actualValue) !== canonicalJson(expectedValue)) {
      issue(
        'NATIVE_DATA_SURFACE_FIELD_PROJECTION_MISMATCH',
        `${pointer}/${key}`
      );
    }
  }
}

function normalizeFileAccept(value: unknown): unknown[] {
  return (Array.isArray(value) ? [...value] : [value]).sort((left, right) => {
    const leftValue = String(left);
    const rightValue = String(right);
    if (leftValue === rightValue) return 0;
    return leftValue < rightValue ? -1 : 1;
  });
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

function optionalString(value: unknown, pointer: string, maximum: number) {
  if (value === undefined) return;
  if (typeof value !== 'string' || value.length > maximum) {
    issue('NATIVE_STRING_INVALID', pointer);
  }
}

function optionalBoolean(value: unknown, pointer: string) {
  if (value !== undefined && typeof value !== 'boolean') {
    issue('NATIVE_BOOLEAN_REQUIRED', pointer);
  }
}

function issue(code: string, pointer: string): never {
  throw new NativeDataFieldContractV2Error(code, pointer);
}
