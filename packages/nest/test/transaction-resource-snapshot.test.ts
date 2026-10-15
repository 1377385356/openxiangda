import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataTransactionOperationReference, ResourceReferenceValue } from 'openxiangda-contracts';
import { SCHEMA_VERSIONS, validateDataTransactionRequest } from 'openxiangda-contracts';
import { resourceSnapshot } from '../src/snapshot-values.js';
test('resourceSnapshot preserves string-id typing and constructs the public transaction resource snapshot', () => {
 const existing: ResourceReferenceValue = resourceSnapshot('parents', '00000000-0000-4000-8000-000000000001', 'Parent');
 assert.equal(typeof existing.value, 'string');
 const reference: DataTransactionOperationReference = { operationIndex: 0, field: 'id' };
 const generated = resourceSnapshot('parents', reference, 'Parent');
 const typedReference: DataTransactionOperationReference = generated.value;
 assert.deepEqual(typedReference, reference);
 assert.deepEqual(generated, {resourceCode:'parents',label:'Parent',value:reference});
 assert.deepEqual(validateDataTransactionRequest({schemaVersion:SCHEMA_VERSIONS.dataTransactionRequest,idempotencyKey:'parent-and-child',operations:[
  {operation:'create',resourceCode:'parents',data:{name:'Parent'}},
  {operation:'create',resourceCode:'children',data:{parent:generated}},
 ]}),[]);
});
