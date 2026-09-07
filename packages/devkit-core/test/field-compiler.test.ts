import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DATA_FIELD_TYPES,
  type DataFieldDefinition,
  type DataFieldType,
  type DataQueryOperator,
} from 'openxiangda-contracts';
import {
  compileApplicationSources,
  defineOpenXiangdaApp,
  type AppDataFieldDeclaration,
  type OpenXiangdaAppDeclaration,
} from '../src/index.js';
import {
  fieldNullable,
  isGeneratedField,
  isMultiValueField,
  typescriptType,
} from '../src/compiler/field-codec.js';
import { physicalPlanForField } from '../src/compiler/field-physical-plan.js';
import {
  aggregatePlanForField,
  operatorsForField,
  supportsFilter,
  supportsOperator,
  supportsSearch,
  supportsSort,
} from '../src/compiler/field-query-plan.js';
import {
  compatibleWidgets,
  resolveDataFieldSurfaceWidget,
} from '../src/compiler/field-surface.js';

const expectedWidgets: Record<DataFieldType, string> = {
  'text.short': 'text',
  'text.long': 'textarea',
  'text.rich': 'rich-text',
  'number.integer': 'number',
  'number.decimal': 'number',
  boolean: 'switch',
  date: 'date',
  time: 'time',
  datetime: 'datetime',
  'date-range': 'date-range',
  'datetime-range': 'datetime-range',
  'option.single': 'select',
  'option.multiple': 'multi-select',
  'cascade.single': 'cascade',
  'cascade.multiple': 'cascade',
  'user.single': 'directory-user',
  'user.multiple': 'directory-user',
  'department.single': 'directory-department',
  'department.multiple': 'directory-department',
  'resource-ref.single': 'select',
  'resource-ref.multiple': 'multi-select',
  file: 'attachment',
  image: 'image',
  signature: 'signature',
  address: 'address',
  location: 'location',
  uuid: 'readonly',
  json: 'json',
  'serial-number': 'readonly',
  subtable: 'subtable',
};

const expectedTypescript: Record<DataFieldType, string> = {
  'text.short': 'string',
  'text.long': 'string',
  'text.rich': 'string',
  'number.integer': 'number',
  'number.decimal': 'number',
  boolean: 'boolean',
  date: 'string',
  time: 'string',
  datetime: 'string',
  'date-range': 'DateRangeValue',
  'datetime-range': 'DateRangeValue',
  'option.single': 'LabeledValue',
  'option.multiple': 'LabeledValue[]',
  'cascade.single': 'CascadePathValue',
  'cascade.multiple': 'CascadePathValue[]',
  'user.single': 'UserReferenceValue',
  'user.multiple': 'UserReferenceValue[]',
  'department.single': 'DepartmentReferenceValue',
  'department.multiple': 'DepartmentReferenceValue[]',
  'resource-ref.single': 'ResourceReferenceValue',
  'resource-ref.multiple': 'ResourceReferenceValue[]',
  file: 'DataFileRef[]',
  image: 'DataImageRef[]',
  signature: 'StableSignatureValue',
  address: 'StableAddressValue',
  location: 'StableLocationValue',
  uuid: 'string',
  json: 'unknown',
  'serial-number': 'string',
  subtable: 'Array<Record<string, unknown>>',
};

const textOperators = [
  'eq', 'neq', 'contains', 'startsWith', 'endsWith', 'in', 'isEmpty',
  'isNotEmpty',
] as const;
const orderedOperators = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'isEmpty',
] as const;
const singleSnapshotOperators = [
  'eq', 'neq', 'in', 'isEmpty', 'isNotEmpty',
] as const;
const multiSnapshotOperators = [
  'has', 'hasAny', 'hasAll', 'isEmpty', 'isNotEmpty',
] as const;
const rangeOperators = ['overlaps', 'contains', 'containedBy', 'isEmpty'] as const;
const jsonOperators = ['jsonContains', 'isEmpty', 'isNotEmpty'] as const;
const emptyOperators = ['isEmpty', 'isNotEmpty'] as const;

const expectedOperators: Record<
  DataFieldType,
  readonly DataQueryOperator[]
> = {
  'text.short': textOperators,
  'text.long': textOperators,
  'text.rich': textOperators,
  'number.integer': orderedOperators,
  'number.decimal': orderedOperators,
  boolean: ['eq', 'neq', 'in', 'isEmpty'],
  date: orderedOperators,
  time: orderedOperators,
  datetime: orderedOperators,
  'date-range': rangeOperators,
  'datetime-range': rangeOperators,
  'option.single': singleSnapshotOperators,
  'option.multiple': multiSnapshotOperators,
  'cascade.single': multiSnapshotOperators,
  'cascade.multiple': multiSnapshotOperators,
  'user.single': singleSnapshotOperators,
  'user.multiple': multiSnapshotOperators,
  'department.single': singleSnapshotOperators,
  'department.multiple': multiSnapshotOperators,
  'resource-ref.single': singleSnapshotOperators,
  'resource-ref.multiple': multiSnapshotOperators,
  file: emptyOperators,
  image: emptyOperators,
  signature: emptyOperators,
  address: jsonOperators,
  location: jsonOperators,
  uuid: ['eq', 'neq', 'in', 'isEmpty'],
  json: jsonOperators,
  'serial-number': ['eq', 'neq', 'in', 'contains', 'startsWith'],
  subtable: [],
};

test('covers every semantic field in codec, widget, and operator registries', () => {
  assert.deepEqual(Object.keys(expectedWidgets).sort(), [...DATA_FIELD_TYPES].sort());
  assert.deepEqual(
    Object.keys(expectedTypescript).sort(),
    [...DATA_FIELD_TYPES].sort()
  );
  assert.deepEqual(
    Object.keys(expectedOperators).sort(),
    [...DATA_FIELD_TYPES].sort()
  );
  for (const type of DATA_FIELD_TYPES) {
    assert.equal(resolveDataFieldSurfaceWidget({ type }), expectedWidgets[type]);
    assert.equal(compatibleWidgets(type).includes(expectedWidgets[type] as never), true);
    assert.equal(typescriptType(type), expectedTypescript[type]);
    assert.deepEqual(operatorsForField(type), expectedOperators[type]);
    assert.equal(supportsFilter(type), expectedOperators[type].length > 0);
    for (const operator of expectedOperators[type]) {
      assert.equal(supportsOperator(type, operator), true);
    }
  }
});

test('derives the PostgreSQL storage and index plan for every semantic field', () => {
  const singleSnapshots = new Set<DataFieldType>([
    'option.single', 'user.single', 'department.single', 'resource-ref.single',
  ]);
  const ginJson = new Set<DataFieldType>([
    'option.multiple', 'cascade.single', 'cascade.multiple', 'user.multiple',
    'department.multiple', 'resource-ref.multiple', 'address', 'location', 'json',
  ]);
  const ranges = new Set<DataFieldType>(['date-range', 'datetime-range']);
  const jsonb = new Set<DataFieldType>([
    'option.single', 'option.multiple', 'cascade.single', 'cascade.multiple',
    'user.single', 'user.multiple', 'department.single', 'department.multiple',
    'resource-ref.single', 'resource-ref.multiple', 'file', 'image', 'signature',
    'address', 'location', 'json',
  ]);
  const storage: Partial<Record<DataFieldType, string>> = {
    'text.short': 'varchar(120)',
    'text.long': 'text',
    'text.rich': 'text',
    'number.integer': 'bigint',
    'number.decimal': 'numeric(12,2)',
    boolean: 'boolean',
    date: 'date',
    time: 'time(0)',
    datetime: 'timestamptz',
    'date-range': 'daterange',
    'datetime-range': 'tstzrange',
    uuid: 'uuid',
    'serial-number': 'varchar(255)',
  };

  for (const type of DATA_FIELD_TYPES) {
    const field: DataFieldDefinition = {
      code: `field_${type.replaceAll('.', '_').replaceAll('-', '_')}`,
      type,
      indexed: true,
      ...(type === 'text.short' ? { maxLength: 120 } : {}),
      ...(type === 'number.decimal' ? { precision: 12, scale: 2 } : {}),
      ...(type === 'date-range'
        ? { rangeBoundary: 'closed' as const }
        : type === 'datetime-range'
          ? { rangeBoundary: 'half-open' as const }
          : {}),
      ...(type === 'subtable'
        ? {
            subtable: {
              resourceCode: 'child-records',
              foreignKey: 'parent_id',
              orderField: 'display_order',
            },
          }
        : {}),
    };
    const plan = physicalPlanForField(field);
    assert.equal(
      plan.storage,
      type === 'subtable' ? 'child-resource' : storage[type] || (jsonb.has(type) ? 'jsonb' : '')
    );
    assert.equal(
      plan.index,
      type === 'subtable'
        ? 'none'
        : ranges.has(type)
          ? 'gist-range'
          : singleSnapshots.has(type)
            ? 'btree-snapshot-expressions'
            : ginJson.has(type)
              ? 'gin-jsonb-path'
              : 'btree'
    );
    if (type === 'date-range' || type === 'datetime-range') {
      assert.equal(
        plan.rangeBoundary,
        type === 'date-range' ? 'closed' : 'half-open'
      );
    }
  }
  assert.equal(
    physicalPlanForField(
      { code: 'title', type: 'text.short', indexed: true },
      true
    ).index,
    'gin-trigram'
  );
  assert.equal(
    physicalPlanForField(
      {
        code: 'status',
        type: 'option.single',
        indexed: true,
        options: [{ label: 'Open', value: 'open' }],
      },
      true
    ).index,
    'gin-trigram'
  );
});

test('defines one explicit aggregate matrix for every semantic field type', () => {
  const singleSnapshots = new Set<DataFieldType>([
    'option.single', 'user.single', 'department.single', 'resource-ref.single',
  ]);
  const numeric = new Set<DataFieldType>([
    'number.integer', 'number.decimal',
  ]);
  const ordered = new Set<DataFieldType>([
    'text.short', 'text.long', 'number.integer', 'number.decimal', 'date',
    'time', 'datetime', 'serial-number',
  ]);
  const distinctScalar = new Set<DataFieldType>([
    ...ordered, 'boolean', 'uuid',
  ]);
  for (const type of DATA_FIELD_TYPES) {
    assert.equal(Boolean(aggregatePlanForField(type, 'sum')), numeric.has(type));
    assert.equal(Boolean(aggregatePlanForField(type, 'avg')), numeric.has(type));
    assert.equal(Boolean(aggregatePlanForField(type, 'min')), ordered.has(type));
    assert.equal(Boolean(aggregatePlanForField(type, 'max')), ordered.has(type));
    const distinct = aggregatePlanForField(type, 'countDistinct');
    assert.equal(Boolean(distinct), distinctScalar.has(type) || singleSnapshots.has(type));
    if (singleSnapshots.has(type)) {
      assert.equal(distinct?.valueExpression, 'snapshot-value');
    }
  }
});

test('keeps multi, nullable, and generated write semantics explicit', () => {
  for (const type of DATA_FIELD_TYPES) {
    const field = { type, nullable: true } as const;
    assert.equal(
      isMultiValueField(type),
      [
        'option.multiple', 'cascade.multiple', 'user.multiple',
        'department.multiple', 'resource-ref.multiple', 'file', 'image',
        'subtable',
      ].includes(type)
    );
    assert.equal(isGeneratedField(type), type === 'serial-number');
    assert.equal(
      fieldNullable(field),
      !isMultiValueField(type) && type !== 'serial-number'
    );
  }
});

test('rejects incompatible widgets and unplanned list capabilities', () => {
  const declaration = baseDeclaration([
    { code: 'title', type: 'text.short', label: 'Title', widget: 'signature' as never },
    {
      code: 'owners',
      type: 'user.multiple',
      label: 'Owners',
      sortable: true,
    },
  ]);
  assert.throws(
    () => defineOpenXiangdaApp(declaration),
    (error: any) => {
      const codes = new Set(error?.diagnostics?.map((item: any) => item.code));
      return (
        codes.has('APP_CONFIG_DATA_FIELD_WIDGET_INCOMPATIBLE') &&
        codes.has('APP_CONFIG_DATA_FIELD_SORT_UNSUPPORTED')
      );
    }
  );
});

test('rating is an integer presentation with the existing numeric storage contract', () => {
  const declaration = defineOpenXiangdaApp(baseDeclaration([{ code: 'score', type: 'number.integer', label: '评分', widget: 'rating', min: 0, max: 5 }]));
  const compiled = compileApplicationSources(declaration).contracts.typescript;
  const surfaces = JSON.parse(compiled.match(/export const resourceSurfaces = ([\s\S]*?) as const;/)![1]!);
  assert.equal(surfaces['all-fields'].fields.score.widget, 'rating');
  assert.equal(surfaces['all-fields'].fields.score.type, 'number.integer');
  assert.equal(surfaces['all-fields'].fields.score.max, 5);
  assert.throws(() => defineOpenXiangdaApp(baseDeclaration([{ code: 'score', type: 'text.short', label: '评分', widget: 'rating' }])), (error: any) => error.diagnostics.some((item: any) => item.code === 'APP_CONFIG_DATA_FIELD_WIDGET_INCOMPATIBLE'));
});

test('requires one explicit boundary on every range declaration', () => {
  for (const type of ['date-range', 'datetime-range'] as const) {
    assert.throws(
      () =>
        defineOpenXiangdaApp(
          baseDeclaration([{ code: 'period', type, label: 'Period' }])
        ),
      (error: any) =>
        error?.diagnostics?.some(
          (item: any) =>
            item.code === 'APP_CONFIG_DATA_FIELD_RANGE_BOUNDARY_REQUIRED' &&
            item.path === 'data.resources[0].fields[0].rangeBoundary'
        )
    );
  }
  assert.throws(
    () =>
      defineOpenXiangdaApp(
        baseDeclaration([
          {
            code: 'title',
            type: 'text.short',
            label: 'Title',
            rangeBoundary: 'closed',
          },
        ])
      ),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_DATA_FIELD_RANGE_BOUNDARY_TYPE_INVALID'
      )
  );
});

test('requires bounded all-mode for dynamic radio and checkbox fields', () => {
  for (const [type, widget] of [
    ['resource-ref.single', 'radio'],
    ['resource-ref.multiple', 'checkbox'],
  ] as const) {
    const field = dynamicReference(type, widget, 'search');
    assert.throws(
      () => defineOpenXiangdaApp(referenceDeclaration(field)),
      (error: any) =>
        error?.diagnostics?.some(
          (item: any) =>
            item.code === 'APP_CONFIG_DATA_FIELD_SOURCE_LOAD_MODE_INVALID'
        )
    );
    assert.doesNotThrow(() =>
      defineOpenXiangdaApp(referenceDeclaration(dynamicReference(type, widget, 'all')))
    );
  }
});

test('generates exact record, create, and update values for all field types', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp(allFieldDeclaration())
  ).contracts.typescript;
  const record = interfaceBody(compiled, 'AllFieldsRecord');
  const create = interfaceBody(compiled, 'AllFieldsCreateInput');
  const update = interfaceBody(compiled, 'AllFieldsUpdateInput');

  for (const type of DATA_FIELD_TYPES) {
    const code = fieldCode(type);
    const valueType = expectedTypescript[type];
    const nullable = !isMultiValueField(type) && type !== 'serial-number' && type !== 'text.short';
    assert.match(
      record,
      new RegExp(`\\b${code}${nullable ? '\\?' : ''}: ${escape(valueType)}${nullable ? ' \\| null' : ''};`)
    );
    if (type === 'serial-number') {
      assert.doesNotMatch(create, new RegExp(`\\b${code}`));
      assert.doesNotMatch(update, new RegExp(`\\b${code}`));
      continue;
    }
    assert.match(
      create,
      new RegExp(`\\b${code}${nullable ? '\\?' : ''}: ${escape(valueType)}${nullable ? ' \\| null' : ''};`)
    );
    assert.match(
      update,
      new RegExp(`\\b${code}\\?: ${escape(valueType)}${nullable ? ' \\| null' : ''};`)
    );
  }
});

test('generates required platform-owned image metadata', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp(allFieldDeclaration())
  ).contracts.typescript;
  assert.match(compiled, /export interface DataImageRef extends DataFileRef \{[\s\S]*?width: number;/);
  assert.match(compiled, /thumbnailUrl: string;/);
  assert.match(compiled, /previewUrl: string;/);
});

test('projects authoritative field bounds into the standard Surface', () => {
  const sources = compileApplicationSources(
    defineOpenXiangdaApp(allFieldDeclaration())
  );
  const compiled = sources.contracts.typescript;
  const surfaces = JSON.parse(
    compiled.match(/export const resourceSurfaces = ([\s\S]*?) as const;/)![1]!
  );
  const fields = surfaces['all-fields'].fields;
  assert.equal(fields.text_short.maxLength, 120);
  assert.equal(fields.number_decimal.precision, 12);
  assert.equal(fields.number_decimal.scale, 2);
  assert.equal(fields.number_integer.min, 0);
  assert.equal(fields.number_integer.max, 1000);
  assert.equal(fields.date_range.rangeBoundary, 'closed');
  assert.equal(fields.datetime_range.rangeBoundary, 'half-open');
  assert.equal(fields.file.maxCount, 5);
  assert.equal(fields.file.maxSizeMb, 20);
  assert.deepEqual(fields.serial_number.serial, {
    prefix: 'F-', digits: 6, start: 1,
  });
  assert.deepEqual(fields.subtable.subtable, {
    resourceCode: 'child-records',
    foreignKey: 'parent_id',
    orderField: 'display_order',
    maxRows: 20,
  });
  assert.deepEqual(
    sources.config.value.data.resources[0]!.invariants,
    [
      {
        code: 'numeric-order',
        expression: {
          leftField: 'number_integer',
          operator: 'gte',
          rightField: 'number_decimal',
        },
      },
    ]
  );
  const createCapability = sources.aiCatalog.value.capabilities.find(
    item => item.code === 'field-compiler.all-fields.create'
  );
  assert.equal(
    createCapability?.inputSchema.properties?.date_range?.[
      'x-openxiangda-range-boundary'
    ],
    'closed'
  );
  assert.equal(
    createCapability?.inputSchema.properties?.datetime_range?.[
      'x-openxiangda-range-boundary'
    ],
    'half-open'
  );
});

test('rejects a subtable order field that is not a writable required integer', () => {
  const declaration = allFieldDeclaration();
  const child = declaration.data!.resources.find(
    resource => resource.code === 'child-records'
  )!;
  const orderField = child.fields.find(
    field => field.code === 'display_order'
  )!;
  orderField.type = 'text.short';
  assert.throws(
    () => defineOpenXiangdaApp(declaration),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) => item.code === 'APP_CONFIG_DATA_SUBTABLE_ORDER_FIELD_INVALID'
      )
  );
});

test('rejects aggregate subtable capacity above one atomic transaction', () => {
  const declaration = allFieldDeclaration();
  declaration.data!.resources[0]!.fields.push({
    code: 'secondary_children',
    type: 'subtable',
    label: 'Secondary children',
    subtable: {
      resourceCode: 'child-records',
      foreignKey: 'parent_id',
      orderField: 'display_order',
      maxRows: 30,
    },
  });
  assert.throws(
    () => defineOpenXiangdaApp(declaration),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_DATA_SUBTABLE_AGGREGATE_MAX_ROWS_EXCEEDED'
      )
  );
});

function baseDeclaration(fields: AppDataFieldDeclaration[]): OpenXiangdaAppDeclaration {
  return {
    schemaVersion: 3,
    app: { code: 'field-compiler', name: 'Field compiler' },
    frontend: { root: 'apps/web' },
    backend: { root: 'apps/server', runtime: 'node', framework: 'nestjs' },
    platform: { root: 'platform' },
    data: {
      resources: [{ code: 'all-fields', name: 'All fields', fields }],
    },
  };
}

function referenceDeclaration(field: AppDataFieldDeclaration) {
  const declaration = baseDeclaration([field]);
  declaration.data!.resources.push({
    code: 'lookups',
    name: 'Lookups',
    fields: [
      { code: 'name', type: 'text.short', label: 'Name', required: true },
    ],
  });
  return declaration;
}

function dynamicReference(
  type: 'resource-ref.single' | 'resource-ref.multiple',
  widget: 'radio' | 'checkbox',
  loadMode: 'search' | 'all'
): AppDataFieldDeclaration {
  return {
    code: 'lookup',
    type,
    label: 'Lookup',
    widget,
    source: {
      kind: 'resource',
      resourceCode: 'lookups',
      labelField: 'name',
      loadMode,
      pageSize: 20,
    },
  };
}

function allFieldDeclaration() {
  const fields = DATA_FIELD_TYPES.map<AppDataFieldDeclaration>(type => ({
    code: fieldCode(type),
    type,
    label: type,
    ...(type === 'text.short' ? { required: true, maxLength: 120 } : {}),
    ...(type === 'number.decimal' ? { precision: 12, scale: 2 } : {}),
    ...(type === 'number.integer' ? { min: 0, max: 1000 } : {}),
    ...(type === 'date-range'
      ? { rangeBoundary: 'closed' as const }
      : type === 'datetime-range'
        ? { rangeBoundary: 'half-open' as const }
        : {}),
    ...(type === 'time' ? { timePrecision: 'second' as const } : {}),
    ...(type.startsWith('option.')
      ? { options: [{ label: 'Open', value: 'open' }] }
      : {}),
    ...(type.startsWith('cascade.')
      ? {
          options: [
            {
              label: 'Root',
              value: 'root',
              children: [{ label: 'Leaf', value: 'leaf' }],
            },
          ],
        }
      : {}),
    ...(type.startsWith('resource-ref.')
      ? {
          source: {
            kind: 'resource' as const,
            resourceCode: 'lookups',
            labelField: 'name',
          },
        }
      : {}),
    ...(type === 'file' || type === 'image'
      ? { file: { maxCount: 5, maxSizeMb: 20 } }
      : {}),
    ...(type === 'serial-number'
      ? { serial: { prefix: 'F-', digits: 6, start: 1 } }
      : {}),
    ...(type === 'subtable'
      ? {
          subtable: {
            resourceCode: 'child-records',
            foreignKey: 'parent_id',
            orderField: 'display_order',
            maxRows: 20,
          },
        }
      : {}),
  }));
  const declaration = baseDeclaration(fields);
  declaration.data!.resources[0]!.invariants = [
    {
      code: 'numeric-order',
      expression: {
        leftField: 'number_integer',
        operator: 'gte',
        rightField: 'number_decimal',
      },
    },
  ];
  declaration.data!.resources.push(
    {
      code: 'lookups',
      name: 'Lookups',
      fields: [
        { code: 'name', type: 'text.short', label: 'Name', required: true },
      ],
    },
    {
      code: 'child-records',
      name: 'Child records',
      fields: [
        { code: 'parent_id', type: 'uuid', label: 'Parent', required: true },
        {
          code: 'display_order',
          type: 'number.integer',
          label: 'Order',
          required: true,
          indexed: true,
        },
        { code: 'value', type: 'text.short', label: 'Value' },
      ],
    }
  );
  return declaration;
}

function fieldCode(type: DataFieldType) {
  return type.replaceAll('.', '_').replaceAll('-', '_');
}

function interfaceBody(source: string, name: string) {
  return source.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] || '';
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
