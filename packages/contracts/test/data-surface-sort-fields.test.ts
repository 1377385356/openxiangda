import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNativeDataResourceSurfaceV2 } from '../src/native-compiler/data-surface.js';
import { DATA_SYSTEM_SORT_FIELD_CODES, isDataSystemSortField } from '../src/index.js';
import type { NativeDataFieldV2 } from '../src/types.js';

const fields: NativeDataFieldV2[] = [
  { code: 'name', type: 'text.short', label: '名称', nullable: true },
];

const surfaceWithResourceDefaultSort = (field: string) => ({
  mutationOwner: 'native',
  generated: { list: true, detail: true, create: false, update: false, delete: false },
  fields: { name: { label: '名称', type: 'text.short', widget: 'text', readCapabilities: [], createCapabilities: [], updateCapabilities: [] } },
  list: {
    defaultSort: { field, order: 'desc' },
  },
});

const validate = (surface: unknown) =>
  validateNativeDataResourceSurfaceV2(
    surface,
    fields,
    '/config/data/resources/0/surface'
  );

test('resource-level surface list defaultSort accepts platform audit columns', () => {
  for (const code of DATA_SYSTEM_SORT_FIELD_CODES) {
    assert.equal(isDataSystemSortField(code), true);
    assert.doesNotThrow(
      () => validate(surfaceWithResourceDefaultSort(code)),
      `expected ${code} to be a valid resource-level defaultSort field`
    );
  }
});

test('resource-level surface list defaultSort still rejects unknown fields', () => {
  assert.throws(() => validate(surfaceWithResourceDefaultSort('nope')), (error: unknown) =>
    String((error as Error).message).includes('NATIVE_DATA_SURFACE_SORT_UNSUPPORTED')
  );
});
