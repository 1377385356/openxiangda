import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContractValidationError,
  FIELD_VALUE_SCHEMAS,
  SCHEMA_VERSIONS,
  assertDataExportRequest,
  assertDataQuery,
  assertDataResource,
  dataResourceSchema,
  validateDataQuery,
  validateDataExportRequest,
  type DataExportRequest,
  type DataQuery,
  type DataResource,
} from '../src/index.js';

test('defines location as exact DingTalk/browser coordinates', () => {
  const schema = FIELD_VALUE_SCHEMAS.location as {
    required: readonly string[];
    properties: Record<string, unknown>;
  };
  assert.deepEqual(schema.required, [
    'source',
    'longitude',
    'latitude',
  ]);
  assert.deepEqual(schema.properties.source, {
    enum: ['browser', 'dingTalk'],
  });
});

test('bounds subtable snapshots to the atomic transaction capacity', () => {
  const schema = FIELD_VALUE_SCHEMAS.subtable as { maxItems: number };
  assert.equal(schema.maxItems, 49);
});

test('requires platform-derived dimensions and protected variants for images', () => {
  const image = FIELD_VALUE_SCHEMAS.image as {
    items: { required: readonly string[] };
  };
  assert.deepEqual(image.items.required.slice(-4), [
    'width',
    'height',
    'thumbnailUrl',
    'previewUrl',
  ]);
});

test('defines export as the standard query projection without paging controls', () => {
  const request: DataExportRequest = {
    schemaVersion: SCHEMA_VERSIONS.dataExportRequest,
    select: ['name', 'status'],
    where: { field: 'status', operator: 'eq', value: 'active' },
    order: [{ field: 'name', direction: 'asc' }],
  };
  assert.doesNotThrow(() => assertDataExportRequest(request));
  assert.ok(
    validateDataExportRequest({ ...request, limit: 100 }).some(
      item => item.code === 'DATA_EXPORT_PROPERTY_UNKNOWN'
    )
  );
  assert.ok(
    validateDataExportRequest({
      ...request,
      where: { field: 'name', operator: 'unknown', value: 'x' },
    }).some(item => item.code === 'DATA_QUERY_OPERATOR_INVALID')
  );
});

function resource(fields: DataResource['schema']['fields']): DataResource {
  return {
    schemaVersion: SCHEMA_VERSIONS.dataResource,
    appCode: 'field-protocol',
    code: 'records',
    name: '记录',
    schema: { fields },
    capabilities: {
      read: 'app:field-protocol:data:records:read',
      create: 'app:field-protocol:data:records:create',
      update: 'app:field-protocol:data:records:update',
      delete: 'app:field-protocol:data:records:delete',
    },
    fieldPolicies: {},
  };
}

test('keeps the complete generated resource surface in the public schema', () => {
  const surface = dataResourceSchema.properties.surface;
  const fieldSurface = surface.properties.fields.additionalProperties;
  assert.deepEqual(Object.keys(surface.properties), [
    'mutationOwner',
    'generated',
    'fields',
    'list',
    'form',
    'detail',
    'mobile',
    'views',
  ]);
  assert.deepEqual(Object.keys(surface.properties.generated.properties), [
    'list',
    'detail',
    'create',
    'update',
    'delete',
  ]);
  assert.deepEqual(Object.keys(fieldSurface.properties), [
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
  ]);
  assert.deepEqual(Object.keys(surface.properties.list.properties), [
    'actions',
    'fieldOrder',
    'defaultPageSize',
    'searchableFields',
    'filterFields',
    'defaultSort',
  ]);
  assert.deepEqual(
    Object.keys(surface.properties.list.properties.defaultSort.properties),
    ['field', 'order']
  );
  assert.deepEqual(Object.keys(surface.properties.form.properties), [
    'layout',
    'fieldOrder',
  ]);
  assert.deepEqual(Object.keys(surface.properties.detail.properties), [
    'layout',
    'fieldOrder',
  ]);
  assert.deepEqual(Object.keys(surface.properties.mobile.properties), [
    'enabled',
  ]);
  assert.equal(surface.additionalProperties, false);
  assert.equal(fieldSurface.additionalProperties, false);
  assert.equal(surface.properties.list.additionalProperties, false);
  assert.equal(
    surface.properties.list.properties.defaultSort.additionalProperties,
    false
  );
  assert.equal(surface.properties.form.additionalProperties, false);
  assert.equal(surface.properties.detail.additionalProperties, false);
  assert.equal(surface.properties.mobile.additionalProperties, false);

  const generated: DataResource = {
    ...resource([
      { code: 'summary', type: 'text.short', maxLength: 500 },
      { code: 'amount', type: 'number.decimal', precision: 12, scale: 2 },
      {
        code: 'attachments',
        type: 'file',
        file: {
          maxCount: 5,
          maxSizeMb: 20,
          accept: ['application/pdf'],
        },
      },
      {
        code: 'ticket_no',
        type: 'serial-number',
        serial: { prefix: 'T-', digits: 8, start: 1000 },
      },
      {
        code: 'lines',
        type: 'subtable',
        subtable: {
          resourceCode: 'line-items',
          foreignKey: 'record_id',
          orderField: 'display_order',
          maxRows: 20,
        },
      },
    ]),
    surface: {
      mutationOwner: 'native',
      generated: {
        list: true,
        detail: true,
        create: true,
        update: true,
        delete: true,
      },
      fields: {
        summary: surfaceField('text.short', 'text', { maxLength: 500 }),
        amount: surfaceField('number.decimal', 'money', {
          precision: 12,
          scale: 2,
        }),
        attachments: surfaceField('file', 'attachment', {
          maxCount: 5,
          maxSizeMb: 20,
          accept: ['application/pdf'],
        }),
        ticket_no: surfaceField('serial-number', 'readonly', {
          serial: { prefix: 'T-', digits: 8, start: 1000 },
        }),
        lines: surfaceField('subtable', 'subtable', {
          subtable: {
            resourceCode: 'line-items',
            foreignKey: 'record_id',
            orderField: 'display_order',
            maxRows: 20,
          },
        }),
      },
      list: {
        defaultPageSize: 20,
        searchableFields: ['summary'],
        filterFields: ['summary'],
        defaultSort: { field: 'summary', order: 'asc' },
      },
      form: {
        layout: 'sections',
        fieldOrder: ['ticket_no', 'summary', 'amount', 'attachments', 'lines'],
      },
      detail: {
        layout: 'flat',
        fieldOrder: ['summary', 'amount', 'attachments', 'ticket_no', 'lines'],
      },
      mobile: { enabled: true },
      views: [],
    },
  };
  assert.doesNotThrow(() => assertDataResource(generated));
  assert.deepEqual(
    Object.keys(generated.surface || {}),
    Object.keys(surface.properties)
  );
});

function surfaceField(
  type: DataResource['schema']['fields'][number]['type'],
  widget: NonNullable<DataResource['surface']>['fields'][string]['widget'],
  projection: Record<string, unknown>
) {
  return {
    label: type,
    type,
    widget,
    readCapabilities: ['read'],
    createCapabilities: ['create'],
    updateCapabilities: ['update'],
    ...projection,
  };
}

test('accepts static snapshots and dynamic resource snapshot sources', () => {
  assert.doesNotThrow(() =>
    assertDataResource(
      resource([
        {
          code: 'status',
          type: 'option.single',
          options: [
            { label: '草稿', value: 'draft', color: '#777777' },
            { label: '完成', value: 'done', description: '已完成' },
          ],
        },
        {
          code: 'categories',
          type: 'cascade.multiple',
          options: [
            {
              label: '设备',
              value: 'equipment',
              children: [{ label: '显微镜', value: 'microscope' }],
            },
          ],
        },
        {
          code: 'college',
          type: 'resource-ref.single',
          source: {
            kind: 'resource',
            resourceCode: 'colleges',
            labelField: 'name',
            searchFields: ['name', 'code'],
            snapshotFields: ['code', 'parentCollege'],
            filters: [
              {
                field: 'enabled',
                operator: 'eq',
                value: true,
              },
            ],
            pageSize: 20,
            loadMode: 'search',
          },
        },
      ])
    )
  );
});

test('rejects old physical types, reference flags and ambiguous multiplicity', () => {
  assert.throws(
    () =>
      assertDataResource(
        resource([
          {
            code: 'owner',
            type: 'string',
            reference: { kind: 'directory-user' },
          } as never,
        ])
      ),
    ContractValidationError
  );
  assert.throws(
    () =>
      assertDataResource(
        resource([
          {
            code: 'attachments',
            type: 'file',
            file: { multiple: true, maxCount: 2 },
          } as never,
        ])
      ),
    ContractValidationError
  );
});

test('requires static options, dynamic sources and semantic-only configuration', () => {
  assert.throws(
    () => assertDataResource(resource([{ code: 'status', type: 'option.single' }])),
    ContractValidationError
  );
  assert.throws(
    () =>
      assertDataResource(
        resource([{ code: 'customer', type: 'resource-ref.single' }])
      ),
    ContractValidationError
  );
  assert.throws(
    () =>
      assertDataResource(
        resource([
          {
            code: 'amount',
            type: 'number.decimal',
            precision: 5,
            scale: 6,
          },
        ])
      ),
    ContractValidationError
  );
});

test('accepts one bounded typed where tree', () => {
  const query: DataQuery = {
    schemaVersion: SCHEMA_VERSIONS.dataQuery,
    select: ['name', 'status'],
    where: {
      and: [
        { field: 'name', operator: 'contains', value: '显微镜' },
        {
          or: [
            { field: 'status', operator: 'in', value: ['draft', 'done'] },
            { field: 'owner', operator: 'isEmpty' },
          ],
        },
        {
          not: {
            field: 'college',
            operator: 'eq',
            value: 'blocked-college',
            path: 'value',
          },
        },
      ],
    },
    order: [{ field: 'name', direction: 'asc', nulls: 'last' }],
    limit: 200,
    offset: 0,
  };
  assert.doesNotThrow(() => assertDataQuery(query));
});

test('rejects legacy filters and malformed operator values', () => {
  assert.throws(
    () =>
      assertDataQuery({
        schemaVersion: SCHEMA_VERSIONS.dataQuery,
        filters: [{ field: 'name', operator: 'ilike', value: '%x%' }],
      }),
    ContractValidationError
  );
  assert.equal(
    validateDataQuery({
      schemaVersion: SCHEMA_VERSIONS.dataQuery,
      where: { field: 'name', operator: 'isEmpty', value: null },
    }).some(item => item.code === 'DATA_QUERY_VALUE_PRESENCE_INVALID'),
    true
  );
  assert.equal(
    validateDataQuery({
      schemaVersion: SCHEMA_VERSIONS.dataQuery,
      where: { field: 'name', operator: 'between', value: [1] },
    }).some(item => item.code === 'DATA_QUERY_ARRAY_VALUE_INVALID'),
    true
  );
});

test('enforces query depth, predicate and array bounds before SQL', () => {
  const tooDeep = {
    not: { not: { not: { not: { not: { field: 'name', operator: 'eq', value: 'x' } } } } },
  };
  assert.equal(
    validateDataQuery({
      schemaVersion: SCHEMA_VERSIONS.dataQuery,
      where: tooDeep,
    }).some(item => item.code === 'DATA_QUERY_DEPTH_EXCEEDED'),
    true
  );
  const predicates = Array.from({ length: 51 }, (_, index) => ({
    field: 'name',
    operator: 'eq',
    value: String(index),
  }));
  assert.equal(
    validateDataQuery({
      schemaVersion: SCHEMA_VERSIONS.dataQuery,
      where: {
        and: [
          { and: predicates.slice(0, 26) },
          { and: predicates.slice(26) },
        ],
      },
    }).some(item => item.code === 'DATA_QUERY_PREDICATES_EXCEEDED'),
    true
  );
  assert.equal(
    validateDataQuery({
      schemaVersion: SCHEMA_VERSIONS.dataQuery,
      where: {
        field: 'status',
        operator: 'in',
        value: Array.from({ length: 101 }, (_, index) => String(index)),
      },
    }).some(item => item.code === 'DATA_QUERY_ARRAY_VALUE_INVALID'),
    true
  );
});
