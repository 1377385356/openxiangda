import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeDataMutationGrants } from '../src/native-compiler/service-mutations.js';
const grant = {resourceCode:'plans',operations:['update'],fieldCodes:['date','status'],maxOperations:50};
test('normalizes exact field and count grants; rejects unbounded or duplicate declarations',()=>{
  assert.deepEqual(normalizeDataMutationGrants([grant],new Map([['plans',new Set(['date','status'])]])),[grant]);
  for (const value of [[],[{...grant,fieldCodes:['*']}],[{...grant,maxOperations:1001}],[grant,grant],
    [{...grant,operations:['update','update']}],[{...grant,fieldCodes:['status','status']}],[{...grant,maxOperations:0}],
    [{...grant,unexpected:true}]]) assert.throws(()=>normalizeDataMutationGrants(value));
  assert.throws(()=>normalizeDataMutationGrants([grant],new Map([['plans',new Set(['status'])]])));
});
