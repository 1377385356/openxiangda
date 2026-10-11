import { defineDataModel, defineApplicationModule, defineResourceForm, defineResourceList } from '../src/compiler/application-model.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest, WORKFLOW_PLATFORM_NOTIFY_INPUT_SCHEMA, WORKFLOW_PLATFORM_NOTIFY_OUTPUT_SCHEMA } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources } from '../src/compiler/bundle.js';
import { defineOpenXiangdaApp } from '../src/compiler/config.js';
function compile(notify: boolean) {
  const definition: any = { schemaVersion:'openxiangda.workflow-definition/v2',code:'review',title:'审批',acceptedCommandDeactivationPolicy:'finish-pinned',startAt: notify ? 'notice' : 'a',subject:{resourceCode:'requests',factProjection:{title:'title'}},inputSchema:{type:'object',additionalProperties:false,properties:{title:{type:'string'}}},nodes:{
    a:{id:'a',kind:'approval',title:'初审',binding:'people',mode:'single',onApprove:'b',onReject:'rejected'},
    b:{id:'b',kind:'approval',title:'复审',binding:'people',mode:'single',onApprove:'done',onReject:'rejected',returnTargets:['a'],returnPolicy:{targets:[{nodeId:'a',routes:['replay','resume'],defaultRoute:'resume'}]}},
    done:{id:'done',kind:'end',title:'完成',outcome:'approved'},rejected:{id:'rejected',kind:'end',title:'拒绝',outcome:'rejected'},
  }};
  if(notify) definition.nodes.notice={id:'notice',kind:'action',title:'通知',next:'a',handler:{code:'platform-notify-v1',version:1,mode:'reconciled-effect'},inputSchema:WORKFLOW_PLATFORM_NOTIFY_INPUT_SCHEMA,outputSchema:WORKFLOW_PLATFORM_NOTIFY_OUTPUT_SCHEMA,inputs:{text:{source:'literal',value:'通知内容'}},notification:{template:'workflow_message',recipients:{provider:'initiator'}}};
  const model=defineDataModel({code:'requests',name:'申请',fields:[{code:'title',label:'事项',type:'text.short'}]});
  const modules=[defineApplicationModule({code:'requests',models:[model],crud:[{model:model.code,form:defineResourceForm(model),list:defineResourceList(model)}]})];
  const config=defineOpenXiangdaApp({app:{code:'workflow-parity',name:'契约校验'},modules,workflows:{definitions:[{version:1,launch:{mode:'standalone'},definition}],bindings:[{version:1,binding:{schemaVersion:'openxiangda.workflow-binding/v2',workflowCode:'review',bindings:{people:{provider:'fixed_users',users:['person']}}}}],activations:[{workflowCode:'review',definitionVersion:1,bindingVersion:1,acceptedCommandDeactivationPolicy:'finish-pinned'}]}});
  const compiled=compileApplicationSources(config);
  compileNativeApplicationConfiguration({appCode:'workflow-parity',configBytes:canonicalJson(compiled.config.value),contractBytes:canonicalJson(compiled.contracts.value),expectedConfigDigest:sha256Digest(compiled.config.value),expectedContractDigest:sha256Digest(compiled.contracts.value)});
  return compiled.contracts.value.eventProducers.map(item=>item.eventType);
}
test('return policies generate exactly the events accepted by the sealed platform compiler',()=>{
  const types=compile(false);assert.ok(!types.includes('openxiangda.workflow.node.skipped.v2'));assert.ok(!types.includes('openxiangda.workflow.node.notified.v2'));
});
test('notification negotiates only its platform event without application step events',()=>{
  const types=compile(true);assert.ok(types.includes('openxiangda.workflow.node.notified.v2'));assert.ok(!types.includes('openxiangda.workflow.step.requested.v2'));
});
