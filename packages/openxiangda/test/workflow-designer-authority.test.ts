import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowDesignerAllowedActions, isWorkflowDesignerAuthorityLoss, isWorkflowDesignerAuthorityBusy } from '../src/browser/components/workflow/workflow-designer-authority';

test('old server only grants full controls to bootstrap-confirmed native super-admin', () => {
  assert.deepEqual(workflowDesignerAllowedActions({},false),{actions:['definition.read'],legacy:true});
  assert.deepEqual(workflowDesignerAllowedActions({},true).actions,['definition.read','draft.edit','publication.publish','handling.configure']);
});
test('explicit published/draft discriminators and closed actions control the UI', () => {
  assert.deepEqual(workflowDesignerAllowedActions({view:'draft',authority:{actions:['publication.publish']}},false).actions,['definition.read','publication.publish']);
  assert.deepEqual(workflowDesignerAllowedActions({view:'published',authority:{actions:['draft.edit','publication.publish','handling.configure']}},false).actions,['definition.read','handling.configure']);
  for (const value of [{authority:null},{view:'draft',authority:{actions:['unknown']}},{view:'unknown',authority:{actions:['draft.edit']}}])
    assert.deepEqual(workflowDesignerAllowedActions(value,true).actions,[]);
});
test('authority busy is retryable and never interpreted as revocation', () => {
  assert.equal(isWorkflowDesignerAuthorityLoss({status:503,code:'WORKFLOW_DESIGNER_AUTHORITY_BUSY'}),false);
  assert.equal(isWorkflowDesignerAuthorityLoss({status:403,code:'WORKFLOW_DESIGNER_AUTHORITY_REQUIRED'}),true);
  assert.equal(isWorkflowDesignerAuthorityLoss({status:404,code:'WORKFLOW_DESIGNER_NOT_FOUND'}),true);
});

test('only explicit authority busy is a definite retryable refusal', () => {
  for (const code of ['WORKFLOW_DESIGNER_AUTHORITY_BUSY','OPENXIANGDA_ACTOR_AUTHORITY_BUSY'])
    assert.equal(isWorkflowDesignerAuthorityBusy({status:503,code}),true);
  assert.equal(isWorkflowDesignerAuthorityBusy({status:503,code:'SERVER_UNAVAILABLE'}),false);
  assert.equal(isWorkflowDesignerAuthorityBusy({status:403,code:'WORKFLOW_DESIGNER_AUTHORITY_BUSY'}),false);
});
