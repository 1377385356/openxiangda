import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenXiangdaPlatformClient } from '../src/platform-client.js';
import { OpenXiangdaWorkflowService } from '../src/workflow.js';
import type { WorkflowDelegationMutationIntent } from 'openxiangda-contracts';

test('request-scoped delegation SDK retains verified actor context, bound environment and original operation on recovery', async () => {
  const calls: Array<{url:string;init:RequestInit}> = [];
  let status=200;
  const platform=new OpenXiangdaPlatformClient({appCode:'delegation-fixture',environmentKey:'preproduction',platformBaseUrl:'https://fixture.example',fetch:async(url,init)=>{
    calls.push({url:String(url),init:init||{}}); return new Response(JSON.stringify({code:status,data:{errorCode:'FIXTURE_REJECTION'}}),{status});
  }} as any);
  const request:any={headers:{},openxiangda:{authorization:'Bearer verified-fixture',principal:{principalType:'user',userId:'actor'}}};
  const service=new OpenXiangdaWorkflowService(request,platform);
  const mutation:WorkflowDelegationMutationIntent={schemaVersion:'openxiangda.workflow-delegation-mutation/v2',operation:'revoke',operationId:'761f3295-0e7f-4493-851e-052a0b8e9b74',delegationId:'9aad8f64-d7b6-4488-9f37-9c9cafb7746c',expectedRevision:1,reason:'合成恢复'};
  await service.delegationCatalog(); await service.delegationManagement({limit:20,offset:20});
  await service.delegationCandidates({delegatorRoleSubjectKey:'membership:9aad8f64-d7b6-4488-9f37-9c9cafb7746c',validFrom:'2026-10-02T00:00:00Z',validTo:'2026-10-03T00:00:00Z'});
  assert.ok(calls.every(call=>new URL(call.url).searchParams.get('environmentKey')==='preproduction'));
  const before=calls.length;
  await assert.rejects(service.delegationManagement({environmentKey:'production'} as any),/ENVIRONMENT_MISMATCH/);
  await assert.rejects(service.delegationCandidates({environmentKey:'production'} as any),/ENVIRONMENT_MISMATCH/);
  await assert.rejects(service.executeDelegationMutation({...mutation,environmentKey:'production'} as any),/ENVIRONMENT_MISMATCH/);
  assert.equal(calls.length,before);
  await service.previewDelegationMutation(mutation);
  status=503; await assert.rejects(service.executeDelegationMutation(mutation));
  const first=calls[calls.length-1]!; assert.equal(calls.length,before+2);
  status=404; await assert.rejects(service.delegationMutationReceipt(mutation.operationId));
  status=200; await service.executeDelegationMutation(mutation);
  assert.equal(calls[calls.length-1]!.init.body,first.init.body);
  assert.deepEqual(JSON.parse(String(first.init.body)),{...mutation,environmentKey:'preproduction'});
  assert.ok(calls.every(call=>new Headers(call.init.headers).get('authorization')==='Bearer verified-fixture'));
  delete request.openxiangda;
  const total=calls.length;
  await assert.rejects(service.delegationCatalog(),/CONTEXT/); assert.equal(calls.length,total);
});
