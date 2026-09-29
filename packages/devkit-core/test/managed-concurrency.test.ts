import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, defineOpenXiangdaApp, requiredPlatformCapabilities, validateAppConfig } from '../src/index.js';

import { concurrencyExample } from '../../../examples/managed-concurrency/declaration.js';

function platformCompile(compiled: ReturnType<typeof compileApplicationSources>) {
  return compileNativeApplicationConfiguration({appCode:'limited-resource',configBytes:canonicalJson(compiled.config.value),
    contractBytes:canonicalJson(compiled.contracts.value),expectedConfigDigest:sha256Digest(compiled.config.value),expectedContractDigest:sha256Digest(compiled.contracts.value)});
}

test('cache, admission and quota declarations survive both compilers with the same capability requirement', () => {
  const config = defineOpenXiangdaApp(concurrencyExample());
  const compiled = compileApplicationSources(config);
  const native = platformCompile(compiled);
  assert.deepEqual(compiled.contracts.value.concurrency, compiled.config.value.data.concurrency);
  assert.deepEqual(native.requiredPlatformCapabilities.find(c => c.code === 'data.managed-concurrency'), requiredPlatformCapabilities(config).find(c => c.code === 'data.managed-concurrency'));
  assert.equal(compiled.config.value.data.resources.find(r => r.code === 'claims')?.surface?.mutationOwner, 'queued-command');
  assert.equal(compiled.config.value.data.resources.find(r => r.code === 'claims')?.surface?.generated?.create, false);
});

test('queued quota commands retain the canonical business unique key through both compilers', () => {
  const source = concurrencyExample();
  source.data!.resources.find(resource => resource.code === 'claims')!.uniqueKeys = [{
    code: 'offer-person', fields: [{ fieldCode: 'offerId' }, { fieldCode: 'person' }],
  }];
  const config = defineOpenXiangdaApp(source);
  const compiled = compileApplicationSources(config);
  const native = platformCompile(compiled);
  const claims = compiled.config.value.data.resources.find(resource => resource.code === 'claims')!;
  assert.equal(claims.surface?.mutationOwner, 'queued-command');
  assert.deepEqual(native.projections.data.value.resources.find(resource => resource.code === 'claims')?.uniqueKeys, claims.uniqueKeys);
  for (const code of ['data.managed-concurrency', 'data.unique-keys']) {
    const capability = requiredPlatformCapabilities(config).find(value => value.code === code);
    assert.ok(capability);
    assert.deepEqual(native.requiredPlatformCapabilities.find(value => value.code === code), capability);
  }
});

test('both authoring paths reject cache permission bypass, quota bypass and unbounded policies', () => {
  const mutations = [
    (d:any) => { d.reads[0].where[0].value={from:'actor'}; },
    (d:any) => { d.reads[0].dependencies=['id']; },
    (d:any) => { d.commands[0].admission.maxInFlight=1000; },
    (d:any) => { delete d.commands[0].quota; d.commands[0].operations[0].data.allocationId={from:'input',key:'id'}; },
    (d:any) => { d.commands[0].operations[0].data.person={from:'client-actor'}; },
    (d:any) => { d.commands[0].guards[0].conditions[0].field='capacity'; },
    (d:any) => { d.quotas[0].capacityField='title'; },
    (d:any) => { d.commands[0].extra='sql'; },
    (d:any) => { d.commands[0].resourceKey={from:'actor'}; },
    (d:any) => { d.commands[0].guards[0].id={from:'literal',value:'not-a-record-id'}; },
    (d:any) => { d.commands[0].parameters.mode={type:'string',values:['ready'],maximum:1}; },
    (d:any) => { d.commands[0].operations[0].data.id={from:'input',key:'id'}; },
    (d:any) => { d.commands[0].quota.allocation={from:'input',key:'id'}; },
    (d:any) => { d.commands[0].quota={pool:'places',action:'confirm',allocation:{from:'actor'}}; d.commands[0].operations=[]; },
    (d:any) => { delete d.commands[0].quota; d.commands[0].operations=[{operation:'update',resourceCode:'claims',id:{from:'input',key:'id'},expectedRevision:{from:'input',key:'id'},data:{person:{from:'actor'}}}]; },
  ];
  for (const mutate of mutations) {
    const source=concurrencyExample(); mutate(source.data!.concurrency);
    assert.throws(()=>defineOpenXiangdaApp(source));
    const materialized=defineOpenXiangdaApp(concurrencyExample());mutate(materialized.data!.concurrency);
    assert.ok(validateAppConfig(materialized).some(d=>d.code==='NATIVE_MANAGED_CONCURRENCY_INVALID'));
    const compiled=compileApplicationSources(defineOpenXiangdaApp(concurrencyExample()));mutate(compiled.config.value.data.concurrency);
    assert.throws(()=>platformCompile(compiled));
  }
});

function durableSource() {
  const source=concurrencyExample();
  source.data!.concurrency!.quotas=[];
  const command=source.data!.concurrency!.commands[0]!;
  delete command.operations;delete command.quota;delete command.guards;
  command.mode='durable';command.deadlineSeconds=3600;
  command.intake={perSecond:100,burst:200,maxInFlight:100};
  command.admission.maxQueue=5000;delete command.admission.permitSeconds;
  command.parameters.phone={type:'string',minLength:0,maxLength:32};command.parameters.agreed={type:'boolean'};
  command.execution={kind:'backend-plan',handlerCode:'claim',timeoutMs:10000,resources:[{resourceCode:'claims',readFields:['id','revision','created_at','person','offerId'],writeOperations:['create'],writeFields:['offerId','person']}],directory:{mode:'current-initiator',fields:['displayName','employeeNumber']}};
  delete source.data!.resources.find(r=>r.code==='claims')!.mutationOwner;
  return source;
}

test('durable handler declarations opt into independent capability and preserve ordinary resource writes',()=>{
  const config=defineOpenXiangdaApp(durableSource());
  const compiled=compileApplicationSources(config),native=platformCompile(compiled);
  const cap=requiredPlatformCapabilities(config).find(c=>c.code==='data.managed-concurrency.durable');
  assert.ok(cap);assert.deepEqual(native.requiredPlatformCapabilities.find(c=>c.code===cap.code),cap);
  const generated=compiled.contracts.typescript.match(/export const managedCommandHandlerManifest = ([\s\S]*?) as const;/);
  assert.ok(generated);const manifest=JSON.parse(generated[1]!);
  assert.equal(manifest.handlers[0].declarationDigest,sha256Digest(compiled.contracts.value.concurrency!.commands[0]));
  assert.equal(manifest.handlers[0].endpointPath,'/__platform/managed-commands/claim/plan');
  assert.deepEqual(manifest.handlers[0].execution,compiled.contracts.value.concurrency!.commands[0]!.execution);
  assert.notEqual(compiled.config.value.data.resources.find(r=>r.code==='claims')?.surface?.mutationOwner,'queued-command');
  assert.equal(requiredPlatformCapabilities(defineOpenXiangdaApp(concurrencyExample())).some(c=>c.code==='data.managed-concurrency.durable'),false);
});

test('durable compilation rejects unsafe scope, unbounded inputs and mixed permit execution in both compilers',()=>{
  for(const mutate of [
    (c:any)=>{c.execution.url='https://elsewhere.invalid';},(c:any)=>{c.execution.resources[0].writeOperations=['delete'];},
    (c:any)=>{c.execution.resources[0].writeFields=['id'];},(c:any)=>{c.execution.resources[0].writeFields=['revision'];},(c:any)=>{c.parameters.phone.maxLength=257;},
    (c:any)=>{c.execution.directory.mode='selected-user';},(c:any)=>{c.execution.directory.fields=['phone'];},
    (c:any)=>{delete c.intake;},(c:any)=>{c.intake.maxInFlight=1001;},(c:any)=>{c.operations=[];},
    (c:any)=>{c.execution.resources[0].readFields=['undeclared'];},(c:any)=>{c.mode='permit';},
  ]) {
    const source=durableSource();mutate(source.data!.concurrency!.commands[0]);assert.throws(()=>defineOpenXiangdaApp(source));
    const compiled=compileApplicationSources(defineOpenXiangdaApp(durableSource()));mutate(compiled.config.value.data.concurrency!.commands[0]);assert.throws(()=>platformCompile(compiled));
  }
  const old=concurrencyExample();old.data!.concurrency!.commands[0]!.parameters.free={type:'boolean'};assert.throws(()=>defineOpenXiangdaApp(old));
});
