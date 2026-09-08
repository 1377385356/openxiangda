import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataFieldSurface, DataResourceSurface, DataWhere } from 'openxiangda-contracts/browser';
import { buildResourceWhere } from '../src/browser/components/platform-fields/resource-query';

function field(
  type: DataFieldSurface['type'],
  widget: DataFieldSurface['widget'],
  input: Partial<DataFieldSurface> = {}
): DataFieldSurface {
  return {
    label: type,
    type,
    widget,
    readCapabilities: [],
    createCapabilities: [],
    updateCapabilities: [],
    ...input,
  };
}

const surface = {
  fields: {
    name: field('text.short', 'text'),
    code: field('text.short', 'text'),
    status: field('option.single', 'select'),
    tags: field('option.multiple', 'multi-select'),
    category: field('cascade.single', 'cascade'),
    categories: field('cascade.multiple', 'cascade'),
    address: field('address', 'address'),
    metadata: field('json', 'json'),
    period: field('date-range', 'date-range', { rangeBoundary: 'closed' }),
  },
  list: { searchableFields: ['name', 'code'] },
} satisfies DataResourceSurface;

test('builds canonical snapshot and text predicates', () => {
  assert.deepEqual(
    buildResourceWhere('records', surface, {
      page: 1,
      pageSize: 20,
      keyword: ' 显微镜 ',
      filters: {
        status: { value: 'enabled', label: '启用' },
        tags: [
          { value: 'precision', label: '精密' },
          { value: 'shared', label: '共享' },
        ],
      },
    }),
    {
      and: [
        {
          or: [
            { field: 'name', operator: 'contains', value: '显微镜' },
            { field: 'code', operator: 'contains', value: '显微镜' },
          ],
        },
        { field: 'status', operator: 'eq', value: 'enabled' },
        { field: 'tags', operator: 'hasAny', value: ['precision', 'shared'] },
      ],
    }
  );
});

test('builds cascade membership and semantic range predicates', () => {
  assert.deepEqual(
    buildResourceWhere('records', surface, {
      page: 1,
      pageSize: 20,
      filters: {
        category: [
          { value: 'equipment', label: '设备' },
          { value: 'microscope', label: '显微镜' },
        ],
        categories: [
          [
            { value: 'equipment', label: '设备' },
            { value: 'microscope', label: '显微镜' },
          ],
          [{ value: 'rooms', label: '场地' }],
        ],
        period: { start: '2026-08-01', end: '2026-08-31' },
      },
    }),
    {
      and: [
        { field: 'category', operator: 'has', value: 'microscope' },
        { field: 'categories', operator: 'hasAny', value: ['microscope', 'rooms'] },
        {
          field: 'period',
          operator: 'overlaps',
          value: { start: '2026-08-01', end: '2026-08-31' },
        },
      ],
    }
  );
});

test('never serializes a caller-supplied range boundary override', () => {
  assert.deepEqual(
    buildResourceWhere('records', surface, {
      page: 1,
      pageSize: 20,
      filters: {
        period: {
          start: '2026-08-01',
          end: '2026-08-31',
          rangeBoundary: 'half-open',
        },
      },
    }),
    {
      and: [
        {
          field: 'period',
          operator: 'overlaps',
          value: { start: '2026-08-01', end: '2026-08-31' },
        },
      ],
    }
  );
});

test('ignores stale-route and empty filters without emitting legacy operators', () => {
  assert.equal(
    buildResourceWhere('records', surface, {
      page: 1,
      pageSize: 20,
      filters: { stale: 'value', tags: [] },
    }),
    undefined
  );
});

test('filters an address by its deepest stable administrative code', () => {
  assert.deepEqual(
    buildResourceWhere('records', surface, {
      page: 1,
      pageSize: 20,
      filters: {
        address: {
          country: { label: '中国', value: '100000' },
          province: { label: '浙江省', value: '330000' },
          city: { label: '杭州市', value: '330100' },
          district: { label: '西湖区', value: '330106' },
          fullAddress: '浙江省杭州市西湖区',
        },
      },
    }),
    {
      and: [{
        field: 'address',
        operator: 'jsonContains',
        path: 'district.value',
        value: '330106',
      }],
    }
  );
});

test('filters bounded JSON with canonical containment', () => {
  assert.deepEqual(
    buildResourceWhere('records', surface, {
      page: 1,
      pageSize: 20,
      filters: { metadata: { enabled: true, level: 2 } },
    }),
    {
      and: [{
        field: 'metadata',
        operator: 'jsonContains',
        value: { enabled: true, level: 2 },
      }],
    }
  );
});

test('nested OR/AND keeps false and zero and normalizes reference selections', () => {
  assert.deepEqual(buildResourceWhere('records', {
    ...surface, fields: { ...surface.fields, enabled: field('boolean', 'switch'), count: field('number.integer', 'number') },
  }, { page: 1, pageSize: 10, keyword: 'name', where: { or: [
    { and: [{ field: 'enabled', operator: 'eq', value: false }, { field: 'count', operator: 'gte', value: 0 }] },
    { field: 'status', operator: 'neq', value: { label: '启用', value: 'enabled' } },
  ] } }), { and: [
    { or: [{ and: [{ field: 'enabled', operator: 'eq', value: false }, { field: 'count', operator: 'gte', value: 0 }] }, { field: 'status', operator: 'neq', value: 'enabled' }] },
    { or: [{ field: 'name', operator: 'contains', value: 'name' }, { field: 'code', operator: 'contains', value: 'name' }] },
  ] });
});

test('advanced canonical membership and array operands retain their cardinality and path', () => {
  const fields = {
    ...surface.fields,
    users: field('user.multiple', 'directory-user'),
    departments: field('department.multiple', 'directory-department'),
    resources: field('resource-ref.multiple', 'resource'),
    amount: field('number.decimal', 'number'),
    start: field('datetime', 'datetime'),
  };
  const conditions: DataWhere[] = [
    ...['tags', 'users', 'departments', 'resources', 'category', 'categories'].map(key =>
      ({ field: key, operator: 'has', value: 'opaque-key' }) as DataWhere),
    { field: 'users', operator: 'hasAny', value: ['one', 'two'] },
    { field: 'categories', operator: 'hasAll', value: ['one', 'two'] },
    { field: 'status', operator: 'in', value: ['enabled', 'disabled'] },
    { field: 'amount', operator: 'between', value: [0, 99] },
    { field: 'start', operator: 'between', value: ['2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'] },
    { field: 'status', operator: 'eq', path: 'label', value: '启用' },
    { field: 'metadata', operator: 'jsonContains', path: 'category', value: { value: 'keep-json-object' } },
    { field: 'address', operator: 'jsonContains', path: 'district.value', value: '330106' },
  ];
  const where: DataWhere = { or: [{ and: conditions }, { not: { field: 'users', operator: 'has', value: 'excluded' } }] };
  const before = structuredClone(where);
  assert.deepEqual(buildResourceWhere('records', { fields }, { page: 1, pageSize: 20, where }), { and: [where] });
  assert.deepEqual(where, before);
});

test('advanced operators reduce rich selections without inferring a different shortcut operator', () => {
  const querySurface = { fields: { ...surface.fields, users: field('user.multiple', 'directory-user') } };
  const where: DataWhere = { and: [
    { field: 'users', operator: 'has', value: { value: 'one', label: '一' } },
    { field: 'status', operator: 'in', value: [{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }] },
    { field: 'users', operator: 'hasAll', value: [{ value: 'one', label: '一' }, { value: 'two', label: '二' }] },
    { field: 'category', operator: 'has', value: [{ value: 'root', label: '父' }, { value: 'leaf', label: '子' }] },
    { field: 'categories', operator: 'hasAny', value: [[{ value: 'root', label: '父' }, { value: 'leaf', label: '子' }], [{ value: 'other', label: '另' }]] },
  ] };
  assert.deepEqual(buildResourceWhere('records', querySurface, { page: 1, pageSize: 20, where }), { and: [{ and: [
    { field: 'users', operator: 'has', value: 'one' },
    { field: 'status', operator: 'in', value: ['enabled', 'disabled'] },
    { field: 'users', operator: 'hasAll', value: ['one', 'two'] },
    { field: 'category', operator: 'has', value: 'leaf' },
    { field: 'categories', operator: 'hasAny', value: ['leaf', 'other'] },
  ] }] });
});
