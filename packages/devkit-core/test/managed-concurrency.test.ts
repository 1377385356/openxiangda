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
