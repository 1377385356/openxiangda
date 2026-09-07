import assert from 'node:assert/strict';
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
