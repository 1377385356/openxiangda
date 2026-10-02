import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import { rebaseWorkflowTaskSubtable, workflowTaskSubtableDataRows, workflowTaskSubtableFormRows } from '../src/browser/components/workflow/workflow-task-subtable';

const id = '00000000-0000-4000-8000-000000000001';
const extra = '00000000-0000-4000-8000-000000000002';
const source: any = { page: { fields: [{ code: 'items', subtable: { create: true, delete: true, fields: [{ code: 'name' }, { code: 'quantity' }, { code: 'date' }, { code: 'needsReason' }, { code: 'reason', visibleWhen: { op: 'path', path: 'values.needsReason' } }, { code: 'locked', readonly: true }] } }] },
  values: { items: [{ key: id, id, revision: 2, state: 'persisted', values: { name: '原事项', quantity: 1, date: '2026-10-02', needsReason: false } }] },
  subtables: { items: { fields: { name: { type: 'text.short' }, quantity: { type: 'number.integer' }, date: { type: 'date' }, needsReason: { type: 'boolean' }, reason: { type: 'text.long' }, locked: { type: 'text.short' } }, rows: [{ id, revision: 2, locked: '只读' }] } } };

test('task subtable uses native codecs and omits readonly and currently hidden fields', () => {
  const rows = workflowTaskSubtableFormRows(source, 'items', source.values.items);
  assert.equal(dayjs.isDayjs(rows[0]!.data.date), true);
  rows[0]!.data.quantity = 0; rows[0]!.data.locked = '篡改'; rows[0]!.data.reason = '隐藏输入';
  const result = workflowTaskSubtableDataRows(source, 'items', rows);
  assert.deepEqual(result[0]!.values, { name: '原事项', quantity: 0, date: '2026-10-02', needsReason: false });
  assert.equal(rows[0]!.snapshot?.locked, '只读');
});

test('explicit keep preserves actor edits and other people changes with fresh row versions', () => {
  const latest = { ...source, values: { items: [{ ...source.values.items[0], revision: 3, values: { ...source.values.items[0].values, name: '别人改名称' } }, { key: extra, id: extra, revision: 1, state: 'persisted', values: { name: '别人新增' } }] } };
  const current = [{ ...source.values.items[0], values: { ...source.values.items[0].values, quantity: 0 } }];
  const result = rebaseWorkflowTaskSubtable(source, latest, 'items', current);
  assert.equal(result[0]!.revision, 3);
  assert.equal(result[0]!.values.name, '别人改名称'); assert.equal(result[0]!.values.quantity, 0);
  assert.equal(result[1]!.id, extra);
  assert.equal(current[0]!.revision, 2);
});

test('a concurrently deleted edited row blocks keep without losing its input or reviving it', () => {
  const latest = { ...source, values: { items: [] } };
  const current = [{ ...source.values.items[0], values: { ...source.values.items[0].values, name: '我的输入' } }];
  assert.throws(() => rebaseWorkflowTaskSubtable(source, latest, 'items', current), /已被其他人删除/);
  assert.equal(current[0]!.values.name, '我的输入');
  assert.deepEqual(rebaseWorkflowTaskSubtable(source, latest, 'items', source.values.items), []);
});

test('deleted row intent carries identity CAS and no fabricated data', () => {
  const rows = workflowTaskSubtableFormRows(source, 'items', source.values.items);
  rows[0]!.state = 'deleted';
  assert.deepEqual(workflowTaskSubtableDataRows(source, 'items', rows), [{ key: id, id, revision: 2, state: 'deleted', values: {} }]);
});
