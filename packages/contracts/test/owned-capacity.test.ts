import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applyWorkflowTaskPageValues, applyWorkflowTaskSubtableRows, validateWorkflowTaskPages, workflowTaskSubtableRows, type WorkflowTaskPageField } from '../src/native-compiler/workflow-task-page.js';
import { validateDataTransactionRequest } from '../src/validation.js';
import { validateNativeDataResourceReferencesV2 } from '../src/native-compiler/data-field.js';
import { SCHEMA_VERSIONS } from '../src/types.js';
import { DATA_TRANSACTION_MAX_OPERATIONS, requiresExtendedOwnedSubtableCapacity } from '../src/native-compiler/data-capacity.js';

const field: WorkflowTaskPageField = { code: 'items', subtable: { create: true, delete: true, reorder: true, fields: [{ code: 'name', required: true }, { code: 'score', required: true }] } };
const row = () => ({ id: randomUUID(), revision: 3, name: 'A'.repeat(100), score: 0 });
const create = () => ({ key: randomUUID(), state: 'created', values: { name: 'new', score: 0 } });

test('a full 50-row replacement retains every deleted identity and every new row', () => {
  const old = Array.from({ length: 50 }, row);
  const intents = [...workflowTaskSubtableRows(field.subtable!, old).map(value => ({ ...value, state: 'deleted', values: {} })), ...Array.from({ length: 50 }, create)];
  assert.equal(applyWorkflowTaskSubtableRows(field, 50, old, intents, true).length, 100);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 50, old, intents.slice(1), true), /SCOPE_CONFLICT/);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 50, old, [...intents, create()], true), /VALUES_INVALID/);
  const initial = Array.from({ length: 100 }, create);
  assert.equal(applyWorkflowTaskSubtableRows(field, 100, [], initial, true).length, 100);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 100, [], [...initial, create()], true), /MAX_ROWS_EXCEEDED/);
});

function fixture(tableCount: number, count: number) {
  const fields = Array.from({ length: tableCount }, (_, index) => ({ ...field, code: `items${index}` }));
  const resources = new Map(fields.map(f => [f.code, { type: 'subtable', subtable: { resourceCode: f.code, foreignKey: 'parentId', orderField: 'position', maxRows: count } }]));
  const page = { title: 'Capacity', fields };
  const declarations = [{ code: 'requests', schema: { fields: fields.map(f => ({ code: f.code, ...resources.get(f.code)! })) } }, ...fields.map(f => ({ code: f.code, schema: { fields: [{ code: 'parentId', type: 'uuid', nullable: false }, { code: 'position', type: 'number.integer', nullable: false }, { code: 'name', type: 'text.short' }] } }))];
  return { page, resources, declarations };
}

test('seven 50-row tables compile and carry more than 64KiB without truncation', () => {
  const f = fixture(7, 50);
  assert.deepEqual(validateWorkflowTaskPages({ taskPages: { fill: f.page } }, f.resources), []);
  assert.doesNotThrow(() => validateNativeDataResourceReferencesV2(f.declarations, '/resources'));
  const values = Object.fromEntries(f.page.fields.map(f => [f.code, workflowTaskSubtableRows(f.subtable!, Array.from({ length: 50 }, row))]));
  assert.ok(Buffer.byteLength(JSON.stringify(values)) > 65_536);
  assert.deepEqual(applyWorkflowTaskPageValues(f.page, {}, values, true), values);
  const boundary = fixture(5, 100);
  assert.deepEqual(validateWorkflowTaskPages({ taskPages: { fill: boundary.page } }, boundary.resources), []);
  assert.doesNotThrow(() => validateNativeDataResourceReferencesV2(boundary.declarations, '/resources'));
  const overflow = fixture(2, 251);
  assert.match(validateWorkflowTaskPages({ taskPages: { fill: overflow.page } }, overflow.resources).join(','), /BUDGET/);
  assert.throws(() => validateNativeDataResourceReferencesV2(overflow.declarations, '/resources'), /AGGREGATE_MAX_ROWS/);
  const singleOverflow = fixture(1, 501);
  assert.throws(() => validateNativeDataResourceReferencesV2(singleOverflow.declarations, '/resources'));
});

test('atomic transaction accepts 1001 full-replacement operations but rejects count or byte overflow', () => {
  const operation = { operation: 'create', resourceCode: 'items', data: { name: 'item' } };
  const request = { schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest, idempotencyKey: 'bounded-capacity', operations: Array.from({ length: DATA_TRANSACTION_MAX_OPERATIONS }, () => operation) };
  assert.deepEqual(validateDataTransactionRequest({ ...request, operations: request.operations.slice(0, 701) }), []);
  assert.deepEqual(validateDataTransactionRequest({ ...request, operations: request.operations.slice(0, 1001) }), []);
  assert.deepEqual(validateDataTransactionRequest(request), []);
  assert.ok(validateDataTransactionRequest({ ...request, operations: [...request.operations, operation] }).some(error => error.code === 'DATA_TRANSACTION_OPERATIONS_INVALID'));
  assert.ok(validateDataTransactionRequest({ ...request, operations: [{ ...operation, data: { name: 'x'.repeat(2 * 1024 * 1024) } }] }).some(error => error.code === 'DATA_TRANSACTION_TOO_LARGE'));
});

test('500 rows and full replacement keep final-row CAS, omission and row limits', () => {
  const old = Array.from({ length: 500 }, row);
  const persisted = workflowTaskSubtableRows(field.subtable!, old);
  const replacements = [...persisted.map(value => ({ ...value, state: 'deleted', values: {} })), ...Array.from({ length: 500 }, create)];
  const f = fixture(1, 500);
  assert.deepEqual(validateWorkflowTaskPages({ taskPages: { fill: f.page } }, f.resources), []);
  assert.doesNotThrow(() => validateNativeDataResourceReferencesV2(f.declarations, '/resources'));
  assert.equal(applyWorkflowTaskSubtableRows(field, 500, old, replacements, true).length, 1000);
  assert.equal(applyWorkflowTaskSubtableRows(field, 500, [], Array.from({ length: 500 }, create), true).length, 500);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 500, [], Array.from({ length: 501 }, create), true), /MAX_ROWS_EXCEEDED/);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 500, old, persisted.slice(0, 499), true), /SCOPE_CONFLICT/);
  assert.throws(() => applyWorkflowTaskSubtableRows(field, 500, old, persisted.map((value, index) => index === 499 ? { ...value, revision: 2 } : value), true), /REVISION_CONFLICT/);
});

test('only declarations beyond original single and aggregate bounds require the new capability', () => {
  for (const [tables, count, required] of [[7, 50, false], [4, 100, false], [5, 100, true], [1, 101, true], [1, 500, true]] as const) {
    assert.equal(requiresExtendedOwnedSubtableCapacity(fixture(tables, count).declarations), required);
  }
});
