import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {Inject,Module,Scope} from '@nestjs/common';
import {DiscoveryModule,NestFactory} from '@nestjs/core';
import {sha256Digest,type ManagedCommandExecution,type ManagedCommandPlan,type ManagedCommandExecutionVerification} from 'openxiangda-contracts';
import {OpenXiangdaManagedCommandHandler,OpenXiangdaManagedCommandRegistry,OpenXiangdaManagedCommandController} from '../src/managed-command.js';
import {validateManagedCommandPlan} from '../src/managed-command-plan.js';
import {runManagedExecution,managedExecution} from '../src/managed-command-private.js';
import {OpenXiangdaPlatformClient} from '../src/platform-client.js';
import {OpenXiangdaApplicationCredentials} from '../src/application-credentials.js';
import {OPENXIANGDA_MODULE_OPTIONS} from '../src/tokens.js';
const id='00000000-0000-4000-8000-000000000001';
const execution:ManagedCommandExecution={kind:'backend-plan',handlerCode:'claim',timeoutMs:1000,resources:[{resourceCode:'claims',readFields:['id','person','deadline'],writeFields:['person'],writeOperations:['create']}]};
const valid=():ManagedCommandPlan=>({schemaVersion:'openxiangda.managed-command-plan/v1',guards:[{kind:'record-match',resourceCode:'claims',id,lockKey:'one',errorCode:'CLOSED',assertions:[{kind:'command-accepted-at',field:'deadline',operator:'gte'}]}],operations:[{operation:'create',resourceCode:'claims',data:{person:'actor'}}],result:{id:{operationIndex:0,field:'id'}}});
const verification:ManagedCommandExecutionVerification={commandId:id,commandCode:'claim',handlerCode:'claim',generation:1,actorId:'actor',acceptedAt:new Date().toISOString(),deadlineAt:new Date(Date.now()+60000).toISOString(),input:{id},declarationDigest:'a'.repeat(64),inputDigest:sha256Digest({id}),runtime:{tenantId:'tenant',appCode:'test',environmentKey:'preproduction',environmentId:'env',versionId:'version',deploymentId:'deploy',headRevision:1,backendCode:'main'}};
const options:any={appCode:'test',environmentKey:'preproduction',environmentId:'env',appVersionId:'version',deploymentRunId:'deploy',environmentHeadRevision:1,platformBaseUrl:'https://invalid.test/service',oauthClient:{clientId:'a',clientSecret:'b'},managedCommandHandlerManifest:{schemaVersion:'openxiangda.managed-command-handler-manifest/v1',appCode:'test',handlers:[{commandCode:'claim',handlerCode:'claim',declarationDigest:'a'.repeat(64),endpointPath:'/__platform/managed-commands/claim/plan',execution}]}};

test('plan accepts queue-only acceptance guards and create result refs, rejecting effects/scope/budgets',()=>{
  assert.deepEqual(validateManagedCommandPlan(valid(),execution),valid());
  for(const mutate of [
    (p:any)=>{p.idempotencyKey='caller';},(p:any)=>{p.operations[0].operation='delete';},(p:any)=>{p.operations[0].resourceCode='secrets';},
    (p:any)=>{p.operations[0].data={id};},(p:any)=>{p.guards[0].assertions[0].field='private';},(p:any)=>{p.result.id.operationIndex=3;},
    (p:any)=>{p.operations[0].data.person={operationIndex:0,field:'id'};},(p:any)=>{p.operations=Array(100).fill(p.operations[0]);},
    (p:any)=>{p.guards=Array(21).fill(p.guards[0]);},(p:any)=>{p.result.payload='x'.repeat(65536);},
    (p:any)=>{p.guards=[{kind:'role-member',userId:'other',roleCode:'admin',errorCode:'ROLE'}];},
  ]) {const plan=valid();mutate(plan);assert.throws(()=>validateManagedCommandPlan(plan,execution),/PLAN_INVALID/);}
});

test('private execution allows only proof-scoped reads and rejects ordinary platform and OAuth side effects',async()=>{
  const calls:Array<{url:string;init:any}>=[];
  const platform=new OpenXiangdaPlatformClient({...options,fetch:async(url:any,init:any)=>{calls.push({url:String(url),init});return new Response(JSON.stringify({code:200,data:{schemaVersion:'openxiangda.native-data-record/v2',resourceCode:'claims',data:{id,person:'actor'}}}));}});
  const credentials=new OpenXiangdaApplicationCredentials(options);
  await runManagedExecution('Bearer private-proof',verification,async()=>{
    await assert.rejects(()=>platform.capabilities(),/SIDE_EFFECT_FORBIDDEN/);
    await assert.rejects(()=>credentials.getAuthorizationHeader(),/SIDE_EFFECT_FORBIDDEN/);
    const record=await platform.managedCommandGet('claims',id);assert.equal(record.data.id,id);assert.equal(record.data.person,'actor');assert.equal(calls.length,1);assert.ok(calls[0]!.url.endsWith('/native/concurrency/executions/data/get'));
    assert.equal(calls[0]!.init.headers.authorization,'Bearer private-proof');
  });
  assert.equal(managedExecution(),undefined);await assert.rejects(()=>platform.managedCommandGet('claims',id),/CONTEXT_REQUIRED/);
});

test('handler DI happens only after transport/proof checks and inside private scope; retries get a new instance',async()=>{
  let constructed=0;const contexts:any[]=[];
  class Handler {
    constructor(){assert.ok(managedExecution());constructed++;}
    plan(_input:any,context:any){contexts.push(context);assert.ok(Object.isFrozen(context));assert.equal(context.actor.userId,'actor');assert.equal('authorization' in context,false);return valid();}
  }
  OpenXiangdaManagedCommandHandler({commandCode:'claim',handlerCode:'claim'})(Handler);
  class Fixture {}
  Module({imports:[DiscoveryModule],providers:[OpenXiangdaManagedCommandRegistry,Handler,{provide:OPENXIANGDA_MODULE_OPTIONS,useValue:options}]})(Fixture);
  const app=await NestFactory.createApplicationContext(Fixture,{logger:false,abortOnError:false});
  try {
    assert.equal(constructed,0);
    let allow=false;
    const verifier:any={verify:async()=>{if(!allow)throw new Error('bad signature');return{tenant_id:'tenant'};}};
    const platform:any={verifyManagedCommandExecution:async()=>verification,managedCommandGet(){},managedCommandQuery(){},managedCommandCurrentInitiator(){}};
    const controller=new OpenXiangdaManagedCommandController(app.get(OpenXiangdaManagedCommandRegistry),verifier,platform,options);
    const request:any={headers:{authorization:'Bearer private-proof','x-openxiangda-gateway-assertion':'assertion'},body:{commandId:id,generation:1,input:{id}}};
    await assert.rejects(()=>controller.plan('claim',request),/bad signature/);assert.equal(constructed,0);
    allow=true;await controller.plan('claim',request);await controller.plan('claim',request);assert.equal(constructed,2);
    assert.equal(contexts.length,2);assert.equal(managedExecution(),undefined);
    await assert.rejects(()=>controller.plan('claim',{...request,body:{...request.body,generation:2}}));assert.equal(constructed,2);
  }finally{await app.close();}
});


test('managed get rejects a bare row protocol response and distinguishes missing record',async()=>{
  for(const payload of [{id,person:'actor'},null]) {
    const platform=new OpenXiangdaPlatformClient({...options,fetch:async()=>new Response(JSON.stringify({code:200,data:payload}))});
    await runManagedExecution('Bearer private-proof',verification,async()=>{
      await assert.rejects(()=>platform.managedCommandGet('claims',id),(error:any)=>payload===null?error.httpStatus===404&&error.code==='OPENXIANGDA_MANAGED_RECORD_NOT_FOUND':error.httpStatus===502&&error.code==='OPENXIANGDA_MANAGED_DATA_RESPONSE_INVALID');
    });
  }
});
