import assert from 'node:assert/strict';
import test from 'node:test';
import { connectedDevelopmentFeedback, connectedDevelopmentDetail } from '../src/connected-development-feedback.js';
import { OpenXiangdaApplicationServices } from '../src/application-services.js';
import { ControlPlaneError } from '../src/control-plane-client.js';
const cases = [
  ['test-deployment-required','review-test-deployment','dev.review-test-deployment','openxiangda docs development'],
  ['restart-development','restart-development','dev.restart','openxiangda dev'],
  ['inspect-original-run','inspect-original-configuration-run','dev.inspect-original-run','openxiangda docs application-operations'],
  ['fix-configuration','fix-local-configuration','dev.fix-configuration','openxiangda check'],
] as const;
for (const [category,nextAction,actionCode,command] of cases) test(`projects ${category} without replaying unchanged input`,()=>{
  const data={pointer:'/configuration/authz',configurationRunId:'original-run',causeCode:'ORIGINAL_CAUSE',resourceCode:'orders',fieldCode:'amount',developmentFeedback:{schemaVersion:'openxiangda.connected-development-feedback/v1',category,nextAction,canRetryUnchanged:false,command:'untrusted command'}};
  const error=new ControlPlaneError(503,'OPENXIANGDA_CONNECTED_DEV_CONFIGURATION_PREPARE_FAILED','domain refusal',data,{path:'/dev-sessions/configuration',requestId:'original-request',retryable:true});
  const result=(new OpenXiangdaApplicationServices() as any).connectedDevelopmentFailure(error,'/workspace');
  assert.equal(result.actionCode,actionCode);assert.equal(result.command,command);assert.equal(result.retryable,false);
  assert.equal(result.path,data.pointer);assert.equal(result.details.path,'/dev-sessions/configuration');
  assert.equal(result.details.configurationRunId,'original-run');assert.equal(result.details.causeCode,'ORIGINAL_CAUSE');assert.equal(result.details.requestId,'original-request');
  assert.equal(JSON.stringify(result).includes('untrusted command'),false);
});
test('unknown or malformed feedback cannot invent a deployment or retry command',()=>{
  for(const value of [null,{},[],{schemaVersion:'future',category:'fix-configuration'}, {schemaVersion:'openxiangda.connected-development-feedback/v1',category:'constructor',nextAction:'anything',canRetryUnchanged:false}, {schemaVersion:'openxiangda.connected-development-feedback/v1',category:'fix-configuration',nextAction:'restart-development',canRetryUnchanged:false}]) {
    assert.equal(connectedDevelopmentFeedback(value),undefined);
    const error=new ControlPlaneError(409,'OPENXIANGDA_CONNECTED_DEV_FUTURE','unknown',{developmentFeedback:value});
    const result=(new OpenXiangdaApplicationServices() as any).connectedDevelopmentFailure(error,'/workspace');
    assert.equal(result.actionCode,'dev.inspect');assert.equal(result.command,'openxiangda docs development');
  }
});
test('bounds optional diagnostic detail and rejects control characters',()=>{
  assert.equal(connectedDevelopmentDetail('a'.repeat(257)),undefined);
  assert.equal(connectedDevelopmentDetail('line\nbreak'),undefined);
  assert.equal(connectedDevelopmentDetail({token:'private'}),undefined);
  assert.equal(connectedDevelopmentDetail('original-run'),'original-run');
});
