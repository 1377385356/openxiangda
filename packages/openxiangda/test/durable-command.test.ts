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
  return {client,storage,controller:new DurableCommandController({client,command:'claim',resourceKey:'offer',storage,random:()=>0,sleep:async()=>{}})};
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
  await fresh.controller.refresh();assert.equal(keys.length,6);assert.equal(fresh.controller.snapshot().state,'recovering');
  await assert.rejects(()=>fresh.controller.submit({id:'different'}),/ORIGINAL_REQUEST/);assert.equal(keys.length,6);
  found=true;await fresh.controller.submit({id:'offer',agreed:true});assert.equal(keys.length,6);assert.equal(fresh.controller.snapshot().requestKey,keys[0]);
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
  await fresh.controller.resume();assert.equal(keys.length,7);assert.ok(keys.every(k=>k===keys[0]));assert.ok(inputs.every(i=>JSON.stringify(i)===JSON.stringify(inputs[0])));assert.equal(fresh.controller.snapshot().input?.id,'original-channel');
});


test('refresh prioritizes a newer cross-device pending cycle over local historical success',async()=>{
  const storage=store();const first=fixture({},storage);await first.controller.submit({id:'offer'});
  const historical=first.controller.snapshot().receipt!;
  const second=fixture({result:async()=>historical,mine:async()=>({items:[receipt('new-device','accepted'),historical]})},storage);
  await second.controller.refresh();assert.equal(second.controller.snapshot().requestKey,'new-device');assert.equal(second.controller.snapshot().state,'accepted');assert.equal(second.controller.snapshot().input,undefined);second.controller.stop();
});
test('a trusted not-accepted 400 allows corrected input; ambiguous errors never discard original intent',async()=>{
  for(const error of [Object.assign(new Error('invalid'),{status:400,code:'CONCURRENCY_INPUT_INVALID'}),Object.assign(new Error('other'),{status:400,code:'UNRECOGNIZED'}),Object.assign(new Error('conflict'),{status:409,code:'CONCURRENCY_IDEMPOTENCY_CONFLICT'}),new TypeError('offline')]) {
    let fail=true;const keys:string[]=[];const f=fixture({enqueue:async(_c,_i,key)=>{keys.push(key);if(fail)throw error;return receipt(key);}});
    await assert.rejects(()=>f.controller.submit({phone:'invalid'}));fail=false;
    if((error as any).code==='CONCURRENCY_INPUT_INVALID') {await f.controller.submit({phone:'correct'});assert.equal(keys.length,2);assert.notEqual(keys[0],keys[1]);assert.equal(f.controller.snapshot().state,'succeeded');}
    else {const attempts=keys.length;await assert.rejects(()=>f.controller.submit({phone:'correct'}),/ORIGINAL_REQUEST/);assert.equal(keys.length,attempts);await f.controller.resume();assert.equal(keys.length,attempts+1);assert.ok(keys.every(k=>k===keys[0]));}
  }
});


test('temporary intake throttling retries original key with server delay; lost ack resolves without extra enqueue',async()=>{
  const delays:number[]=[],keys:string[]=[];let committed=false;
  const f=fixture({enqueue:async(_c,_i,key)=>{keys.push(key);if(keys.length===1)throw Object.assign(new Error('busy'),{status:429,code:'CONCURRENCY_INTAKE_BUSY',retryAfterMs:12000});committed=true;throw new TypeError('lost ack');},result:async()=>{if(committed)return receipt(keys[0]);throw missing();}});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,sleep:async(ms)=>{delays.push(ms);},random:()=>0});
  await c.submit({id:'offer'});assert.equal(c.snapshot().state,'succeeded');assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.deepEqual(delays,[12000,10000]);
});

test('configured intake recovery continues beyond six attempts and two minutes with the original key',async t=>{
  let now=1000000; t.mock.method(Date,'now',()=>now);
  const keys:string[]=[],delays:number[]=[];
  const f=fixture({enqueue:async(_c,_i,key)=>{keys.push(key);if(keys.length<=8)throw Object.assign(new Error('busy'),{status:429,code:'CONCURRENCY_INTAKE_BUSY',retryAfterMs:30000});return receipt(key);}});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,acceptanceRecoveryMs:1800000,random:()=>0,sleep:async ms=>{delays.push(ms);now+=ms;}});
  await c.submit({id:'offer'});
  assert.equal(c.snapshot().state,'succeeded');assert.equal(keys.length,9);
  assert.equal(new Set(keys).size,1);assert.ok(delays.reduce((a,b)=>a+b,0)>120000);
});

test('original start survives refresh and resume; expiry stops enqueue but a late result remains readable',async t=>{
  let now=2000000,writes=0,found=false; t.mock.method(Date,'now',()=>now);
  const f=fixture({enqueue:async()=>{writes++;throw new TypeError('offline');},result:async()=>{if(found)return receipt(f.controller.snapshot().requestKey);throw missing();}});
  await assert.rejects(()=>f.controller.submit({id:'offer'}));
  const originalKey=f.controller.snapshot().requestKey;
  now+=1800001;
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,acceptanceRecoveryMs:1800000});
  await c.refresh();assert.equal(writes,6);assert.equal(c.snapshot().requestKey,originalKey);
  await assert.rejects(()=>c.resume(),{code:'CONCURRENCY_ACCEPTANCE_UNCONFIRMED'});
  assert.equal(writes,6);assert.equal(c.snapshot().isObserving,false);
  found=true;await c.refresh();assert.equal(c.snapshot().state,'succeeded');assert.equal(writes,6);
});

test('longer server backoff never starts another enqueue beyond the original budget',async t=>{
  let now=3000000,writes=0,sleeps=0; t.mock.method(Date,'now',()=>now);
  const f=fixture({enqueue:async()=>{writes++;throw Object.assign(new Error('busy'),{status:429,retryAfterMs:1800000});}});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,acceptanceRecoveryMs:1800000,sleep:async()=>{sleeps++;}});
  await assert.rejects(()=>c.submit({id:'offer'}),{code:'CONCURRENCY_ACCEPTANCE_UNCONFIRMED'});
  assert.equal(writes,1);assert.equal(sleeps,0);assert.ok(c.snapshot().requestKey);
});

test('a new terminal cycle gets a new start while invalid recovery budgets fail before requests',async t=>{
  let now=4000000,writes=0; t.mock.method(Date,'now',()=>now);
  const f=fixture({enqueue:async(_c,_i,key)=>{writes++;return receipt(key);}});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,acceptanceRecoveryMs:1800000});
  await c.submit({id:'offer'});const first=c.snapshot().requestKey;
  now+=1800001;await c.submit({id:'offer'});
  assert.equal(writes,2);assert.notEqual(c.snapshot().requestKey,first);assert.equal(c.snapshot().state,'succeeded');
  for(const value of [NaN,Infinity,119999,1800001])assert.throws(()=>new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,acceptanceRecoveryMs:value}),/BUDGET_INVALID/);
  assert.equal(writes,2);
});

test('accepted observation uses the original thirty-minute window and narrows each read',async t=>{
  let now=5000000, reads=0; t.mock.method(Date,'now',()=>now);
  const budgets:Array<number|undefined>=[],saved:Array<{firstSubmittedAt?:number}>=[];
  const storage=store(),set=storage.setItem.bind(storage);
  storage.setItem=(key,value)=>{saved.push(JSON.parse(value));set(key,value);};
  const f=fixture({enqueue:async(_c,_i,key)=>receipt(key,'accepted'),result:async(_input,_signal,recovery)=>{
    budgets.push(recovery?.budgetMs);reads++;
    if(reads===1){now+=130000;return receipt(c.snapshot().requestKey,'executing');}
    return receipt(c.snapshot().requestKey);
  }},storage);
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage,random:()=>0,sleep:async ms=>{now+=ms;}});
  await c.submit({id:'offer'});
  while(c.snapshot().isObserving)await Promise.resolve();
  assert.equal(c.snapshot().state,'succeeded');assert.equal(reads,2);
  assert.deepEqual(budgets,[1794000,1658000]);
  assert.ok(saved.every(intent=>intent.firstSubmittedAt===5000000));
});

test('busy result recovery remains bounded by the original deadline, without enqueue replay',async t=>{
  let now=6000000,reads=0,writes=0; t.mock.method(Date,'now',()=>now);
  const f=fixture({enqueue:async(_c,_i,key)=>{writes++;return receipt(key,'accepted');},result:async(_input,_signal,recovery)=>{
    reads++;assert.equal(recovery?.budgetMs,1794000);now+=1794000;
    throw Object.assign(new Error('busy'),{status:429,code:'CONCURRENCY_RESULT_BUSY'});
  }});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,acceptanceRecoveryMs:1800000,random:()=>0,sleep:async ms=>{now+=ms;}});
  await c.submit({id:'offer'});while(c.snapshot().isObserving)await Promise.resolve();
  assert.equal(reads,1);assert.equal(writes,1);assert.equal(c.snapshot().state,'recovering');
  assert.equal(c.snapshot().errorCode,'CONCURRENCY_RESULT_OBSERVATION_EXHAUSTED');
});

test('real result dependency, permission and transport failures stop automatic observation',async()=>{
  for(const error of [Object.assign(new Error('database'),{status:503,code:'CONCURRENCY_DATABASE_UNAVAILABLE'}),Object.assign(new Error('cache'),{status:503,code:'CONCURRENCY_CACHE_UNAVAILABLE'}),Object.assign(new Error('denied'),{status:403,code:'CONCURRENCY_CAPABILITY_REQUIRED'}),new TypeError('offline')]) {
    let reads=0,writes=0;
    const f=fixture({enqueue:async(_c,_i,key)=>{writes++;return receipt(key,'accepted');},result:async()=>{reads++;throw error;}});
    await f.controller.submit({id:'offer'});while(f.controller.snapshot().isObserving)await Promise.resolve();
    assert.equal(reads,1);assert.equal(writes,1);assert.equal(f.controller.snapshot().state,'error');
    assert.equal(f.controller.snapshot().receipt?.state,'accepted');assert.ok(f.controller.snapshot().requestKey);
  }
});

test('a read error during intake does not repeatedly hide a dependency fault',async()=>{
  let writes=0,reads=0;
  const error=Object.assign(new Error('cache unavailable'),{status:503,code:'CONCURRENCY_CACHE_UNAVAILABLE'});
  const f=fixture({enqueue:async()=>{writes++;throw new TypeError('lost acknowledgement');},result:async()=>{reads++;throw error;}});
  await assert.rejects(()=>f.controller.submit({id:'offer'}),{code:'CONCURRENCY_CACHE_UNAVAILABLE'});
  assert.equal(reads,1);assert.equal(writes,1);assert.equal(f.controller.snapshot().isObserving,false);
});

test('an original-result read consuming intake time cannot start a write after expiry',async t=>{
  let now=7000000,writes=0; t.mock.method(Date,'now',()=>now);
  const f=fixture({enqueue:async()=>{writes++;throw new TypeError('lost acknowledgement');},result:async(_input,_signal,recovery)=>{
    assert.equal(recovery?.budgetMs,115000);now+=115001;throw missing();
  }});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,random:()=>0,sleep:async ms=>{now+=ms;}});
  await assert.rejects(()=>c.submit({id:'offer'}),{code:'CONCURRENCY_ACCEPTANCE_UNCONFIRMED'});
  assert.equal(writes,1);assert.equal(c.snapshot().isObserving,false);
});

test('expired original observation allows explicit late facts without restarting polls or renewing time',async t=>{
  let now=8000000,reads=0,late=false,savedStart:number|undefined; t.mock.method(Date,'now',()=>now);
  const storage=store(),set=storage.setItem.bind(storage);
  storage.setItem=(key,value)=>{savedStart=JSON.parse(value).firstSubmittedAt;set(key,value);};
  const f=fixture({enqueue:async(_c,_i,key)=>receipt(key,'accepted'),result:async(_input,_signal,recovery)=>{
    reads++;if(late)assert.equal(recovery,undefined);
    return receipt(c.snapshot().requestKey,late?'succeeded':'accepted');
  }},storage);
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage,random:()=>0,sleep:async()=>{now+=1800000;}});
  await c.submit({id:'offer'});while(c.snapshot().isObserving)await Promise.resolve();
  assert.equal(reads,0);assert.equal(c.snapshot().errorCode,'CONCURRENCY_RESULT_OBSERVATION_EXHAUSTED');
  await c.refresh();assert.equal(reads,1);assert.equal(c.snapshot().isObserving,false);
  late=true;await c.refresh();assert.equal(reads,2);assert.equal(c.snapshot().state,'succeeded');assert.equal(savedStart,8000000);
});

test('a cross-device pending receipt uses its original acceptance age, not page mount time',async t=>{
  let now=9000000,reads=0; t.mock.method(Date,'now',()=>now);
  const pending={...receipt('remote','accepted'),acceptedAt:new Date(now-1800001).toISOString()};
  const f=fixture({mine:async()=>({items:[pending]}),result:async()=>{reads++;return pending;}});
  await f.controller.refresh();assert.equal(reads,0);assert.equal(f.controller.snapshot().isObserving,false);
  assert.equal(f.controller.snapshot().errorCode,'CONCURRENCY_RESULT_OBSERVATION_EXHAUSTED');
});
