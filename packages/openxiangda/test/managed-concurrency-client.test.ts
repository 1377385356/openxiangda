import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts/browser';
import { createManagedConcurrencyClient, loadRuntimeAuthorization } from '../src/browser/platform-client';
import type { ManagedConcurrencyClient } from '../src/browser/managed-command';
import { currentPerspectiveCode, setActivePerspectiveCode } from '../src/browser/runtime-meta';
import { DurableCommandController } from '../src/browser/durable-command';

async function withClient(run: (client: ManagedConcurrencyClient, configure: (handler: (path: string, init: RequestInit) => Promise<Response>) => void,
  switchScope: (scope: string) => Promise<void>) => Promise<void>) {
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document;
  const meta: Record<string,string> = { 'openxiangda-runtime-base': '/runtime/concurrency', 'openxiangda-app-code': 'concurrency', 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: meta[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  let scope = 'original', handler = async (_path: string, _init: RequestInit) => new Response('{}');
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/authz/current')) return new Response(JSON.stringify({ code: 200, data: {
      schemaVersion: SCHEMA_VERSIONS.runtimeAuthorization, state: 'active', roles: [],
      environment: { id: 'environment', key: 'preproduction', headRevision: 1 },
      principal: { type: 'user_union', userId: 'user', roleCodes: ['participant'], capabilityCodes: ['claim'], identityScope: scope },
    } }));
    return handler(String(url), init || {});
  };
  try {
    await loadRuntimeAuthorization({ refresh: true });
    await run(createManagedConcurrencyClient(), next => { handler = next; }, async next => {
      scope = next; await loadRuntimeAuthorization({ refresh: true });
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDocument === undefined) delete (globalThis as any).document; else globalThis.document = previousDocument;
  }
}
const reply = (status: number, errorCode?: string) => new Response(JSON.stringify(errorCode
  ? { code: status, errorCode, message: errorCode, data: { retryAfterMs: 2000 } }
  : { code: 200, data: { items: [], state: 'succeeded' } }), { status, headers: { 'Retry-After': '2' } });
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('managed commands use the platform transport, preserve unknown writes and reject identity changes',async()=>{
  const previousFetch=globalThis.fetch,previousDocument=globalThis.document;
  const meta:Record<string,string>={'openxiangda-runtime-base':'/runtime/concurrency','openxiangda-app-code':'concurrency','openxiangda-environment':'preproduction'};
  globalThis.document={querySelector:(selector:string)=>({content:meta[selector.match(/name="([^"]+)"/)?.[1]||'']||''})} as any;
  let actor='first',calls=0,failWrite=false;
  let releaseRead!:(value:Response)=>void;
  const response=(data:unknown)=>new Response(JSON.stringify({code:200,data}),{status:200});
  const auth=()=>({schemaVersion:SCHEMA_VERSIONS.runtimeAuthorization,state:'active',roles:[],
    environment:{id:'environment',key:'preproduction',headRevision:1},
    principal:{type:'user_union',userId:actor,roleCodes:['participant'],capabilityCodes:['claim'],identityScope:actor}});
  globalThis.fetch=async(url,init)=>{
    const path=String(url);
    if(path.includes('/authz/current'))return response(auth());
    calls++;assert.equal(init?.method,'POST');assert.equal(init?.credentials,'include');
    const body=JSON.parse(String(init?.body));assert.equal(body.environmentKey,'preproduction');
    if(path.endsWith('/reads/offer'))return new Promise(resolve=>{releaseRead=resolve;});
    assert.ok(path.endsWith('/native/concurrency/commands/accept'));assert.equal(body.permit,'signed-permit');
    if(failWrite)throw new TypeError('unknown connection result');
    return response({operationId:'durable-id',requestKey:'original',command:'claim',state:'accepted'});
  };
  try {
    await loadRuntimeAuthorization({refresh:true});const api=createManagedConcurrencyClient();
    const accepted=await api.accept('signed-permit');assert.equal(accepted.operationId,'durable-id');
    failWrite=true;
    await assert.rejects(()=>api.accept('signed-permit'),(error:any)=>error.code==='PLATFORM_TRANSPORT_UNAVAILABLE'&&error.status===503);
    assert.equal(calls,2,'an unknown write response must not be automatically replayed');
    const pending=api.read('offer',{id:'offer'},undefined,{budgetMs:1800000});
    while(!releaseRead)await Promise.resolve();
    actor='second';await loadRuntimeAuthorization({refresh:true});
    releaseRead(response({items:[]}));
    await assert.rejects(()=>pending,(error:any)=>error.code==='CONCURRENCY_IDENTITY_CHANGED');
    const before=calls;await assert.rejects(()=>api.result({requestKey:'original',command:'claim'}),(error:any)=>error.code==='CONCURRENCY_IDENTITY_CHANGED');
    assert.equal(calls,before);
  } finally {
    globalThis.fetch=previousFetch;
    if(previousDocument===undefined)delete (globalThis as any).document;else globalThis.document=previousDocument;
  }
});

test('all four managed read methods recover budget busy, using frozen original input', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withClient(async (api, configure) => {
    const calls: Array<{ path: string; body: any }> = [];
    const perPath = new Map<string, number>();
    configure(async (path, init) => {
      calls.push({ path, body: JSON.parse(String(init.body)) });
      perPath.set(path, (perPath.get(path) || 0) + 1);
      return perPath.get(path) === 1 ? reply(429, 'CONCURRENCY_API_BUSY') : reply(200);
    });
    const input = { id: 'original' }, mine = { resourceKey: 'original', limit: 1 };
    const result = { command: 'claim', requestKey: 'original' };
    const pending = Promise.all([api.read('offer', input), api.mine('claim', mine), api.result(result), api.allocation('original')]);
    await settle(); assert.equal(calls.length, 4);
    input.id = 'edited'; mine.resourceKey = 'edited'; result.requestKey = 'edited';
    t.mock.timers.tick(2500); await pending;
    assert.equal(calls.length, 8);
    for (const path of perPath.keys()) {
      const samePath = calls.filter(call => call.path === path);
      assert.deepEqual(samePath[0].body, samePath[1].body);
      assert.equal(samePath[1].body.environmentKey, 'preproduction');
    }
  });
});

test('a changed authorization scope stops a read retry before another fetch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withClient(async (api, configure, switchScope) => {
    let calls = 0; configure(async () => { calls++; return reply(429, 'CONCURRENCY_API_BUSY'); });
    const rejected = assert.rejects(api.read('offer', { id: 'original' }, undefined, {budgetMs:1800000}), { code: 'CONCURRENCY_IDENTITY_CHANGED' });
    await settle(); assert.equal(calls, 1);
    await switchScope('changed-role-union'); t.mock.timers.tick(2500);
    await rejected; assert.equal(calls, 1);
  });
});

test('explicit long recovery reaches every read method and freezes its original input and budget', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let elapsed = 0; t.mock.method(performance, 'now', () => elapsed);
  await withClient(async (api, configure) => {
    const calls: Array<{ path: string; body: any }> = [], perPath = new Map<string, number>();
    configure(async (path, init) => {
      calls.push({path, body:JSON.parse(String(init.body))});
      perPath.set(path, (perPath.get(path)||0)+1);
      return perPath.get(path)! <= 13 ? reply(429, 'CONCURRENCY_API_BUSY') : reply(200);
    });
    const input={id:'original'}, mine={resourceKey:'original',limit:1}, result={command:'claim',requestKey:'original'};
    const recovery={budgetMs:1800000};
    const pending=Promise.all([api.read('offer',input,undefined,recovery),api.mine('claim',mine,undefined,recovery),
      api.result(result,undefined,recovery),api.allocation('original',undefined,recovery)]);
    await settle();assert.equal(calls.length,4);
    input.id='edited';mine.resourceKey='edited';result.requestKey='edited';recovery.budgetMs=0;
    for(let retry=0;retry<13;retry++){elapsed+=40000;t.mock.timers.tick(40000);await settle();}
    await pending;assert.equal(calls.length,56);assert.ok(elapsed>120000);
    for(const path of perPath.keys()){
      const samePath=calls.filter(call=>call.path===path);assert.equal(samePath.length,14);
      assert.ok(samePath.every(call=>JSON.stringify(call.body)===JSON.stringify(samePath[0].body)));
    }
  });
});

test('a changed perspective stops long recovery before another fetch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous=currentPerspectiveCode();
  try {
    setActivePerspectiveCode('original');
    await withClient(async(api,configure)=>{
      let calls=0;configure(async()=>{calls++;return reply(429,'CONCURRENCY_API_BUSY');});
      const rejected=assert.rejects(api.read('offer',{},undefined,{budgetMs:1800000}),{code:'CONCURRENCY_IDENTITY_CHANGED'});
      await settle();assert.equal(calls,1);
      setActivePerspectiveCode('changed');t.mock.timers.tick(2500);
      await rejected;assert.equal(calls,1);
    });
  } finally {setActivePerspectiveCode(previous);}
});

test('write methods and dependency or permission failures are never automatically replayed', async () => {
  await withClient(async (api, configure) => {
    let calls = 0; configure(async () => { calls++; return reply(429, 'CONCURRENCY_API_BUSY'); });
    for (const write of [() => api.enqueue('claim', { id: 'offer' }, 'original'), () => api.accept('permit'), () => api.cancel('operation')])
      await assert.rejects(write, { code: 'CONCURRENCY_API_BUSY' });
    assert.equal(calls, 3);
    for (const [status, code] of [[503, 'CONCURRENCY_CACHE_UNAVAILABLE'], [503, 'OPENXIANGDA_AUTHORIZATION_PROJECTION_NOT_READY'], [403, 'CONCURRENCY_CAPABILITY_REQUIRED']] as const) {
      const before = calls; configure(async () => { calls++; return reply(status, code); });
      await assert.rejects(() => api.read('offer', {}, undefined, {budgetMs:1800000}), { code }); assert.equal(calls, before + 1);
    }
  });
});

test('caller cancellation aborts a pending long read without starting another fetch', async () => {
  await withClient(async(api,configure)=>{
    let calls=0,signal:AbortSignal|null|undefined;
    const controller=new AbortController(),reason=new Error('page changed');
    configure(async(_path,init)=>{calls++;signal=init.signal;return new Promise(()=>{});});
    const rejected=assert.rejects(api.read('offer',{},controller.signal,{budgetMs:1800000}),received=>received===reason);
    await settle();controller.abort(reason);await rejected;
    assert.equal(calls,1);assert.equal(signal?.aborted,true);
  });
});

test('a caller-provided read budget interrupts a pending fetch and propagates its abort signal', async () => {
  await withClient(async (api, configure) => {
    let calls = 0, signal: AbortSignal | null | undefined;
    configure(async (_path, init) => { calls++; signal = init.signal; return new Promise(() => {}); });
    await assert.rejects(() => api.result({ operationId: 'original' }, undefined, { budgetMs: 10 }), { code: 'CONCURRENCY_READ_RECOVERY_EXHAUSTED' });
    assert.equal(calls, 1); assert.equal(signal?.aborted, true);
  });
});

test('durable initial discovery opts into long busy recovery without enqueueing',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let elapsed=0;t.mock.method(performance,'now',()=>elapsed);
  await withClient(async(api,configure)=>{
    let reads=0,writes=0;
    configure(async path=>{
      if(!path.endsWith('/mine')){writes++;assert.fail('discovery is read-only');}
      if(++reads<=13)return reply(429,'CONCURRENCY_RESULT_BUSY');
      return new Response(JSON.stringify({code:200,data:{items:[{
        operationId:'original-operation',requestKey:'original',command:'claim',resourceKey:'offer',state:'succeeded',
        acceptedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
      }]}}),{status:200});
    });
    const values=new Map<string,string>();
    const controller=new DurableCommandController({client:api,command:'claim',resourceKey:'offer',discoveryRecoveryMs:1800000,
      storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}}});
    const pending=controller.refresh();assert.equal(controller.refresh(),pending);
    await settle();assert.equal(reads,1);assert.equal(controller.snapshot().acceptanceConfirmed,false);
    for(let attempt=0;attempt<13;attempt++){elapsed+=40000;t.mock.timers.tick(40000);await settle();}
    await pending;assert.equal(reads,14);assert.equal(writes,0);assert.ok(elapsed>120000);
    assert.equal(controller.snapshot().state,'succeeded');assert.equal(controller.snapshot().acceptanceConfirmed,true);
  });
});

test('authorization change during durable discovery preserves the unknown original without retrying writes',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  await withClient(async(api,configure,switchScope)=>{
    const values=new Map<string,string>();let calls=0;
    const controller=new DurableCommandController({client:api,command:'claim',resourceKey:'offer',discoveryRecoveryMs:1800000,
      storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}}});
    configure(async()=>{calls++;return reply(400,'UNRECOGNIZED');});
    await assert.rejects(()=>controller.submit({id:'original-channel',phone:'123'}));
    const original=controller.snapshot().requestKey;
    configure(async()=>{calls++;return reply(429,'CONCURRENCY_RESULT_BUSY');});
    const pending=controller.refresh();await settle();assert.equal(calls,2);
    await switchScope('changed-role-union');t.mock.timers.tick(2500);await pending;
    assert.equal(calls,2);assert.equal(controller.snapshot().errorCode,'CONCURRENCY_IDENTITY_CHANGED');
    assert.equal(controller.snapshot().requestKey,original);assert.equal(controller.snapshot().input?.phone,'123');
    assert.equal(controller.snapshot().acceptanceConfirmed,false);assert.equal(controller.snapshot().isObserving,false);
  });
});
