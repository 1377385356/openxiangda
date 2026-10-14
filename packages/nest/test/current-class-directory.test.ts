
import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenXiangdaBusinessDirectoryService } from '../src/business-directory.js';
import { OpenXiangdaPlatformClient } from '../src/platform-client.js';
const org='11111111-1111-4111-8111-111111111111';
function setup() {
  const calls:any[]=[];
  let result:any={ schemaVersion:'openxiangda.directory-class-page/v1', organizationId:org, userId:'actor', nextCursor:null,
    items:[{directoryClassId:org,organizationName:'合成学校',sourceClassId:'source',name:'合成班级',sourceCampusId:'c',sourcePeriodId:'p',sourceGradeId:'g',campusName:null,periodName:null,gradeName:null,roleCodes:['teacher']}]};
  const request:any={headers:{'x-request-id':'request'},openxiangda:{authorization:'Bearer assertion',
    connectedDevelopmentSessionToken:'dev-session',principal:{principalType:'developer',userId:'actor'},
    operation:{code:'submit',requiredCapability:'app:demo:submit',platformAccess:{directoryClasses:{maxIds:2}}}}};
  const platform=new OpenXiangdaPlatformClient({appCode:'demo',environmentKey:'preproduction',platformBaseUrl:'https://platform.example',
    fetch:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({code:200,data:result}),{status:200});}} as any);
  return {calls,request,directory:new OpenXiangdaBusinessDirectoryService(request,platform),setResult:(value:any)=>{result={...result,...value};}};
}
test('class directory sends exact action proof and source IDs under its fixed environment',async()=>{
  const f=setup();assert.equal((await f.directory.currentClasses(['source'])).items[0]?.sourceClassId,'source');
  assert.match(String(f.calls[0].url),/current-classes\?environmentKey=preproduction$/);
  assert.deepEqual(JSON.parse(f.calls[0].init.body),{schemaVersion:'openxiangda.current-classes-directory-request/v1',sourceClassIds:['source']});
  assert.equal(f.calls[0].init.headers['x-openxiangda-business-action-code'],'submit');
  assert.equal(f.calls[0].init.headers['x-openxiangda-business-action-capability'],'app:demo:submit');
  assert.equal(f.calls[0].init.headers['x-openxiangda-dev-session'],'dev-session');
  assert.equal(f.calls[0].init.headers['x-openxiangda-perspective'],undefined);
});
test('undeclared, oversized, duplicate, invalid or service identities never reach platform I/O',async()=>{
  for(const ids of [[],['a','b','c'],['source','source'],[' source'],null]){
    const f=setup();await assert.rejects(f.directory.currentClasses(ids as any));assert.equal(f.calls.length,0);
  }
  const f=setup();delete f.request.openxiangda.operation.platformAccess.directoryClasses;
  await assert.rejects(f.directory.currentClasses(['source']),/ACCESS_REQUIRED/);assert.equal(f.calls.length,0);
  const s=setup();s.request.openxiangda.principal.principalType='application';
  await assert.rejects(s.directory.currentClasses(['source']),/USER_CONTEXT_REQUIRED/);assert.equal(s.calls.length,0);
});
test('partial, unrelated and sensitive results are rejected',async()=>{
  for(const result of [{items:[]},{items:[{sourceClassId:'other'}]},{raw:{}},{nextCursor:org}]){
    const f=setup();f.setResult(result);await assert.rejects(f.directory.currentClasses(['source']));
  }
});
