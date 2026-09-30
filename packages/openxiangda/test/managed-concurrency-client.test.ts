import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts/browser';
import { createManagedConcurrencyClient, loadRuntimeAuthorization } from '../src/browser/platform-client';
import type { ManagedConcurrencyClient } from '../src/browser/managed-command';

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
    const pending=api.read('offer',{id:'offer'});
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
    const rejected = assert.rejects(api.read('offer', { id: 'original' }), { code: 'CONCURRENCY_IDENTITY_CHANGED' });
    await settle(); assert.equal(calls, 1);
    await switchScope('changed-role-union'); t.mock.timers.tick(2500);
    await rejected; assert.equal(calls, 1);
  });
});

test('write methods and dependency or permission failures are never automatically replayed', async () => {
  await withClient(async (api, configure) => {
    let calls = 0; configure(async () => { calls++; return reply(429, 'CONCURRENCY_API_BUSY'); });
    for (const write of [() => api.enqueue('claim', { id: 'offer' }, 'original'), () => api.accept('permit'), () => api.cancel('operation')])
      await assert.rejects(write, { code: 'CONCURRENCY_API_BUSY' });
    assert.equal(calls, 3);
    for (const [status, code] of [[503, 'CONCURRENCY_CACHE_UNAVAILABLE'], [503, 'OPENXIANGDA_AUTHORIZATION_PROJECTION_NOT_READY'], [403, 'CONCURRENCY_CAPABILITY_REQUIRED']] as const) {
      const before = calls; configure(async () => { calls++; return reply(status, code); });
      await assert.rejects(() => api.read('offer', {}), { code }); assert.equal(calls, before + 1);
    }
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
