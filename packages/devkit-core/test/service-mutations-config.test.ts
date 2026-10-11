import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities } from '../src/index.js';
function fixture(): any {
  const grant={resourceCode:'plans',operations:['update'],fieldCodes:['status'],maxOperations:50};
  return {app:{code:'bounded',name:'Bounded'},data:{resources:[{code:'plans',name:'Plans',fields:[{code:'status',label:'Status',type:'text.short'}]}]},
    authz:{capabilities:[{code:'app:bounded:callback',kind:'backend',name:'Callback'}],roles:[]},
    backend:{enabled:true,operations:[{code:'callback',method:'POST',path:'/callback',capability:'app:bounded:callback',
      requestSchema:{type:'object'},responseSchema:{type:'object'},platformAccess:{dataMutations:[grant]}}]},
    events:{subscriptions:[{code:'outcome',eventTypes:['openxiangda.workflow.instance.completed.v2'],platformAccess:{dataMutations:[grant]},payload:{includeChanges:false}}]}};
}
test('machine and workflow event declarations survive canonical projections and derive the required platform feature',()=>{
  const app=defineOpenXiangdaApp(fixture()),bundle=compileApplicationSources(app);
  const native=compileNativeApplicationConfiguration({appCode:app.app.code,configBytes:canonicalJson(bundle.config.value),
    contractBytes:canonicalJson(bundle.contracts.value),expectedConfigDigest:bundle.config.digest,expectedContractDigest:bundle.contracts.digest});
  assert.equal(bundle.contracts.value.operations[0]!.platformAccess!.dataMutations![0]!.maxOperations,50);
  assert.equal(bundle.contracts.value.eventConsumers[0]!.platformAccess!.dataMutations![0]!.maxOperations,50);
  assert.equal(native.requiredPlatformCapabilities.find(v=>v.code==='data.service-mutations')?.contractVersion,'1.0.0');
  assert.ok(requiredPlatformCapabilities(app).some(v=>v.code==='data.service-mutations'));
  for(const field of ['*','missing']){const invalid=fixture();invalid.backend.operations[0].platformAccess.dataMutations[0].fieldCodes=[field];assert.throws(()=>defineOpenXiangdaApp(invalid));}
});
