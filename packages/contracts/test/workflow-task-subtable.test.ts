import assert from 'node:assert/strict';
import test from 'node:test';
import { applyWorkflowTaskPageValues, applyWorkflowTaskSubtableRows, validateWorkflowTaskPages, workflowTaskSubtableRows, type WorkflowTaskPageField } from '../src/native-compiler/workflow-task-page.js';

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const added = '00000000-0000-4000-8000-000000000003';
const field: WorkflowTaskPageField = { code: 'items', required: true, subtable: { create: true, delete: true, reorder: true, fields: [{ code: 'name', required: true }, { code: 'quantity', required: true }, { code: 'internal', readonly: true }] } };
const current = [{ id: first, revision: 2, name: '原明细', quantity: 1, internal: '只读' }, { id: second, revision: 3, name: '第二项', quantity: 0, internal: '只读' }];
const intents = () => workflowTaskSubtableRows(field.subtable!, current);

test('owned subtable requires code whitelist and authoritative one-level relationship', () => {
  const definition = { taskPages: { fill: { title: '办理', fields: [field] } } };
  const root = new Map([['items', { type: 'subtable', subtable: { resourceCode: 'items', foreignKey: 'parentId', orderField: 'position', maxRows: 20 } }]]);
  const child = new Map([['parentId', { type: 'resource-ref.single' }], ['position', { type: 'number.integer' }], ['name', { type: 'text.short' }], ['quantity', { type: 'number.integer' }], ['internal', { type: 'text.short' }]]);
  assert.deepEqual(validateWorkflowTaskPages(definition, root, new Map([['items', child]])), []);
  for (const type of ['file', 'image', 'signature', 'text.rich']) assert.deepEqual(validateWorkflowTaskPages(definition, root, new Map([['items', new Map([...child, ['name', { type }]])]])), []);
  for (const type of ['subtable', 'serial-number']) assert.match(validateWorkflowTaskPages(definition, root, new Map([['items', new Map([...child, ['name', { type }]])]])).join(','), /UNSUPPORTED/);
  for (const fields of [null, {}, [null], [{ code: 'name', subtable: { fields: [] } }]]) assert.ok(validateWorkflowTaskPages({ taskPages: { fill: { title: '办理', fields: [{ ...field, subtable: { fields } as any }] } } }, root).length);
  assert.match(validateWorkflowTaskPages(definition, new Map([['items', { ...root.get('items')!, subtable: { ...root.get('items')!.subtable, maxRows: 501 } }]]), new Map([['items', child]])).join(','), /RELATION/);
  assert.match(validateWorkflowTaskPages(definition, root, new Map()).join(','), /RELATION/);
});

test('row intent supports explicit create edit delete and order without caller relationship keys', () => {
  const input = [{ ...intents()[1]!, values: { name: '更新', quantity: 0 } }, { key: added, state: 'created', values: { name: '新项', quantity: 2 } }, { ...intents()[0]!, state: 'deleted', values: {} }];
  assert.deepEqual(applyWorkflowTaskSubtableRows(field, 20, current, input, true), input);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, [{ ...intents()[0]!, values: { parentId: first } }, intents()[1]], true), /NOT_EDITABLE/);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, [{ ...intents()[0]!, values: { internal: '篡改' } }, intents()[1]], true), /NOT_EDITABLE/);
});

test('all observed row identities and revisions are mandatory including unchanged and deleted rows', () => {
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, intents().slice(0, 1), false), /SCOPE_CONFLICT/);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, [...intents(), intents()[0]], false), /ROW_INVALID/);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, [{ ...intents()[0]!, revision: 1 }, intents()[1]], false), /REVISION_CONFLICT/);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, [{ ...intents()[0]!, id: added, key: added }, intents()[1]], false), /SCOPE_CONFLICT/);
  assert.equal(applyWorkflowTaskSubtableRows(field, 20, current, [{ ...intents()[0]!, revision: 1 }, intents()[1]], false, false)[0]!.revision, 1);
});

test('completion requirements and capacity cannot be bypassed by deletion markers', () => {
  const deleted = intents().map(row => ({ ...row, state: 'deleted', values: {} }));
  assert.throws(() => applyWorkflowTaskPageValues({ title: '办理', fields: [field] }, { items: current }, { items: deleted }, true), /REQUIRED/);
  const partial = [{ key: added, state: 'created', values: { quantity: 0 } }];
  assert.equal(applyWorkflowTaskSubtableRows(field, 1, [], partial, false).length, 1);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 1, [], partial, true), /REQUIRED/);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 1, current, intents(), false), /MAX_ROWS/);
});

test('code-disabled create delete and reorder remain disabled with direct API input', () => {
  const limited = { ...field, subtable: { ...field.subtable!, create: false, delete: false, reorder: false } };
  assert.throws(() => applyWorkflowTaskSubtableRows(limited, 20, [], [{ key: added, state: 'created', values: {} }], false), /CREATE_FORBIDDEN/);
  assert.throws(() => applyWorkflowTaskSubtableRows(limited, 20, current, [{ ...intents()[0]!, state: 'deleted', values: {} }, intents()[1]], false), /DELETE_FORBIDDEN/);
  assert.throws(() => applyWorkflowTaskSubtableRows(limited, 20, current, intents().reverse(), false), /REORDER_FORBIDDEN/);
});

test('row payload rejects non-JSON prototype oversized and fabricated fields', () => {
  for (const value of [[{ ...intents()[0], values: { name: 'x'.repeat(1024 * 1024) } }], [{ ...intents()[0], key: '__proto__' }], new Array(50).fill(intents()[0]), [{ ...intents()[0], values: { quantity: Infinity } }]]) assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, value, false), /INVALID/);
});

test('minimum counts final live rows, permits incomplete saves and preserves all observed CAS', () => {
  const deleted = intents().map(row => ({ ...row, state: 'deleted', values: {} }));
  assert.equal(applyWorkflowTaskSubtableRows(field, 20, current, deleted, false, true, 1).length, 2);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, deleted, true, true, 1), /MIN_ROWS_NOT_MET/);
  const replacement = [...deleted, { key: added, state: 'created', values: { name: 'replacement', quantity: 0 } }];
  assert.equal(applyWorkflowTaskSubtableRows(field, 20, current, replacement, true, true, 1).length, 3);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, replacement, true, true, 2), /MIN_ROWS_NOT_MET/);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, replacement.slice(1), false, true, 1), /SCOPE_CONFLICT/);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 20, current, replacement.map((row, i) => i === 0 ? { ...row, revision: 1 } : row), false, true, 1), /REVISION_CONFLICT/);
  assert.equal(applyWorkflowTaskSubtableRows(field, 20, current, deleted, true).length, 2);
});
