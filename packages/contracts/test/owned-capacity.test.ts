import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applyWorkflowTaskPageValues, applyWorkflowTaskSubtableRows, validateWorkflowTaskPages, workflowTaskSubtableRows, type WorkflowTaskPageField } from '../src/native-compiler/workflow-task-page.js';
import { validateDataTransactionRequest } from '../src/validation.js';
import { validateNativeDataResourceReferencesV2 } from '../src/native-compiler/data-field.js';
import { SCHEMA_VERSIONS } from '../src/types.js';
import { DATA_TRANSACTION_MAX_OPERATIONS, requiresExtendedOwnedSubtableCapacity, dataOwnedRowLimit, requiresAggregateOwnedSubtableCapacity } from '../src/native-compiler/data-capacity.js';

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
  assert.match(validateWorkflowTaskPages({ taskPages: { fill: overflow.page } }, overflow.resources, undefined, 500).join(','), /BUDGET/);
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

test('aggregate capacity requires a declared model budget and never expands a single table', () => {
  const f = fixture(2, 500);
  assert.throws(() => validateNativeDataResourceReferencesV2(f.declarations, '/resources'), /AGGREGATE_MAX_ROWS/);
  const declarations = f.declarations.map((resource, index) => index ? resource : { ...resource, schema: { ...resource.schema, ownedRowLimit: 1000 } });
  assert.doesNotThrow(() => validateNativeDataResourceReferencesV2(declarations, '/resources'));
  assert.deepEqual(validateWorkflowTaskPages({ taskPages: { fill: f.page } }, f.resources, undefined, 1000), []);
  assert.match(validateWorkflowTaskPages({ taskPages: { fill: f.page } }, f.resources, undefined, 999).join(','), /BUDGET/);
  assert.equal(requiresAggregateOwnedSubtableCapacity(declarations), true);
  assert.equal(requiresAggregateOwnedSubtableCapacity(f.declarations), false);
  assert.equal(dataOwnedRowLimit({}), 500);
  for (const value of [0, -1, 1001, 500.5, '1000', NaN, Infinity]) {
    const invalid = declarations.map((resource, index) => index ? resource : { ...resource, schema: { ...resource.schema, ownedRowLimit: value } });
    assert.throws(() => validateNativeDataResourceReferencesV2(invalid, '/resources'), /OWNED_ROW_LIMIT_INVALID/);
  }
  const one = fixture(1, 501);
  assert.throws(() => validateNativeDataResourceReferencesV2(one.declarations.map(resource => ({ ...resource, schema: { ...resource.schema, ownedRowLimit: 1000 } })), '/resources'));
  const mixed = fixture(2, 500);
  mixed.declarations[0]!.schema.fields[1]!.subtable!.maxRows = 50;
  assert.doesNotThrow(() => validateNativeDataResourceReferencesV2(mixed.declarations.map((resource, index) => index ? resource : { ...resource, schema: { ...resource.schema, ownedRowLimit: 550 } }), '/resources'));
});

test('two full 500-row replacements preserve the last table and both last-row revisions', () => {
  const fields = [field, { ...field, code: 'second' }];
  const old = fields.map(() => Array.from({ length: 500 }, row));
  const intents = fields.map((f, index) => [...workflowTaskSubtableRows(f.subtable!, old[index]!).map(value => ({ ...value, state: 'deleted', values: {} })), ...Array.from({ length: 500 }, create)]);
  for (let index = 0; index < 2; index++) assert.equal(applyWorkflowTaskSubtableRows(fields[index]!, 500, old[index]!, intents[index], true).length, 1000);
  const request = { schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest, idempotencyKey: 'two-table-replacement', operations: [
    { operation: 'update', resourceCode: 'requests', id: randomUUID(), expectedRevision: 1, data: { title: 'replacement' } },
    ...old.flatMap((rows, table) => rows.map(record => ({ operation: 'delete', resourceCode: `items${table}`, id: record.id, expectedRevision: record.revision }))),
    ...Array.from({ length: 1000 }, (_, index) => ({ operation: 'create', resourceCode: `items${Math.floor(index / 500)}`, data: { name: 'replacement' } })),
  ] };
  assert.equal(request.operations.length, 2001);
  assert.deepEqual(validateDataTransactionRequest(request), []);
  assert.throws(() => applyWorkflowTaskSubtableRows(fields[1]!, 500, old[1]!, intents[1]!.map((value, index) => index === 499 ? { ...value, revision: 1 } : value), true), /REVISION_CONFLICT/);
  assert.ok(validateDataTransactionRequest({ ...request, operations: request.operations.map((op, index) => index === 2000 ? { ...op, data: { name: 'x'.repeat(2 * 1024 * 1024) } } : op) }).some(diagnostic => diagnostic.code === 'DATA_TRANSACTION_TOO_LARGE'));
});
