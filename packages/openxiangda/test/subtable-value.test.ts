import assert from 'node:assert/strict';
import { buildResourceFormOperations } from '../src/browser/components/resource/resource-form-operations';
import test from 'node:test';
import type { DataResourceSurface } from 'openxiangda-contracts/browser';
import {
  buildSubtableOperations,
  type SubtableDraftRow,
} from '../src/browser/components/platform-fields/subtable-value';

const childSurface: DataResourceSurface = {
  fields: {
    parent_id: field('uuid'),
    display_order: field('number.integer'),
    description: field('text.short'),
    private_note: {
      ...field('text.long'),
      createCapabilities: [],
      updateCapabilities: [],
    },
  },
};

test('seven full 50-row replacements form one 701-operation parent CAS transaction', () => {
  const fields = Array.from({ length: 7 }, (_, i) => ({ key: `items${i}`, subtable: { resourceCode: `children-${i}`, foreignKey: 'parent_id', orderField: 'display_order', maxRows: 50 } }));
  const values = Object.fromEntries(fields.map(f => [f.key, [...Array.from({ length: 50 }, (_, i) => ({ key: `${f.key}-${i}`, state: 'deleted', id: `${f.key}-${i}`, revision: 2, data: {} })), ...Array.from({ length: 50 }, (_, i) => ({ key: `new-${i}`, state: 'created', data: { description: `new ${i}` } }))]]));
  const definitions = Object.fromEntries(fields.map(f => [f.subtable.resourceCode, { code: f.subtable.resourceCode, surface: childSurface }]));
  const operations = buildResourceFormOperations({ mode: 'edit', resourceCode: 'requests', record: { id: 'parent-1', revision: 4 }, data: {}, values, subtableFields: fields as any, definitions: definitions as any, canWrite: () => true, canDelete: () => true });
  assert.equal(operations.length, 701);
  assert.equal(operations.filter(value => value.operation === 'delete').length, 350);
  assert.equal(operations.filter(value => value.operation === 'create').length, 350);
  assert.deepEqual(operations[0], { operation: 'update', resourceCode: 'requests', id: 'parent-1', expectedRevision: 4, data: {} });
});

test('standard form consumes the parent budget for a full two-table replacement', () => {
  const fields = [0, 1].map(index => ({ key: `items${index}`, subtable: { resourceCode: `children-${index}`, foreignKey: 'parent_id', orderField: 'display_order', maxRows: 500 } }));
  const values = Object.fromEntries(fields.map(f => [f.key, [...Array.from({ length: 500 }, (_, index) => ({ key: `${f.key}-${index}`, state: 'deleted', id: `${f.key}-${index}`, revision: 2, data: {} })), ...Array.from({ length: 500 }, (_, index) => ({ key: `new-${index}`, state: 'created', data: { description: `new ${index}` } }))]]));
  const definitions: any = Object.fromEntries(fields.map(f => [f.subtable.resourceCode, { code: f.subtable.resourceCode, surface: childSurface }]));
  const input = { mode: 'edit' as const, resourceCode: 'requests', record: { id: 'parent', revision: 4 }, data: {}, values, subtableFields: fields as any, definitions, canWrite: () => true, canDelete: () => true };
  assert.throws(() => buildResourceFormOperations(input), /AGGREGATE_MAX_ROWS/);
  definitions.requests = { code: 'requests', ownedRowLimit: 1000 };
  const operations = buildResourceFormOperations(input);
  assert.equal(operations.length, 2001);
  assert.equal(operations.filter(operation => operation.operation === 'delete').length, 1000);
  assert.equal(operations.filter(operation => operation.operation === 'create').length, 1000);
  assert.deepEqual(operations.at(-1), { operation: 'create', resourceCode: 'children-1', data: { description: 'new 499', parent_id: 'parent', display_order: 499 } });
});

test('plans parent references, updates, deletes and deterministic reorder', () => {
  const rows: SubtableDraftRow[] = [
    {
      key: 'new',
      state: 'created',
      data: { description: 'New', private_note: 'forbidden' },
    },
    {
      key: 'existing',
      state: 'persisted',
      id: 'child-1',
      revision: 3,
      originalOrder: 0,
      originalData: { description: 'Old' },
      data: { description: 'Changed' },
    },
    {
      key: 'deleted',
      state: 'deleted',
      id: 'child-2',
      revision: 2,
      data: {},
    },
  ];
  const operations = buildSubtableOperations({
    rows,
    childResourceCode: 'children',
    childSurface,
    foreignKey: 'parent_id',
    orderField: 'display_order',
    parent: { operation: 'create', operationIndex: 0 },
    canWrite: (_code, field, operation) =>
      (operation === 'create'
        ? field.createCapabilities
        : field.updateCapabilities
      ).length > 0,
    canDelete: true,
  });
  assert.deepEqual(operations, [
    {
      operation: 'delete',
      resourceCode: 'children',
      id: 'child-2',
      expectedRevision: 2,
    },
    {
      operation: 'create',
      resourceCode: 'children',
      data: {
        description: 'New',
        parent_id: { operationIndex: 0, field: 'id' },
        display_order: 0,
      },
    },
    {
      operation: 'update',
      resourceCode: 'children',
      id: 'child-1',
      expectedRevision: 3,
      data: { description: 'Changed', display_order: 1 },
    },
  ]);
});

test('omits unchanged persisted rows and enforces the transaction-derived row bound', () => {
  const unchanged: SubtableDraftRow = {
    key: 'existing',
    state: 'persisted',
    id: 'child-1',
    revision: 1,
    originalOrder: 0,
    originalData: { description: 'Same' },
    data: { description: 'Same' },
  };
  assert.deepEqual(
    buildSubtableOperations({
      rows: [unchanged],
      childResourceCode: 'children',
      childSurface,
      foreignKey: 'parent_id',
      orderField: 'display_order',
      parent: { operation: 'update', id: 'parent-1' },
      canWrite: () => true,
      canDelete: true,
    }),
    []
  );
  assert.throws(
    () =>
      buildSubtableOperations({
        rows: Array.from({ length: 50 }, (_, index) => ({
          key: String(index),
          state: 'created' as const,
          data: { description: String(index) },
        })),
        childResourceCode: 'children',
        childSurface,
        foreignKey: 'parent_id',
        orderField: 'display_order',
        maxRows: 49,
        parent: { operation: 'update', id: 'parent-1' },
        canWrite: () => true,
        canDelete: true,
      }),
    /OPENXIANGDA_SUBTABLE_MAX_ROWS_EXCEEDED/
  );
});

test('subtable plans obey explicit form selection while preserving internal parent and order fields', () => {
  const selectedSurface: DataResourceSurface = {
    fields: {
      ...childSurface.fields,
      hidden: { ...field('text.short'), hidden: true },
      readonly: { ...field('text.short'), widget: 'readonly' },
    },
    form: { fieldOrder: ['description', 'hidden', 'readonly'] },
    detail: { fieldOrder: ['description', 'private_note'] },
  };
  const input = {
    childResourceCode: 'children', childSurface: selectedSurface,
    foreignKey: 'parent_id', orderField: 'display_order',
    parent: { operation: 'update' as const, id: 'parent-1' },
    canWrite: () => true, canDelete: true,
  };
  const data = { description: 'Changed', private_note: 'not selected', hidden: 'hidden', readonly: 'readonly' };
  assert.deepEqual(buildSubtableOperations({ ...input, rows: [
    { key: 'new', state: 'created', data },
    { key: 'existing', state: 'persisted', id: 'child-1', revision: 3, originalOrder: 0,
      originalData: { description: 'Old', private_note: 'old', hidden: 'old', readonly: 'old' }, data },
  ] }), [
    { operation: 'create', resourceCode: 'children', data: { description: 'Changed', parent_id: 'parent-1', display_order: 0 } },
    { operation: 'update', resourceCode: 'children', id: 'child-1', expectedRevision: 3, data: { description: 'Changed', display_order: 1 } },
  ]);
  assert.deepEqual(buildSubtableOperations({ ...input,
    childSurface: { ...selectedSurface, form: { fieldOrder: [] } },
    rows: [{ key: 'existing', state: 'persisted', id: 'child-1', revision: 3, originalOrder: 0, originalData: {}, data }],
  }), []);
});

function field(type: string) {
  return {
    label: type,
    type,
    widget:
      type === 'uuid'
        ? 'readonly'
        : type === 'number.integer'
          ? 'number'
          : 'text',
    readCapabilities: ['read'],
    createCapabilities: ['create'],
    updateCapabilities: ['update'],
  } as any;
}
