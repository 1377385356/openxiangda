import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkflowHumanNode, workflowAuthoringCatalog, workflowCanvasBindingKey, validateWorkflowCanvasHuman } from '../src/native-compiler/workflow-authoring.js';
import { validateWorkflowDesignerCapabilities } from '../src/native-compiler/workflow-designer.js';
import { validateWorkflowBusinessSteps, compileWorkflowBusinessStepHandlers } from '../src/native-compiler/workflow-business-step.js';
import { evaluateWorkflowExpression } from '../src/native-compiler/workflow-expression.js';
import { workflowReturnEligibility } from '../src/native-compiler/workflow-return-eligibility.js';
function fixture(): any { return {schemaVersion:'openxiangda.workflow-definition/v2',code:'purchase',title:'采购',acceptedCommandDeactivationPolicy:'finish-pinned',subject:{resourceCode:'purchase',factProjection:{}},startAt:'done',inputSchema:{type:'object',additionalProperties:false,properties:{amount:{type:'number'}}},taskPages:{review:{title:'审批表单',fields:[{code:'note'},{code:'amount',readonly:true}]}},nodes:{done:{id:'done',kind:'end',title:'完成',outcome:'approved'}}}; }
const binding = () => ({schemaVersion:'openxiangda.workflow-binding/v2',workflowCode:'purchase',bindings:{}} as any);
test('approval, handling and CC can be inserted without an existing human template',()=>{
 for(const kind of ['approval','handle','cc'] as const){const base=fixture(),next=structuredClone(base),bindings=binding();next.nodes.fresh=createWorkflowHumanNode('fresh',kind,'新增','done');next.startAt='fresh';bindings.bindings[workflowCanvasBindingKey('fresh')]={provider:'fixed_users',users:['member']};assert.deepEqual(validateWorkflowDesignerCapabilities(base,next,binding(),bindings),[]);}
});
test('missing members are draft diagnostics, not a fabricated identity or executable binding',()=>{
 const base=fixture(),next=structuredClone(base),bindings=binding();next.nodes.fresh=createWorkflowHumanNode('fresh','approval','审批','done');next.startAt='fresh';bindings.bindings.canvas_fresh={provider:'fixed_users',users:[]};
 assert.deepEqual(validateWorkflowDesignerCapabilities(base,next,binding(),bindings,{allowIncomplete:true}),[]);assert.ok(validateWorkflowDesignerCapabilities(base,next,binding(),bindings).length);
});
test('page ceilings and required opinions cannot be escalated by a canvas node',()=>{
 const base=fixture(),catalog=workflowAuthoringCatalog(base,binding()),node:any=createWorkflowHumanNode('fresh','approval','审批','done','review',catalog.taskPages);
 assert.deepEqual(validateWorkflowCanvasHuman(node,catalog),[]);assert.equal(node.fieldPolicy.fields.note,'edit');assert.equal(node.fieldPolicy.fields.amount,'readonly');assert.ok(node.allowedOperations.includes('save_form'));
 for(const patch of [{fieldPolicy:{fields:{amount:'edit'}}},{requiredOperations:[]},{administration:{modes:['all']}},{operationPolicy:{reject:{opinion:'optional',minimumOpinion:'none'}}}])assert.ok(validateWorkflowCanvasHuman({...node,...patch},catalog).length);
 const readonly:any=createWorkflowHumanNode('plain','approval','审批','done');assert.ok(!readonly.allowedOperations.includes('save_form'));
});
test('an unused released business capability supplies a handler manifest and allows typed remapping only',()=>{
 const base=fixture(),step={title:'预算校验',handler:{code:'budget-v1',version:1,mode:'pure'},inputSchema:{type:'object',additionalProperties:false,properties:{amount:{type:'number'}},required:['amount']},outputSchema:{type:'object',additionalProperties:false,properties:{available:{type:'boolean'}},required:['available']}};
 base.authoring={businessSteps:[step]};assert.deepEqual(validateWorkflowBusinessSteps(base),[]);assert.equal(compileWorkflowBusinessStepHandlers([base])['budget-v1']?.version,1);
 const next=structuredClone(base);next.nodes.step={...structuredClone(step),id:'step',kind:'action',next:'done',inputs:{amount:{source:'fact',path:'amount'}}};next.startAt='step';assert.deepEqual(validateWorkflowDesignerCapabilities(base,next,binding(),binding()),[]);
 next.nodes.step.handler.version=2;assert.ok(validateWorkflowDesignerCapabilities(base,next,binding(),binding()).some(error=>error.includes('STEP_UNRELEASED')));
});
test('source-owned bindings and released handler/page contracts cannot be overwritten',()=>{
 const base=fixture(),original=binding();original.bindings.owner={provider:'fixed_users',users:['original']};const next=structuredClone(original);next.bindings.owner.users=['replacement'];assert.ok(validateWorkflowDesignerCapabilities(base,base,original,next).some(error=>error.includes('BINDING_CODE_OWNED')));
});
test('condition evaluation preserves runtime comparisons, missing facts, priority and bounds',()=>{
 const condition:any={op:'and',values:[{op:'gte',left:{op:'path',path:'amount'},right:{op:'literal',value:50000}},{op:'in',left:{op:'path',path:'category'},right:{op:'literal',value:['equipment','software']}}]};
 assert.equal(evaluateWorkflowExpression(condition,{amount:86000,category:'equipment'}),true);assert.equal(evaluateWorkflowExpression(condition,{amount:3200,category:'equipment'}),false);assert.equal(evaluateWorkflowExpression(condition,{}),false);
 assert.throws(()=>evaluateWorkflowExpression({op:'path',path:'constructor.prototype'},{}));let nested:any={op:'literal',value:true};for(let i=0;i<40;i++)nested={op:'not',value:nested};assert.throws(()=>evaluateWorkflowExpression(nested,{}),/LIMIT/);
});
test('return eligibility explains downstream and cross-branch exclusions',()=>{
 const d=fixture();d.startAt='a';d.nodes.a={id:'a',kind:'approval',title:'A',binding:'people',mode:'single',onApprove:'b',onReject:'done'};d.nodes.b={...d.nodes.a,id:'b',title:'B',onApprove:'done'};
 assert.equal(workflowReturnEligibility(d,'b','a').allowed,true);assert.equal(workflowReturnEligibility(d,'a','b').allowed,false);
});
