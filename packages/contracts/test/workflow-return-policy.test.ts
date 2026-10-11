import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowReturnPolicies, workflowReturnTargetPolicy } from '../src/native-compiler/workflow-return-policy.js';
import { editWorkflowDesignerDefinition, validateWorkflowDesignerDocument } from '../src/native-compiler/workflow-designer.js';
import { validateWorkflowCorrections } from '../src/native-compiler/workflow-correction.js';
function fixture(): any {
  return { schemaVersion: 'openxiangda.workflow-definition/v2', code: 'return', title: '退回', startAt: 'a', inputSchema: { type:'object',additionalProperties:false }, taskPages: { revise: { title:'补正',fields:[{code:'note'}] } }, nodes: {
    a:{id:'a',kind:'approval',title:'A',binding:'people',mode:'single',onApprove:'b',onReject:'rejected'},
    b:{id:'b',kind:'handle',title:'B',binding:'people',mode:'all',next:'c',allowedOperations:['complete'],requiredOperations:['complete']},
    c:{id:'c',kind:'approval',title:'C',binding:'people',mode:'single',onApprove:'done',onReject:'rejected',returnPolicy:{targets:[{nodeId:'a',routes:['replay','resume'],defaultRoute:'resume'},{nodeId:'b',routes:['replay'],defaultRoute:'replay'},{nodeId:'revise',routes:['replay','resume'],defaultRoute:'resume'}]}},
    revise:{id:'revise',kind:'correction',title:'发起人补正',taskPageCode:'revise',next:'a'},
    done:{id:'done',kind:'end',title:'结束',outcome:'approved'},rejected:{id:'rejected',kind:'end',title:'拒绝',outcome:'rejected'},
  } };
}
test('per-target routes include initiator resume while legacy correction stays replay-only',()=>{
 const d=fixture();assert.deepEqual(validateWorkflowReturnPolicies(d),[]);assert.deepEqual(validateWorkflowCorrections(d),[]);
 assert.equal(workflowReturnTargetPolicy(d,d.nodes.c,'revise')?.defaultRoute,'resume');
 assert.deepEqual(workflowReturnTargetPolicy(d,{returnTargets:['revise']},'revise')?.routes,['replay']);
});
test('invalid target, disallowed default, duplicate or conflicting policies refuse',()=>{
 for(const patch of [{nodeId:'c',routes:['replay'],defaultRoute:'replay'},{nodeId:'done',routes:['resume'],defaultRoute:'resume'},{nodeId:'a',routes:['replay'],defaultRoute:'resume'},{nodeId:'a',routes:['resume','resume'],defaultRoute:'resume'}]) {
  const d=fixture();d.nodes.c.returnPolicy.targets=[patch];assert.ok(validateWorkflowReturnPolicies(d).length);
 }
 const d=fixture();d.nodes.c.returnTargets=['a'];assert.ok(validateWorkflowReturnPolicies(d).some(x=>x.includes('CONFLICT')));
});
test('semantic deletion removes the return target from policy and keeps correction reachable',()=>{
 const d=fixture();const next=editWorkflowDesignerDefinition(d,{type:'remove',nodeId:'b'});assert.deepEqual(validateWorkflowDesignerDocument(next),[]);
 assert.deepEqual(next.nodes.c.returnPolicy.targets.map((x:any)=>x.nodeId),['a','revise']);
});
