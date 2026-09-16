import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  SCHEMA_VERSIONS, eventDeliverySignatureContentV2, sha256Digest,
  type AppEventHandlerContract, type EventActor,
} from 'openxiangda-contracts';
import { OpenXiangdaEventContext } from '../src/event-context.js';
import { InMemoryOpenXiangdaEventReceiptStore, OpenXiangdaEventReceiver } from '../src/events.js';
import type { OpenXiangdaModuleOptions } from '../src/types.js';

const id='11111111-1111-4111-8111-111111111111';
const contract: AppEventHandlerContract = {
  code: 'result-projector', endpointPath: '/__platform/events/result-projector',
  eventTypes: ['openxiangda.data.record.updated.v2'], dataSchemaVersions: ['2.0.0'],
  maxBodyBytes: 65_536, receiptProtocolVersion: 2,
};
const manifest={schemaVersion:SCHEMA_VERSIONS.eventHandlerManifest,appCode:'actor-test',handlers:[contract]};
const options:OpenXiangdaModuleOptions={
  appCode:'actor-test', environmentKey:'preproduction', platformBaseUrl:'https://actor.invalid/service',
  eventSigningSecret:'synthetic-local-signing-key', eventHandlerManifest:manifest,
};
const basic:EventActor={principalType:'user',subjectId:'synthetic-user'};
const named:EventActor={principalType:'application',subjectId:'application:actor-test:business-action',
  initiatedBy:{principalType:'user',subjectId:'synthetic-user'},
  businessAction:{code:'reservation.cancel',requiredCapability:'app:actor-test:reservation:cancel',
    proof:'gateway-invocation',invocationTokenId:id,deploymentRunId:id,backendRevisionId:id}};
const maintenance:EventActor={principalType:'application',subjectId:'application:actor-test:repair',initiatedBy:null,
  platformMaintenance:{kind:'sealed-data-repair',manifestSha256:'a'.repeat(64),actionIndex:0,
    actionKind:'native-update',resourceCode:'reservations',recordId:id}};
function packet(actor:unknown){
  const event={specversion:'1.0',id,type:contract.eventTypes[0],source:'/applications/actor-test/data-resources/reservations',
    subject:`/records/${id}`,time:new Date().toISOString(),tenantid:'tenant-test',appcode:'actor-test',
    environment:'preproduction',datacontenttype:'application/json',schemaversion:'2.0.0',
    data:{resourceCode:'reservations',recordId:id,operation:'updated',revision:4,
      changedFields:['cancelReason','status'],changes:{status:{before:{value:'approved'},after:{value:'cancelled'}},cancelReason:{before:null,after:'synthetic'}},
      projection:{status:{value:'cancelled'}},actor,cause:{eventId:null,subscriptionCode:null,depth:0}}};
  const rawBody=Buffer.from(JSON.stringify(event)),timestamp=String(Math.floor(Date.now()/1000));
  const digest=sha256Digest(manifest),deliveryId=`${id}:delivery`;
  const signature=createHmac('sha256',options.eventSigningSecret!).update(eventDeliverySignatureContentV2({
    timestamp,signingKeyVersion:'1',deliveryId,eventId:id,subscriptionCode:contract.code,handlerManifestDigest:digest,rawBody:rawBody.toString('utf8'),
  })).digest('hex');
  return {rawBody,headers:{'content-type':'application/cloudevents+json','x-openxiangda-subscription-code':contract.code,
    'x-openxiangda-timestamp':timestamp,'x-openxiangda-signature':`v2=${signature}`,'x-openxiangda-delivery-id':deliveryId,
    'x-openxiangda-event-id':id,'x-openxiangda-signing-key-version':'1','x-openxiangda-handler-manifest-digest':digest}};
}
function fixture(){
  let claims=0,effects=0;
  const receipts=new InMemoryOpenXiangdaEventReceiptStore(),claim=receipts.claim.bind(receipts);
  receipts.claim=async context=>{claims++;return claim(context);};
  const receiver=new OpenXiangdaEventReceiver(options,receipts,new OpenXiangdaEventContext());
  return {counts:()=>({claims,effects}),deliver:async(p:ReturnType<typeof packet>)=>receiver.accept(contract,p.headers,p.rawBody,event=>{effects++;return event.data.actor;})};
}
test('signed native events retain basic, named, event and sealed-repair audit actors with duplicate suppression',async()=>{
  const connected=structuredClone(named);connected.businessAction!.proof='connected-development';connected.businessAction!.devSessionId=id;
  const upload=structuredClone(named);upload.businessAction!.proof='operation-file-upload';upload.businessAction!.managedFile={resourceCode:'reservations',fieldCode:'proof',intent:'create'};
  for(const actor of [basic,named,connected,upload,maintenance,{principalType:'application',subjectId:'application:actor-test:event',initiatedBy:null}]){
    const f=fixture(),p=packet(actor);
    assert.equal((await f.deliver(p)).accepted,true);assert.equal((await f.deliver(p)).duplicate,true);
    assert.deepEqual(f.counts(),{claims:2,effects:1});
  }
});
test('malformed or credential-shaped audit metadata fails before receipt claim and effects',async()=>{
  const invalid=[
    {...named,principalType:'user'}, {...named,accessToken:'forbidden'},
    {...named,initiatedBy:{principalType:'application',subjectId:'other'}},
    {...named,initiatedBy:{principalType:'user',subjectId:'x'.repeat(256)}},
    {...named,businessAction:{...named.businessAction,clientSecret:'forbidden'}},
    {...named,businessAction:{...named.businessAction,proof:'untrusted'}},
    {...named,businessAction:{...named.businessAction,code:'x'.repeat(129)}},
    {...named,businessAction:{...named.businessAction,managedFile:{resourceCode:'reservations',fieldCode:'proof',intent:'create',headers:{}}}},
    {...maintenance,platformMaintenance:{...maintenance.platformMaintenance,manifestSha256:'invalid'}},
    {...maintenance,platformMaintenance:{...maintenance.platformMaintenance,actionIndex:-1}},
    {...maintenance,platformMaintenance:{...maintenance.platformMaintenance,actionKind:'sql'}},
  ];
  for(const actor of invalid){const f=fixture();await assert.rejects(f.deliver(packet(actor)));assert.deepEqual(f.counts(),{claims:0,effects:0});}
});
test('valid provenance never substitutes for the original event signature',async()=>{
  const f=fixture(),p=packet(named);p.headers['x-openxiangda-signature']=`v2=${'0'.repeat(64)}`;
  await assert.rejects(f.deliver(p));assert.deepEqual(f.counts(),{claims:0,effects:0});
});
