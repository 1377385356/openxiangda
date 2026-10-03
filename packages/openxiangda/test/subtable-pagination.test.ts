import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import type { DataFieldSurface } from 'openxiangda-contracts/browser';
import type { SubtableDraftRow } from '../src/browser/components/platform-fields/subtable-value';
import { moveSubtableRow, subtablePage, SubtableRowValidationError, validateSubtableRows } from '../src/browser/components/platform-fields/subtable-pagination';
import { validateSurfaceFieldValues } from '../src/browser/components/platform-fields/surface-field-validation';

const field = (key: string, options: Partial<DataFieldSurface> = {}) => ({ key, label: key, type: 'text.short', widget: 'text', requiredHint: true, ...options } as DataFieldSurface & { key: string });
const rows = (): SubtableDraftRow[] => Array.from({ length: 50 }, (_, index) => ({
  key: `r${index}`, id: `r${index}`, revision: index + 1, originalOrder: index, state: 'persisted', data: { name: `row ${index}`, quantity: 0, approved: false }, originalData: { name: `row ${index}` },
}));

test('paging bounds mounted rows while preserving complete row identities, edits and delete intents', () => {
  const value = rows();
  value[49]!.data.name = 'last edit';
  value.unshift({ key: 'deleted', state: 'deleted', id: 'deleted', revision: 8, data: {} });
  const first = subtablePage(value, 1), last = subtablePage(value, 99);
  assert.equal(first.rows.length, 10);
  assert.equal(last.page, 5);
  assert.equal(last.start, 40);
  assert.equal(last.rows[9], value[50]);
  assert.equal(last.rows[9]!.data.name, 'last edit');
  assert.equal(value.length, 51);
  assert.equal(value[0]!.state, 'deleted');
  assert.equal(subtablePage(value.slice(0, 11), 5).page, 1);
});

test('reordering across a page boundary preserves row revisions and deleted intents', () => {
  const value = rows();
  const deleted: SubtableDraftRow = { key: 'removed', state: 'deleted', revision: 4, data: {} };
  value.push(deleted);
  const next = moveSubtableRow(value, 9, 1);
  assert.equal(next[10], value[9]);
  assert.equal(subtablePage(next, 2).rows[0]!.revision, 10);
  assert.equal(next[9], value[10]);
  assert.equal(next[50], deleted);
  assert.equal(value[9]!.key, 'r9');
});

test('unmounted final required field rejects with absolute position; zero and false remain valid', async () => {
  const value = rows();
  const fields = [field('name'), field('quantity', { type: 'number.integer', widget: 'number', min: 0, max: 1000 }), field('approved', { type: 'boolean', widget: 'switch' })];
  await validateSubtableRows(value, () => fields, true);
  value[49]!.data.name = '';
  await assert.rejects(validateSubtableRows(value, () => fields), error => error instanceof SubtableRowValidationError && error.rowIndex === 49 && error.fieldCode === 'name');
  value[49]!.state = 'deleted';
  await validateSubtableRows(value, () => fields);
  value[48]!.data.name = '';
  await validateSubtableRows(value, row => row.key === 'r48' ? [] : fields);
});

test('off-page numeric and date range rules are shared with controls', async () => {
  const value = rows();
  const quantity = field('quantity', { type: 'number.integer', widget: 'number', min: 0, max: 1000 });
  value[49]!.data.quantity = 1001;
  await assert.rejects(validateSubtableRows(value, () => [quantity], true), /第 50 项/);
  const date = field('period', { type: 'date-range', widget: 'date-range', rangeBoundary: 'closed' });
  value[49]!.data.period = [dayjs('2026-10-03'), dayjs('2026-10-01')];
  await assert.rejects(validateSubtableRows(value, row => row.key === 'r49' ? [date] : []));
  await assert.rejects(validateSurfaceFieldValues([date], value[49]!.data));
});

test('task save can keep incomplete fields; readonly fields add no write obligation', async () => {
  const value = rows();
  value[49]!.data.name = '';
  await validateSubtableRows(value, () => [field('name', { requiredHint: false }), field('private', { widget: 'readonly' })]);
  await assert.rejects(validateSurfaceFieldValues([field('email', { widget: 'email' })], { email: 'invalid-address' }));
});
