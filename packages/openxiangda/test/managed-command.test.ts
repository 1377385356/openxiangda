import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManagedCommandController, type ManagedConcurrencyClient } from '../src/browser/managed-command.js';
import { ManagedCommandGate, ManagedCommandStatus, useManagedCommand } from '../src/browser/ManagedCommand.js';
import type { CommandReceipt, WaitingReceipt } from 'openxiangda-contracts/browser';

const missing=()=>Object.assign(new Error('missing'),{code:'CONCURRENCY_COMMAND_NOT_FOUND',status:404});
const waiting=(state:WaitingReceipt['state']='admitted'):WaitingReceipt=>({state,requestKey:'original',ticket:'ticket',permit:'permit',retryAfterMs:1500,expiresAt:new Date(Date.now()+60000).toISOString()});
const receipt=(state:CommandReceipt['state']='succeeded'):CommandReceipt=>({operationId:'operation',command:'claim',requestKey:'original',state,acceptedAt:new Date().toISOString(),retryAfterMs:2000});
function storage() { const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}}; }
function client(overrides:Partial<ManagedConcurrencyClient>={}):ManagedConcurrencyClient {
  return {scope:'app/environment/user',read:async()=>({items:[],generatedAt:'',freshUntil:'',staleUntil:'',version:'1',freshness:'fresh'}),
    join:async()=>waiting(),poll:async()=>waiting(),leave:async()=>({state:'cancelled',requestKey:'original'}),accept:async()=>receipt(),result:async()=>{throw missing();},
    cancel:async()=>receipt('cancelled'),allocation:async()=>({id:'a',state:'committed',units:1,expiresAt:null}),...overrides};
}
const options=(api:ManagedConcurrencyClient, store=storage())=>({client:api,command:'claim',input:{id:'offer'},storageKey:'offer',storage:store,sleep:async()=>{},random:()=>0});

test('waiting polls only the lightweight lane; no repeated receipt or business reads',async()=>{
  let polls=0,results=0,accepts=0;
  const api=client({join:async()=>waiting('waiting'),poll:async()=>waiting(++polls<3?'waiting':'admitted'),result:async()=>{results++;throw missing();},accept:async()=>{accepts++;return receipt();}});
  const controller=new ManagedCommandController(options(api));await controller.start('original');
  assert.equal(controller.snapshot().state,'succeeded');assert.equal(polls,3);assert.equal(results,1);assert.equal(accepts,1);
});

test('lost acceptance acknowledgement resolves the durable original and never changes request key',async()=>{
  let committed=false,accepts=0;
  const api=client({accept:async()=>{accepts++;committed=true;throw Object.assign(new Error('network'),{status:503});},result:async input=>{
    assert.deepEqual(input,{command:'claim',requestKey:'original'});if(committed)return receipt();throw missing();
  }});
  const c=new ManagedCommandController(options(api));await c.start('original');assert.equal(c.snapshot().state,'succeeded');assert.equal(accepts,1);
});

test('refresh recovers an existing operation without a new admission or submission',async()=>{
  const store=storage();let saved=false,accepts=0,joins=0;
  const api=client({join:async()=>{joins++;return waiting();},accept:async()=>{accepts++;saved=true;return receipt();},result:async()=>{if(saved)return receipt();throw missing();}});
  const first=new ManagedCommandController(options(api,store));await first.start('original');
  const second=new ManagedCommandController(options(api,store));await second.resume();
  assert.equal(second.snapshot().state,'succeeded');assert.equal(joins,1);assert.equal(accepts,1);
  await assert.rejects(()=>second.start('different'),/ORIGINAL_REQUEST/);
});

test('admission can gate the form without submitting until explicitly confirmed',async()=>{
  let accepts=0;
  const c=new ManagedCommandController({...options(client({accept:async()=>{accepts++;return receipt();}})),autoAccept:false});
  await c.start('original');assert.equal(c.snapshot().state,'admitted');assert.equal(accepts,0);
  await c.submit();assert.equal(accepts,1);
});

test('stopping polling does not cancel an accepted operation or delete its recovery key',async()=>{
  const store=storage();let cancelled=0;
  const c=new ManagedCommandController({...options(client({accept:async()=>receipt('accepted'),cancel:async()=>{cancelled++;return receipt('cancelled');}}),store),sleep:async()=>{c.stop();}});
  await c.start('original');assert.equal(cancelled,0);assert.equal(c.snapshot().state,'accepted');
  const recovered=new ManagedCommandController(options(client({result:async()=>receipt()}),store));await recovered.resume();assert.equal(recovered.snapshot().state,'succeeded');
});

test('identity namespaces and unknown original results do not silently create a new intent',async()=>{
  const store=storage();const first=new ManagedCommandController({...options(client(),store),autoAccept:false});await first.start('original');
  const other=new ManagedCommandController(options(client({scope:'app/environment/other'}),store));await other.resume();assert.equal(other.snapshot().state,'idle');
  const mismatch=new ManagedCommandController({...options(client(),store),input:{id:'different'}});await assert.rejects(()=>mismatch.resume(),/RECOVERY_INPUT_CONFLICT/);
  assert.equal(mismatch.snapshot().state,'error');
});

test('a stopped observer cannot overwrite a newer durable result with a late response',async()=>{
  let release!: (value:CommandReceipt)=>void;
  let accepted=false;
  const store=storage();
  const api=client({
    accept:()=>{accepted=true;return new Promise(resolve=>{release=resolve;});},
    result:async()=>{if(accepted)return receipt();throw missing();},
  });
  const c=new ManagedCommandController(options(api,store));
  const first=c.start('original');
  while(!release) await Promise.resolve();
  c.stop();await c.resume();assert.equal(c.snapshot().state,'succeeded');
  release(receipt('accepted'));await first;
  const restored=new ManagedCommandController(options(api,store));
  await restored.resume();assert.equal(restored.snapshot().state,'succeeded');
  c.clear();assert.equal(c.snapshot().state,'idle');
});

test('cancellation retains the original intent and serializes against a new start',async()=>{
  let release!:(value:{state:'cancelled';requestKey:string})=>void;
  const c=new ManagedCommandController({...options(client({leave:()=>new Promise(resolve=>{release=resolve;})})),autoAccept:false});
  await c.start('original');const cancelling=c.cancel();
  await assert.rejects(()=>c.start('new'),/CANCELLATION_PENDING/);
  assert.equal(c.cancel(),cancelling);
  release({state:'cancelled',requestKey:'original'});await cancelling;
  assert.equal(c.snapshot().state,'cancelled');
});

test('server rendering never reads browser recovery storage or submits an intent',()=>{
  let calls=0;
  const api=client({join:async()=>{calls++;return waiting();}});
  function Probe() {
    const state=useManagedCommand({client:api,command:'claim',input:{id:'offer'},storageKey:'offer'});
    return createElement(ManagedCommandStatus,{snapshot:state});
  }
  const html=renderToStaticMarkup(createElement(Probe));
  assert.match(html,/data-command-state="idle"/);assert.equal(calls,0);
});

test('unavailable recovery storage is visible and fails before any submission',async()=>{
  let joins=0;
  const c=new ManagedCommandController(options(client({join:async()=>{joins++;return waiting();}}),{
    getItem:()=>null,removeItem:()=>{},setItem:()=>{throw new Error('browser storage unavailable');},
  }));
  await assert.rejects(()=>c.start('original'),/storage unavailable/);
  assert.equal(c.snapshot().state,'error');assert.equal(joins,0);
});

test('the waiting gate constructs heavy content only with a current admission',()=>{
  let mounts=0;
  const children=()=>{mounts++;return createElement('div',null,'heavy content');};
  for(const state of ['idle','waiting','recovering','accepted','succeeded','expired','error'] as const) {
    renderToStaticMarkup(createElement(ManagedCommandGate,{snapshot:{state},children}));
  }
  assert.equal(mounts,0);
  const html=renderToStaticMarkup(createElement(ManagedCommandGate,{snapshot:{state:'admitted'},children}));
  assert.match(html,/heavy content/);assert.equal(mounts,1);
  const error=renderToStaticMarkup(createElement(ManagedCommandStatus,{snapshot:{state:'rejected',receipt:{...receipt('rejected'),errorCode:'private-database-error'}}}));
  assert.doesNotMatch(error,/private-database-error/);
});
