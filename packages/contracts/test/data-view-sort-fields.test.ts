import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDataResourceViews } from '../src/data-view-validation.js';
import { DATA_SYSTEM_SORT_FIELD_CODES, isDataSystemSortField } from '../src/index.js';

const resourceWithViewDefaultSort = (field: string) => ({
  schema: {
    fields: [{ code: 'title', type: 'text.short' }],
  },
  surface: {
    fields: {
      title: { label: '标题', type: 'text.short' },
    },
    views: [
      {
        code: 'recent',
        name: '最近',
        generated: { list: true, detail: true, create: true, update: true, delete: true },
        list: {
          fieldOrder: ['title'],
          defaultSort: { field, order: 'desc' },
        },
        form: { fieldOrder: ['title'] },
        detail: { fieldOrder: ['title'] },
        mobile: { enabled: true },
      },
    ],
  },
});

test('named view defaultSort accepts platform audit columns without declaration', () => {
  for (const code of DATA_SYSTEM_SORT_FIELD_CODES) {
    assert.equal(isDataSystemSortField(code), true);
    const diagnostics = validateDataResourceViews(
      resourceWithViewDefaultSort(code) as never
    );
    assert.deepEqual(
      diagnostics.filter(item => item.code === 'DATA_RESOURCE_VIEW_INVALID'),
      [],
      `expected ${code} to be a valid defaultSort field`
    );
  }
});

test('named view defaultSort still rejects unknown fields', () => {
  const diagnostics = validateDataResourceViews(
    resourceWithViewDefaultSort('nope') as never
  );
  assert.equal(
    diagnostics.some(item => item.code === 'DATA_RESOURCE_VIEW_INVALID'),
    true
  );
});
