import assert from 'node:assert/strict';
import test from 'node:test';
import type {CommandReceipt} from 'openxiangda-contracts/browser';
import {DurableCommandController} from '../src/browser/durable-command.js';
import type {ManagedConcurrencyClient} from '../src/browser/managed-command.js';
const missing=()=>Object.assign(new Error('missing'),{code:'CONCURRENCY_COMMAND_NOT_FOUND',status:404});
const store=()=>{const m=new Map<string,string>();return{getItem:(k:string)=>m.get(k)||null,setItem:(k:string,v:string)=>{m.set(k,v);},removeItem:(k:string)=>{m.delete(k);}};};
const receipt=(key='original',state:CommandReceipt['state']='succeeded'):CommandReceipt=>({operationId:'operation',command:'claim',resourceKey:'offer',requestKey:key,state,acceptedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),retryAfterMs:6000});
function fixture(overrides:Partial<ManagedConcurrencyClient>={},storage=store()){
  const client={scope:'app/env/user',mine:async()=>({items:[]}),result:async()=>{throw missing();},enqueue:async(_c:string,_i:unknown,key:string)=>receipt(key),...overrides} as ManagedConcurrencyClient;
  return {client,storage,controller:new DurableCommandController({client,command:'claim',resourceKey:'offer',storage,random:()=>0})};
}
test('fresh mount is read-only and cross-device restoration never submits',async()=>{
  let writes=0;const f=fixture({mine:async()=>({items:[receipt()]}),enqueue:async()=>{writes++;return receipt();}});
  await f.controller.refresh();assert.equal(writes,0);assert.equal(f.controller.snapshot().state,'succeeded');assert.equal(f.controller.snapshot().isObserving,false);
});
test('unknown acknowledgement retains original key and input; a new mount cannot enqueue it',async()=>{
  const keys:string[]=[];let found=false;
  const f=fixture({enqueue:async(_c,_i,key)=>{keys.push(key);throw new TypeError('network');},result:async()=>{if(found)return receipt(keys[0]);throw missing();}});
  await assert.rejects(()=>f.controller.submit({id:'offer',agreed:true}));
  const fresh=fixture({enqueue:f.client.enqueue,result:f.client.result},f.storage);
  await fresh.controller.refresh();assert.equal(keys.length,1);assert.equal(fresh.controller.snapshot().state,'recovering');
  await assert.rejects(()=>fresh.controller.submit({id:'different'}),/ORIGINAL_REQUEST/);assert.equal(keys.length,1);
  found=true;await fresh.controller.submit({id:'offer',agreed:true});assert.equal(keys.length,1);assert.equal(fresh.controller.snapshot().requestKey,keys[0]);
});
test('known terminal is historical; explicit new submit uses new key for reapplication',async()=>{
  const keys:string[]=[];const f=fixture({enqueue:async(_c,_i,key)=>{keys.push(key);return receipt(key);}});
  await f.controller.submit({id:'offer'});await f.controller.submit({id:'offer'});assert.equal(keys.length,2);assert.notEqual(keys[0],keys[1]);
});
test('duplicate click is serialized; stop cannot cancel or overwrite newer observation',async()=>{
  let resolve!:(r:CommandReceipt)=>void,writes=0,cancels=0;
  const f=fixture({enqueue:async()=>{writes++;return new Promise(r=>resolve=r);},cancel:async()=>{cancels++;return receipt();}});
  const first=f.controller.submit({id:'offer'}),second=f.controller.submit({id:'offer'});assert.equal(first,second);assert.equal(writes,1);
  f.controller.stop();resolve(receipt(f.controller.snapshot().requestKey,'accepted'));await first;assert.equal(cancels,0);assert.notEqual(f.controller.snapshot().state,'accepted');
});
test('server polling delay is respected and terminal response ends observation',async()=>{
  const delays:number[]=[];let polls=0;
  const f=fixture({mine:async()=>({items:[receipt('original','accepted')]}),result:async()=>{polls++;return receipt();}});
  const controller=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,sleep:async(ms)=>{delays.push(ms);},random:()=>0});
  await controller.refresh();while(controller.snapshot().isObserving)await Promise.resolve();assert.deepEqual(delays,[6000]);assert.equal(polls,1);assert.equal(controller.snapshot().state,'succeeded');
});
test('foreign resource receipts never enter recovery state',async()=>{
  const f=fixture({mine:async()=>({items:[{...receipt(),resourceKey:'other'}]})});await f.controller.refresh();assert.equal(f.controller.snapshot().state,'error');assert.equal(f.controller.snapshot().receipt,undefined);
});


test('explicit resume retries frozen input with original key after a request never reached acceptance',async()=>{
  const keys:string[]=[];const inputs:unknown[]=[];let fail=true;
  const f=fixture({enqueue:async(_c,input,key)=>{keys.push(key);inputs.push(input);if(fail)throw new TypeError('offline');return receipt(key);}});
  await assert.rejects(()=>f.controller.submit({id:'original-channel',phone:'123'}));
  const fresh=fixture({enqueue:f.client.enqueue},f.storage);await fresh.controller.refresh();fail=false;
  await fresh.controller.resume();assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.deepEqual(inputs[0],inputs[1]);assert.equal(fresh.controller.snapshot().input?.id,'original-channel');
});
