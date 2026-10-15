import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSIONS, validateDataTransactionRequest } from '../src/index.js';
const ref = { operationIndex: 0, field: 'id' };
const snapshot = { resourceCode: 'parents', label: 'Parent', value: ref };
function validate(value: unknown, first: Record<string, unknown> = { operation: 'create', resourceCode: 'parents', data: { name: 'Parent' } }) {
 return validateDataTransactionRequest({ schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest, idempotencyKey: 'snapshot-parent-and-child',
  operations: [first, { operation: 'create', resourceCode: 'children', data: { parent: value } }] });
}
test('resource snapshot value can reference a preceding create while retaining resource and label', () => {
 assert.deepEqual(validate(snapshot), []);
 assert.deepEqual(validate({ ...snapshot, description: 'literal', color: 'blue', snapshot: { name: 'Parent' } }), []);
 assert.deepEqual(validate(ref), []);
 assert.deepEqual(validate({ resourceCode: 'parents', label: 'Existing', value: '00000000-0000-4000-8000-000000000001' }), []);
});
test('only the declared resource snapshot value position accepts a transaction reference', () => {
 for(const value of [
  { value: ref, label: 'missing resource' }, { resourceCode:'parents', value:ref },
  { ...snapshot, extra:true }, { ...snapshot, resourceCode:'other' }, { ...snapshot, resourceCode:'Invalid Resource' },
  { ...snapshot, snapshot:{ hidden:ref } }, { payload:snapshot }, [snapshot],
 ]) assert.ok(validate(value).length, JSON.stringify(value));
});
test('snapshot references retain preceding-create-only closed reference validation', () => {
 for(const value of [
  {operationIndex:1,field:'id'}, {operationIndex:-1,field:'id'}, {operationIndex:0.5,field:'id'},
  {operationIndex:'0',field:'id'}, {operationIndex:0,field:'revision'}, {...ref, path:'nested'},
 ]) assert.ok(validate({...snapshot,value}).some(d=>d.code==='DATA_TRANSACTION_OPERATION_REFERENCE_INVALID'));
 assert.ok(validate(snapshot,{operation:'update',resourceCode:'parents',id:'00000000-0000-4000-8000-000000000001',expectedRevision:1,data:{name:'Parent'}}).length);
});
