
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { assertDataTransactionRequest, databaseAcceptedTime, isDataTransactionAcceptedTimeValue, ContractValidationError } from '../src/index.js';
import * as native from '../dist/native-compiler/index.js';
const cjs=createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof native;
test('database time values are bounded closed literals with equal ESM/CJS construction',()=>{
  for(const offset of [0,1800000,31622400000,-31622400000]){
    assert.deepEqual(databaseAcceptedTime(offset),{kind:'database-accepted-time',offsetMilliseconds:offset});
    assert.deepEqual(cjs.databaseAcceptedTime(offset),native.databaseAcceptedTime(offset));
  }
  for(const offset of [31622400001,-31622400001,1.5,'0',null]){
    assert.throws(()=>databaseAcceptedTime(offset as number));
  }
  for(const input of [{kind:'database-accepted-time'}, {...databaseAcceptedTime(),evaluatedAt:'caller'},
    {...databaseAcceptedTime(),sql:'now()'}, {kind:'database-accepted-time',offsetMilliseconds:Infinity}])
    assert.equal(isDataTransactionAcceptedTimeValue(input),false);
});
test('record-set common assertions stay within one guard and closed field/time shapes',()=>{
  const guard:any={kind:'record-set-match',resourceCode:'windows',errorCode:'OPENXIANGDA_COOLDOWN',
    records:[{id:'00000000-0000-4000-8000-000000000001',expectedRevision:1}],
    assertions:[{kind:'database-now',field:'nextAllowedAt',operator:'lte'},{kind:'value',field:'enabled',operator:'eq',value:true},{kind:'field',leftField:'a',rightField:'b',operator:'eq'}]};
  const request=()=>({schemaVersion:'openxiangda.data-transaction-request/v2',idempotencyKey:'same-command',
    guards:[guard],operations:[{operation:'create',resourceCode:'requests',data:{requestedAt:databaseAcceptedTime()}}]});
  assert.doesNotThrow(()=>assertDataTransactionRequest(request()));
  for(const assertions of [[],Array.from({length:21},()=>({kind:'database-now',field:'at',operator:'lte'})),
    [{kind:'actor-authority',userId:'other'}],[{kind:'database-now',field:'at',operator:'sql'}],
    [{kind:'database-now',field:'at',operator:'lte',value:'caller'}],
    [{kind:'field',leftField:'a',rightField:'b',operator:'eq',sql:'true'}],
    [{kind:'value',field:'enabled',operator:'eq'}]]){
    guard.assertions=assertions;assert.throws(()=>assertDataTransactionRequest(request()),ContractValidationError);
  }
});
