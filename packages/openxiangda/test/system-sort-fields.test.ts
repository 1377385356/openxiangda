import assert from 'node:assert/strict';
import test from 'node:test';
import { systemSortFieldOptions } from '../src/browser/components/resource/GeneratedResourceCrud.js';

test('standard list sort options always include the built-in audit time columns', () => {
  assert.deepEqual(systemSortFieldOptions(), [
    { key: 'created_at', label: '创建时间' },
    { key: 'updated_at', label: '更新时间' },
  ]);
  assert.deepEqual(systemSortFieldOptions('title'), [
    { key: 'created_at', label: '创建时间' },
    { key: 'updated_at', label: '更新时间' },
  ]);
});

test('a platform system defaultSort field joins the sort options with a label', () => {
  const options = systemSortFieldOptions('revision');
  assert.deepEqual(options, [
    { key: 'revision', label: '数据版本' },
    { key: 'created_at', label: '创建时间' },
    { key: 'updated_at', label: '更新时间' },
  ]);
});
