import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import { WORKFLOW_BUSINESS_STEP_EVENT, SCHEMA_VERSIONS, eventDeliverySignatureContentV2, sha256Digest, workflowBusinessStepHandlerDigest, workflowBusinessStepReceiptSignatureSuffix, type AppEventHandlerContract, type CloudEvent, type WorkflowBusinessStepResult } from 'openxiangda-contracts';
import { OpenXiangdaEventContext } from '../src/event-context.js';
import { executeWorkflowEventConsumer, OpenXiangdaEventHandler } from '../src/event-handler.js';
import { OpenXiangdaEventReceiver, PlatformOpenXiangdaEventReceiptStore, InMemoryOpenXiangdaEventReceiptStore } from '../src/events.js';
import type { OpenXiangdaModuleOptions } from '../src/types.js';
const schema = { type: 'object', additionalProperties: false, required: ['amount'], properties: { amount: { type: 'integer', minimum: 0 } } };
const secret = 'isolated-workflow-step-test-key';
const handler: AppEventHandlerContract = { code: 'calculate-v1', endpointPath: '/__platform/events/calculate-v1', eventTypes: [WORKFLOW_BUSINESS_STEP_EVENT], dataSchemaVersions: ['2.0.0'], maxBodyBytes: 65536, receiptProtocolVersion: 2, workflowStep: { version: 1, mode: 'pure', inputSchema: schema, outputSchema: schema } };
function fixture() {
 const context = new OpenXiangdaEventContext(); let claimed=0,completed=0,released=0,rejectComplete=false;
 const results: WorkflowBusinessStepResult[]=[];
 const options: OpenXiangdaModuleOptions={ appCode:'steps',environmentKey:'preproduction',platformBaseUrl:'https://isolated.invalid/service',eventSigningSecret:secret,eventReceiptMaxAttempts:2,eventReceiptRetryDelayMs:0,
 eventHandlerManifest:{schemaVersion:SCHEMA_VERSIONS.eventHandlerManifest,appCode:'steps',handlers:[handler,{...handler,code:'calculate-v2',endpointPath:'/__platform/events/calculate-v2',workflowStep:{...handler.workflowStep!,version:2}}]},
 fetch:async(_url,init)=>{
  const command=JSON.parse(String(init?.body)),timestamp=new Headers(init?.headers).get('x-openxiangda-timestamp')!;
  const content=[SCHEMA_VERSIONS.eventReceiptCommand,timestamp,command.action,command.tenantId,command.appCode,command.environmentKey,command.subscriptionCode,command.eventId,command.deliveryId,command.claimToken||''].join('\n')+workflowBusinessStepReceiptSignatureSuffix(command.workflowStepResult);
  assert.equal(new Headers(init?.headers).get('x-openxiangda-signature'),`v1=${createHmac('sha256',secret).update(content).digest('hex')}`);
  if(command.action==='complete'&&rejectComplete){completed++;return new Response('',{status:503});}
  if(command.action==='claim')claimed++;
  if(command.action==='release')released++;
  if(command.action==='complete'){completed++;results.push(command.workflowStepResult);}
  return Response.json({code:200,data:{schemaVersion:SCHEMA_VERSIONS.eventReceiptResult,eventId:command.eventId,deliveryId:command.deliveryId,attempts:1,outcome:command.action==='claim'?'claimed':command.action==='complete'?'completed':'released',status:command.action==='complete'?'succeeded':'processing',claimToken:command.action==='claim'?randomUUID():null}});
 }};
 const receiver=new OpenXiangdaEventReceiver(options,new PlatformOpenXiangdaEventReceiptStore(options),context);
 const packet=(patch:Record<string,unknown>={})=>{
  const input={amount:120_000},step={executionId:randomUUID(),nodeId:'calculate',handlerCode:handler.code,handlerVersion:1,mode:'pure',input,inputDigest:sha256Digest(input),expectedFactRevision:2,...patch};
  const event:CloudEvent={specversion:'1.0',id:randomUUID(),type:WORKFLOW_BUSINESS_STEP_EVENT,source:'/steps',time:new Date().toISOString(),tenantid:'tenant-a',appcode:'steps',environment:'preproduction',datacontenttype:'application/json',schemaversion:'2.0.0',data:{workflowCode:'amount',definitionVersion:1,bindingVersion:1,instanceId:randomUUID(),generation:1,businessKey:'synthetic',instanceSequence:1,revision:1,dataRef:{},dataRevision:'1',actor:{},cause:{depth:1},step}};
  const body=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000)),deliveryId=randomUUID(),digest=workflowBusinessStepHandlerDigest(options.eventHandlerManifest!,handler.code);
  const signature=createHmac('sha256',secret).update(eventDeliverySignatureContentV2({timestamp,signingKeyVersion:'1',deliveryId,eventId:event.id,subscriptionCode:handler.code,handlerManifestDigest:digest,rawBody:body})).digest('hex');
  return {event,step,body,headers:{'content-type':'application/cloudevents+json','x-openxiangda-timestamp':timestamp,'x-openxiangda-signature':`v2=${signature}`,'x-openxiangda-delivery-id':deliveryId,'x-openxiangda-event-id':event.id,'x-openxiangda-signing-key-version':'1','x-openxiangda-subscription-code':handler.code,'x-openxiangda-handler-manifest-digest':digest}};
 };
 return {receiver,context,packet,results,counts:()=>({claimed,completed,released}),failComplete:()=>{rejectComplete=true;}};
}
test('fixed v1 survives adding v2 and sends a signed result using the stable execution key',async()=>{
 const f=fixture(),p=f.packet();
 const result=await f.receiver.accept(handler,p.headers,p.body,async(_event,context)=>{
  assert.equal(context.idempotencyKey,p.step.executionId);assert.equal(context.workflowStep?.inputDigest,p.step.inputDigest);assert.equal(context.causationDepth,2);assert.equal(f.context.current(),context);
  return {output:{amount:240_000},receipt:{reference:'synthetic'}};
 });
 assert.equal(result.accepted,true);assert.deepEqual(f.results[0],{executionId:p.step.executionId,handlerVersion:1,inputDigest:p.step.inputDigest,expectedFactRevision:2,output:{amount:240_000},receipt:{reference:'synthetic'}});assert.equal(f.context.current(),null);
});
test('forged signatures, handler versions and invalid inputs fail before claim or effects',async()=>{
 const f=fixture();
 for(const patch of [{handlerVersion:2},{input:{amount:'120000'}},{inputDigest:'0'.repeat(64)}]){
  const p=f.packet(patch);await assert.rejects(()=>f.receiver.accept(handler,p.headers,p.body,()=>{throw new Error('must not execute');}));
 }
 const p=f.packet();p.headers['x-openxiangda-signature']=`v2=${'0'.repeat(64)}`;await assert.rejects(()=>f.receiver.accept(handler,p.headers,p.body,()=>{throw new Error('must not execute');}));assert.equal(f.counts().claimed,0);
});
test('invalid output releases its claim while lost completion never invites immediate re-execution',async()=>{
 const f=fixture(),p=f.packet();await assert.rejects(()=>f.receiver.accept(handler,p.headers,p.body,()=>({output:{amount:'bad'}})));assert.deepEqual(f.counts(),{claimed:1,completed:0,released:1});
 f.failComplete();await assert.rejects(()=>f.receiver.accept(handler,p.headers,p.body,()=>({output:{amount:1}})));assert.deepEqual(f.counts(),{claimed:2,completed:2,released:1});
});
test('effect consumers reconcile every time and only execute confirmed not-executed results',async()=>{
 const contract={...handler,workflowStep:{...handler.workflowStep!,mode:'reconciled-effect' as const}},f=fixture(),p=f.packet();let executions=0,reconciliations=0;
 for(const status of ['unknown','succeeded','not-executed'] as const){
  const consumer={handle:()=>{executions++;return {output:{amount:2}};},reconcile:async()=>{reconciliations++;return status==='succeeded'?{status,result:{output:{amount:1}}}:{status};}};
  const run=()=>executeWorkflowEventConsumer(consumer,contract,p.event,{eventId:p.event.id,deliveryId:'delivery',subscriptionCode:handler.code,traceId:p.event.id,idempotencyKey:p.step.executionId,causationDepth:2});
  if(status==='unknown')await assert.rejects(run,/原执行结果未知/);else assert.equal((await run()).output.amount,status==='succeeded'?1:2);
 }
 assert.equal(reconciliations,3);assert.equal(executions,1);
});
test('volatile receipts cannot complete steps and undeclared metadata fails registration',async()=>{
 const f=fixture(),p=f.packet();
 await assert.rejects(()=>new InMemoryOpenXiangdaEventReceiptStore().complete({tenantId:'tenant',appCode:'steps',environmentKey:'preproduction',subscriptionCode:handler.code,eventId:p.event.id,deliveryId:'delivery'},{executionId:p.step.executionId,handlerVersion:1,expectedFactRevision:2,inputDigest:p.step.inputDigest,output:{amount:1}}),/平台持久回执/);
 assert.throws(()=>OpenXiangdaEventHandler({...handler,workflowStep:{...handler.workflowStep!,unsafe:true}} as any),/合同不合法/);
});
