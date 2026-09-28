import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenXiangdaBusinessDirectoryService } from '../src/business-directory.js';
import { OpenXiangdaPlatformClient } from '../src/platform-client.js';
function setup() {
 const calls: any[]=[]; let result:any={schemaVersion:'openxiangda.selected-user-directory-snapshot/v2',userId:'target',displayName:'组织人员',employeeNumber:'T01',snapshotRevision:'a'.repeat(64),resolvedAt:'2026-09-29T00:00:00Z'};
 const request:any={headers:{},openxiangda:{authorization:'Bearer assertion',perspectiveCode:null,principal:{principalType:'user',userId:'admin'},operation:{code:'repair',requiredCapability:'app:arts:repair',platformAccess:{directory:{mode:'selected-user',fields:['displayName','employeeNumber']}}}}};
 const client=new OpenXiangdaPlatformClient({appCode:'arts',environmentKey:'preproduction',platformBaseUrl:'https://platform.example',fetch:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({code:200,data:result}),{status:200});}} as any);
 return {calls,request,directory:new OpenXiangdaBusinessDirectoryService(request,client),setResult:(v:any)=>{result={...result,...v};}};
}
test('selected user uses declared action and exact platform identity, environment is fixed',async()=>{const f=setup();assert.equal((await f.directory.selectedUser('target')).employeeNumber,'T01');assert.match(String(f.calls[0].url),/selected-user\?environmentKey=preproduction$/);assert.deepEqual(JSON.parse(f.calls[0].init.body),{schemaVersion:'openxiangda.selected-user-directory-request/v2',userId:'target'});});
test('selected user rejects undeclared access, invalid target and mismatched response',async()=>{const f=setup();await assert.rejects(f.directory.selectedUser(' '));assert.equal(f.calls.length,0);f.setResult({userId:'other'});await assert.rejects(f.directory.selectedUser('target'),{code:'OPENXIANGDA_DIRECTORY_SELECTED_USER_RESPONSE_INVALID'});f.request.openxiangda.operation.platformAccess.directory.mode='current-initiator';await assert.rejects(f.directory.selectedUser('target'),/ACCESS_REQUIRED/);assert.equal(f.calls.length,1);});
