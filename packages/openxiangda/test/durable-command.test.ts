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
  const c=new DurableCommandController({client:second.client,command:'claim',resourceKey:'offer',storage,sleep:async()=>new Promise(()=>{})});
  await c.refresh();assert.equal(c.snapshot().requestKey,'new-device');assert.equal(c.snapshot().state,'accepted');assert.equal(c.snapshot().input,undefined);c.stop();
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
    if(reads===1){now+=110000;return receipt(c.snapshot().requestKey,'executing');}
    return receipt(c.snapshot().requestKey);
  }},storage);
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage,random:()=>0,sleep:async ms=>{now+=ms;}});
  await c.submit({id:'offer'});
  while(c.snapshot().isObserving)await Promise.resolve();
  assert.equal(c.snapshot().state,'succeeded');assert.equal(reads,2);
  assert.deepEqual(budgets,[120000,120000]);
  assert.ok(saved.every(intent=>intent.firstSubmittedAt===5000000));
});

test('cross-device observation narrows the inner read to the original remaining window',async t=>{
  const now=5500000;
  let elapsed=0,reads=0;
  const pending={...receipt('remote','accepted'),acceptedAt:new Date(now-1780000).toISOString()};
  t.mock.method(Date,'now',()=>now+elapsed);
  const f=fixture({mine:async()=>({items:[pending]}),result:async(_input,_signal,recovery)=>{
    reads++;assert.equal(recovery?.budgetMs,14000);return {...pending,state:'succeeded'};
  }});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,random:()=>0,sleep:async ms=>{elapsed+=ms;}});
  await c.refresh();while(c.snapshot().isObserving)await Promise.resolve();
  assert.equal(reads,1);assert.equal(c.snapshot().state,'succeeded');
});

test('busy result recovery remains bounded by the original deadline, without enqueue replay',async t=>{
  let now=6000000,reads=0,writes=0; t.mock.method(Date,'now',()=>now);
  const f=fixture({enqueue:async(_c,_i,key)=>{writes++;return receipt(key,'accepted');},result:async(_input,_signal,recovery)=>{
    reads++;assert.ok(recovery&&recovery.budgetMs!>0&&recovery.budgetMs!<=120000);now+=recovery.budgetMs!;
    throw Object.assign(new Error('busy'),{status:429,code:'CONCURRENCY_RESULT_BUSY'});
  }});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,acceptanceRecoveryMs:1800000,random:()=>0,sleep:async ms=>{now+=ms;}});
  await c.submit({id:'offer'});while(c.snapshot().isObserving)await Promise.resolve();
  assert.ok(reads>1);assert.ok(now<=7800000);assert.equal(writes,1);assert.equal(c.snapshot().state,'recovering');
  assert.equal(c.snapshot().errorCode,'CONCURRENCY_RESULT_OBSERVATION_EXHAUSTED');
});

test('real result dependency, permission and unmarked transport failures stop automatic observation',async()=>{
  for(const error of [Object.assign(new Error('database'),{status:503,code:'CONCURRENCY_DATABASE_UNAVAILABLE'}),Object.assign(new Error('cache'),{status:503,code:'CONCURRENCY_CACHE_UNAVAILABLE'}),Object.assign(new Error('denied'),{status:403,code:'CONCURRENCY_CAPABILITY_REQUIRED'}),new TypeError('offline')]) {
    let reads=0,writes=0;
    const f=fixture({enqueue:async(_c,_i,key)=>{writes++;return receipt(key,'accepted');},result:async()=>{reads++;throw error;}});
    await f.controller.submit({id:'offer'});while(f.controller.snapshot().isObserving)await Promise.resolve();
    assert.equal(reads,1);assert.equal(writes,1);assert.equal(f.controller.snapshot().state,'error');
    assert.equal(f.controller.snapshot().receipt?.state,'accepted');assert.ok(f.controller.snapshot().requestKey);
  }
});

test('marked result transport failure recovers the original operation without another write',async t=>{
  let now=6100000,reads=0,writes=0; t.mock.method(Date,'now',()=>now);
  const inputs:unknown[]=[],delays:number[]=[];
  const f=fixture({enqueue:async(_c,_i,key)=>{writes++;return receipt(key,'accepted');},result:async(input)=>{
    inputs.push(input);
    if(++reads===1)throw Object.assign(new Error('socket reset'),{status:503,code:'PLATFORM_TRANSPORT_UNAVAILABLE'});
    return receipt(c.snapshot().requestKey);
  }});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,
    random:()=>0,sleep:async ms=>{delays.push(ms);now+=ms;}});
  await c.submit({id:'offer'});while(c.snapshot().isObserving)await Promise.resolve();
  assert.equal(c.snapshot().state,'succeeded');assert.equal(writes,1);assert.equal(reads,2);
  assert.deepEqual(inputs,[{operationId:'operation'},{operationId:'operation'}]);assert.deepEqual(delays,[6000,10000]);
});

test('persistent marked transport failures cannot renew the original result deadline',async t=>{
  let now=6200000,reads=0,writes=0; t.mock.method(Date,'now',()=>now);
  const f=fixture({enqueue:async(_c,_i,key)=>{writes++;return receipt(key,'accepted');},result:async(_input,_signal,recovery)=>{
    reads++;now+=recovery!.budgetMs!;
    throw Object.assign(new Error('offline'),{status:503,code:'PLATFORM_TRANSPORT_UNAVAILABLE'});
  }});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,
    random:()=>0,sleep:async ms=>{now+=ms;}});
  await c.submit({id:'offer'});while(c.snapshot().isObserving)await Promise.resolve();
  assert.ok(reads>1);assert.ok(now<=8000000);assert.equal(writes,1);assert.equal(c.snapshot().acceptanceConfirmed,true);
  assert.equal(c.snapshot().errorCode,'CONCURRENCY_RESULT_OBSERVATION_EXHAUSTED');
});

test('a short accepted-result read expiry resumes the original result without another submit',async t=>{
  let now=6100000,reads=0,writes=0; t.mock.method(Date,'now',()=>now);
  const inputs:unknown[]=[],delays:number[]=[];
  const f=fixture({enqueue:async(_c,_i,key)=>{writes++;return receipt(key,'accepted');},result:async(input,_signal,recovery)=>{
    inputs.push(input);reads++;assert.equal(recovery?.budgetMs,120000);
    if(reads===1){now+=120000;throw Object.assign(new Error('read expired'),{status:504,code:'CONCURRENCY_READ_RECOVERY_EXHAUSTED',retryable:true});}
    return receipt(c.snapshot().requestKey);
  }});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,random:()=>0,sleep:async ms=>{delays.push(ms);now+=ms;}});
  await c.submit({id:'offer'});while(c.snapshot().isObserving)await Promise.resolve();
  assert.equal(c.snapshot().state,'succeeded');assert.equal(writes,1);assert.equal(reads,2);
  assert.deepEqual(inputs,[{operationId:'operation'},{operationId:'operation'}]);assert.deepEqual(delays,[6000,10000]);
});

test('repeated short result expiries stop at the original absolute observation deadline',async t=>{
  let now=6200000,reads=0,writes=0; t.mock.method(Date,'now',()=>now);
  const f=fixture({enqueue:async(_c,_i,key)=>{writes++;return receipt(key,'accepted');},result:async(_input,_signal,recovery)=>{
    reads++;now+=recovery!.budgetMs!;throw Object.assign(new Error('read expired'),{status:504,code:'CONCURRENCY_READ_RECOVERY_EXHAUSTED',retryable:true});
  }});
  const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,random:()=>0,sleep:async ms=>{now+=ms;}});
  await c.submit({id:'offer'});while(c.snapshot().isObserving)await Promise.resolve();
  assert.ok(reads>1);assert.ok(now<=8000000);assert.equal(writes,1);assert.equal(c.snapshot().acceptanceConfirmed,true);
  assert.equal(c.snapshot().errorCode,'CONCURRENCY_RESULT_OBSERVATION_EXHAUSTED');
});

test('unmarked or foreign read expiry errors cannot extend accepted-result observation',async()=>{
  for(const error of [
    {status:504,code:'CONCURRENCY_READ_RECOVERY_EXHAUSTED',retryable:false},
    {status:504,code:'CONCURRENCY_READ_RECOVERY_EXHAUSTED'},
    {status:503,code:'CONCURRENCY_READ_RECOVERY_EXHAUSTED',retryable:true},
    {status:504,code:'CONCURRENCY_DEPENDENCY_TIMEOUT',retryable:true},
  ]){
    let reads=0;
    const f=fixture({enqueue:async(_c,_i,key)=>receipt(key,'accepted'),result:async()=>{reads++;throw Object.assign(new Error(error.code),error);}});
    await f.controller.submit({id:'offer'});while(f.controller.snapshot().isObserving)await Promise.resolve();
    assert.equal(reads,1);assert.equal(f.controller.snapshot().state,'error');assert.equal(f.controller.snapshot().acceptanceConfirmed,true);
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
    reads++;if(late)assert.ok(recovery && recovery.budgetMs! > 0 && recovery.budgetMs! <= 120000);
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

async function unknownIntent(storage=store()) {
  const f=fixture({enqueue:async()=>{throw Object.assign(new Error('unrecognized response'),{status:400,code:'UNRECOGNIZED'});}},storage);
  await assert.rejects(()=>f.controller.submit({id:'original-channel',phone:'123'}));
  return {...f,key:f.controller.snapshot().requestKey!};
}

test('discovery budgets are opt-in and invalid values fail before a read',async t=>{
  t.mock.method(performance,'now',()=>0);
  for(const discoveryRecoveryMs of [undefined,1,1800000]) {
    let reads=0;
    const f=fixture({mine:async(_command,_input,_signal,recovery)=>{
      reads++;assert.equal(recovery?.budgetMs,discoveryRecoveryMs??120000);return {items:[]};
    }});
    const c=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,discoveryRecoveryMs});
    await c.refresh();assert.equal(reads,1);assert.equal(c.snapshot().state,'idle');assert.equal(c.snapshot().acceptanceConfirmed,false);
  }
  for(const discoveryRecoveryMs of [NaN,Infinity,0,-1,1800001]) {
    const f=fixture({mine:async()=>{assert.fail('invalid configuration must not read');}});
    assert.throws(()=>new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,discoveryRecoveryMs}),/DISCOVERY_BUDGET_INVALID/);
  }
});

test('a discovery chain shares one monotonic deadline and preserves the original start',async t=>{
  let now=10000000,elapsed=0;
  t.mock.method(Date,'now',()=>now);t.mock.method(performance,'now',()=>elapsed);
  const f=fixture();await f.controller.submit({id:'offer'});
  const original=f.controller.snapshot().receipt!,budgets:number[]=[];
  const c=new DurableCommandController({client:{...f.client,
    result:async(_input,_signal,recovery)=>{budgets.push(recovery!.budgetMs!);elapsed+=110000;now+=110000;return original;},
    mine:async(_command,_input,_signal,recovery)=>{budgets.push(recovery!.budgetMs!);return {items:[]};},
  },command:'claim',resourceKey:'offer',storage:f.storage,discoveryRecoveryMs:180000});
  await c.refresh();assert.deepEqual(budgets,[180000,70000]);assert.equal(c.snapshot().requestKey,original.requestKey);
  // A backwards wall clock cannot renew the fixed discovery budget either.
  elapsed=0;
  const backward=new DurableCommandController({client:{...f.client,
    result:async()=>{elapsed+=90000;now-=60000;return original;},
    mine:async(_command,_input,_signal,recovery)=>{assert.equal(recovery!.budgetMs,90000);return {items:[]};},
  },command:'claim',resourceKey:'offer',storage:f.storage,discoveryRecoveryMs:180000});
  await backward.refresh();assert.equal(backward.snapshot().state,'succeeded');
});

test('discovery narrows to the original intake deadline and a late query never renews enqueue',async t=>{
  let now=11000000,elapsed=0,writes=0;
  t.mock.method(Date,'now',()=>now);t.mock.method(performance,'now',()=>elapsed);
  const f=await unknownIntent();now+=110000;
  const budgets:number[]=[];
  const c=new DurableCommandController({client:{...f.client,
    result:async(_input,_signal,recovery)=>{if(recovery){budgets.push(recovery.budgetMs!);elapsed+=4000;now+=4000;}throw missing();},
    mine:async(_command,_input,_signal,recovery)=>{budgets.push(recovery!.budgetMs!);return {items:[]};},
    enqueue:async()=>{writes++;return receipt(f.key);},
  },command:'claim',resourceKey:'offer',storage:f.storage,discoveryRecoveryMs:1800000});
  await c.refresh();assert.deepEqual(budgets,[10000,6000]);assert.equal(c.snapshot().errorCode,'CONCURRENCY_ACCEPTANCE_UNCONFIRMED');
  now+=1800000;await c.refresh();assert.ok(budgets[2]===1800000);
  await assert.rejects(()=>c.resume(),{code:'CONCURRENCY_ACCEPTANCE_UNCONFIRMED'});
  assert.equal(writes,0);assert.equal(c.snapshot().requestKey,f.key);assert.equal(c.snapshot().acceptanceConfirmed,false);
});

test('a restored accepted nonterminal original uses lookup without mine',async()=>{
  const f=fixture({enqueue:async(_command,_input,key)=>receipt(key,'accepted')});
  const first=new DurableCommandController({client:f.client,command:'claim',resourceKey:'offer',storage:f.storage,sleep:async()=>new Promise(()=>{})});
  await first.submit({id:'offer'});first.stop();
  const original=first.snapshot().receipt!;let reads=0,lists=0,writes=0;
  const c=new DurableCommandController({client:{...f.client,
    result:async()=>{reads++;return original;},mine:async()=>{lists++;return {items:[]};},enqueue:async()=>{writes++;return original;},
  },command:'claim',resourceKey:'offer',storage:f.storage,sleep:async()=>new Promise(()=>{})});
  await c.refresh();assert.equal(reads,1);assert.equal(lists,0);assert.equal(writes,0);
  assert.equal(c.snapshot().state,'accepted');assert.equal(c.snapshot().acceptanceConfirmed,true);c.stop();
});

test('an original 404 uses one mine fallback and adopts only a matching unconfirmed intent',async()=>{
  const f=await unknownIntent();let reads=0,lists=0,writes=0;
  const c=fixture({result:async()=>{reads++;throw missing();},mine:async()=>{lists++;return {items:[receipt('other-active','accepted'),receipt(f.key)]};},
    enqueue:async()=>{writes++;return receipt(f.key);}},f.storage).controller;
  await c.refresh();assert.equal(reads,1);assert.equal(lists,1);assert.equal(writes,0);
  assert.equal(c.snapshot().state,'succeeded');assert.equal(c.snapshot().requestKey,f.key);
  assert.equal(c.snapshot().input?.id,'original-channel');assert.equal(c.snapshot().acceptanceConfirmed,true);
});

test('a foreign active cycle cannot discard an unconfirmed original and an empty mine cannot promise acceptance',async()=>{
  for(const other of [true,false]) {
    const f=await unknownIntent();let writes=0;
    const c=fixture({mine:async()=>({items:other?[receipt('other-active','accepted')]:[]}),enqueue:async()=>{writes++;return receipt();}},f.storage).controller;
    await c.refresh();assert.equal(writes,0);assert.equal(c.snapshot().state,'recovering');
    assert.equal(c.snapshot().errorCode,other?'CONCURRENCY_ORIGINAL_REQUEST_REQUIRED':'CONCURRENCY_ACCEPTANCE_UNCONFIRMED');
    assert.equal(c.snapshot().requestKey,f.key);assert.equal(c.snapshot().input?.phone,'123');assert.equal(c.snapshot().acceptanceConfirmed,false);
    const again=fixture({},f.storage).controller;await again.refresh();
    assert.equal(again.snapshot().requestKey,f.key);assert.equal(again.snapshot().input?.phone,'123');
  }
});

test('read busy and real discovery errors keep the original input and never enqueue or fall back to mine',async()=>{
  for(const error of [Object.assign(new Error('busy'),{status:429,code:'CONCURRENCY_RESULT_BUSY'}),
    Object.assign(new Error('cache'),{status:503,code:'CONCURRENCY_CACHE_UNAVAILABLE'}),
    Object.assign(new Error('unknown'),{status:400,code:'UNRECOGNIZED'}),new TypeError('offline')]) {
    const f=await unknownIntent();let lists=0,writes=0;
    const c=fixture({result:async()=>{throw error;},mine:async()=>{lists++;return {items:[]};},enqueue:async()=>{writes++;return receipt();}},f.storage).controller;
    await c.refresh();assert.equal(c.snapshot().state,(error as any).status===429?'recovering':'error');
    assert.equal(c.snapshot().requestKey,f.key);assert.equal(c.snapshot().input?.phone,'123');
    assert.equal(c.snapshot().acceptanceConfirmed,false);assert.equal(lists,0);assert.equal(writes,0);
  }
});

test('duplicate refresh shares one task; stop then remount ignores the old response',async()=>{
  const releases:Array<(items:CommandReceipt[])=>void>=[],signals:AbortSignal[]=[];let reads=0,writes=0;
  const f=fixture({mine:async(_command,_input,signal)=>{reads++;signals.push(signal!);return new Promise(resolve=>releases.push(items=>resolve({items})));},
    enqueue:async()=>{writes++;return receipt();}});
  const first=f.controller.refresh();assert.equal(f.controller.refresh(),first);assert.equal(reads,1);
  f.controller.stop();assert.equal(signals[0].aborted,true);
  const next=f.controller.refresh();assert.equal(reads,2);assert.equal(f.controller.refresh(),next);
  releases[1]([receipt('new-result')]);await next;
  releases[0]([receipt('old-result')]);await first;
  assert.equal(f.controller.snapshot().requestKey,'new-result');assert.equal(f.controller.snapshot().state,'succeeded');assert.equal(writes,0);
});

test('restoration is isolated by trusted user, environment, command and resource',async()=>{
  const f=await unknownIntent();
  for(const changes of [{scope:'app/env/other-user'},{scope:'app/other-env/user'},{command:'other-command'},{resourceKey:'other-resource'}]) {
    let reads=0;
    const c=new DurableCommandController({client:{...f.client,scope:changes.scope??f.client.scope,result:async()=>{reads++;return receipt(f.key);}},
      command:changes.command??'claim',resourceKey:changes.resourceKey??'offer',storage:f.storage});
    await c.refresh();assert.equal(reads,0);assert.equal(c.snapshot().state,'idle');assert.equal(c.snapshot().requestKey,undefined);
    assert.equal(c.snapshot().input,undefined);assert.equal(c.snapshot().acceptanceConfirmed,false);
  }
});

test('mismatched original-key and operation receipts cannot replace the frozen intent',async()=>{
  const f=await unknownIntent();
  const wrong=fixture({result:async()=>receipt('another-key')},f.storage).controller;
  await wrong.refresh();assert.equal(wrong.snapshot().errorCode,'CONCURRENCY_RECEIPT_SCOPE_INVALID');
  assert.equal(wrong.snapshot().requestKey,f.key);assert.equal(wrong.snapshot().input?.phone,'123');assert.equal(wrong.snapshot().acceptanceConfirmed,false);
  for(const change of [{requestKey:'another-key'},{operationId:'another-operation'}]) {
    const c=fixture({enqueue:async(_command,_input,key)=>receipt(key,'accepted'),result:async()=>({...receipt(c.controller.snapshot().requestKey),...change})});
    await c.controller.submit({id:'offer'});while(c.controller.snapshot().isObserving)await Promise.resolve();
    assert.equal(c.controller.snapshot().errorCode,'CONCURRENCY_RECEIPT_SCOPE_INVALID');assert.equal(c.controller.snapshot().receipt?.state,'accepted');
    assert.equal(c.controller.snapshot().acceptanceConfirmed,true);
  }
});

test('acceptance is not promised while intake acknowledgement is unknown and storage failure writes nothing',async()=>{
  let release!:(r:CommandReceipt)=>void;
  const f=fixture({enqueue:async()=>new Promise(resolve=>{release=resolve;})});
  const pending=f.controller.submit({id:'offer'});assert.equal(f.controller.snapshot().acceptanceConfirmed,false);
  release(receipt(f.controller.snapshot().requestKey));await pending;assert.equal(f.controller.snapshot().acceptanceConfirmed,true);
  let writes=0;
  const denied=fixture({enqueue:async()=>{writes++;return receipt();}},{getItem:()=>null,setItem:()=>{throw new Error('storage denied');},removeItem:()=>{}});
  await assert.rejects(()=>denied.controller.submit({id:'offer'}));assert.equal(writes,0);assert.equal(denied.controller.snapshot().acceptanceConfirmed,false);
});
