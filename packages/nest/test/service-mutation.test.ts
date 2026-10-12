import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { OpenXiangdaApplicationDataApiService, OpenXiangdaPlatformClient, OpenXiangdaEventContext } from '../src/index.js';
const transaction:any={schemaVersion:'openxiangda.data-transaction/v2',idempotencyKey:'original',operations:[]};
const request:any={openxiangda:{principal:{principalType:'service'},authorization:'Bearer signed-invocation',operation:{code:'callback',requiredCapability:'app:demo:callback',platformAccess:{dataMutations:[{resourceCode:'plans',operations:['update'],fieldCodes:['status'],maxOperations:50}]}}}};
test('machine transaction forwards verified invocation separately from runtime authorization; rejects user and missing declaration',async()=>{
  const calls:any[]=[];
  const eventContext=new OpenXiangdaEventContext();
  const options:any={appCode:'demo',platformBaseUrl:'https://platform.test',environmentKey:'preproduction',fetch:async(url:any,init:any)=>{
    calls.push({url,init});return new Response(JSON.stringify({code:200,data:{replayed:false,items:[]}}),{status:200,headers:{'content-type':'application/json'}});
  }};
  const platform=new OpenXiangdaPlatformClient(options,eventContext);
  const credentials:any={withAuthorization:(work:any)=>work('Bearer runtime')};
  const data=new OpenXiangdaApplicationDataApiService(platform,credentials,eventContext);
  await data.transactionFromServiceAction(request,transaction);
  const headers=new Headers(calls[0].init.headers);
  assert.equal(headers.get('Authorization'),'Bearer runtime');
  assert.equal(headers.get('X-OpenXiangda-Service-Invocation'),'Bearer signed-invocation');
  assert.equal(headers.get('X-OpenXiangda-Service-Operation'),'callback');
  assert.equal(headers.get('X-OpenXiangda-Business-Action-Code'),null);
  const user=structuredClone(request);user.openxiangda.principal.principalType='user';
  await assert.rejects(data.transactionFromServiceAction(user,transaction),/SOURCE_REQUIRED/);
  const undeclared=structuredClone(request);delete undeclared.openxiangda.operation.platformAccess.dataMutations;
  await assert.rejects(data.transactionFromServiceAction(undeclared,transaction),/SOURCE_REQUIRED/);
  assert.equal(calls.length,1);
});

test('Worker action scope uses the real lease state and clears without a fabricated HTTP request',async()=>{
  const calls:any[]=[];const platform:any={transactData:async(...args:any[])=>{calls.push(args);return {items:[]};}};
  const credentials:any={withAuthorization:(fn:any)=>fn('Bearer runtime')};const lease:any={assertActive:()=>{},state:()=>({active:true,holderId:'pod-1',leaseToken:'lease-uuid'})};
  const data=new OpenXiangdaApplicationDataApiService(platform,credentials,new OpenXiangdaEventContext(),lease);
  await data.withWorkerAction('callback',()=>data.transaction(transaction));
  assert.deepEqual(calls[0][5],{operationCode:'callback',holderId:'pod-1',leaseToken:'lease-uuid'});
  await data.transaction(transaction);assert.equal(calls[1][5],undefined);
  const noLease=new OpenXiangdaApplicationDataApiService(platform,credentials);
  await assert.rejects(noLease.withWorkerAction('callback',async()=>{}),/WORKER_LEASE_REQUIRED/);
});
