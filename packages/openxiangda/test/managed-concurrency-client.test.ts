import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts/browser';
import { createManagedConcurrencyClient, loadRuntimeAuthorization } from '../src/browser/platform-client';

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
