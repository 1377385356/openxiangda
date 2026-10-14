import assert from 'node:assert/strict';
import test from 'node:test';
import {applicationOperationTransport,parseApplicationOperation,applicationOperationCatalog} from '../src/application-operations.js';
const planId='11111111-1111-4111-8111-111111111111';
test('legacy apply is a scoped explicit-environment administration request without caller URLs',()=>{
 const request={operation:'workflows.legacy-apply',environment:'test',input:{schemaVersion:'openxiangda.workflow-legacy-adoption-apply/v2',planId,expectedPlanDigest:'a'.repeat(64)}};
 const transport=applicationOperationTransport('app',request);assert.equal(transport.path,`/openxiangda-api/v2/applications/app/admin/workflow-legacy-adoptions/${planId}/apply`);
 assert.deepEqual(JSON.parse(transport.init.body!),{schemaVersion:'openxiangda.workflow-legacy-adoption-apply/v2',expectedPlanDigest:'a'.repeat(64),environmentKey:'preproduction'});
 assert.equal(applicationOperationCatalog().operations.filter(o=>o.operation.startsWith('workflows.legacy-')).length,3);
 for(const patch of[{url:'https://foreign'},{environment:'test',input:{...request.input,impersonate:true}},{environment:'invalid'}])assert.throws(()=>parseApplicationOperation({...request,...patch}));
 const receipt=applicationOperationTransport('app',{operation:'workflows.legacy-receipt',environment:'production',input:{planId}});assert.match(receipt.path,/environmentKey=production$/);assert.deepEqual(receipt.init,{});
});
