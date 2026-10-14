import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkflowHumanNode, workflowAuthoringCatalog, workflowCanvasBindingKey, validateWorkflowCanvasHuman, pruneWorkflowCanvasBindings } from '../src/native-compiler/workflow-authoring.js';
import { validateWorkflowDesignerCapabilities } from '../src/native-compiler/workflow-designer.js';
import { validateWorkflowBusinessSteps, compileWorkflowBusinessStepHandlers } from '../src/native-compiler/workflow-business-step.js';
import { evaluateWorkflowExpression } from '../src/native-compiler/workflow-expression.js';
import { validateWorkflowAdministration } from '../src/native-compiler/workflow-node-administration.js';
import { workflowReturnEligibility } from '../src/native-compiler/workflow-return-eligibility.js';
import { createRequire } from 'node:module';
const Ajv2020 = createRequire(new URL('../../devkit-core/package.json', import.meta.url))('ajv/dist/2020.js').default;
import { workflowDefinitionSchema, workflowBindingSchema } from '../src/native-compiler/workflow-schema.js';
function fixture(): any { return {schemaVersion:'openxiangda.workflow-definition/v2',code:'purchase',title:'采购',acceptedCommandDeactivationPolicy:'finish-pinned',subject:{resourceCode:'purchase',factProjection:{amount:'amount'},summaryFields:['amount']},startAt:'done',inputSchema:{type:'object',additionalProperties:false,properties:{amount:{type:'number'}}},taskPages:{review:{title:'审批表单',fields:[{code:'note'},{code:'amount',readonly:true}]}},nodes:{done:{id:'done',kind:'end',title:'完成',outcome:'approved'}}}; }
const binding = () => ({schemaVersion:'openxiangda.workflow-binding/v2',workflowCode:'purchase',bindings:{}} as any);
test('all blank human kinds pass the canonical strict document schemas', () => {
 const ajv = new Ajv2020({strict:false,allErrors:true});
 const validateDefinition = ajv.compile(workflowDefinitionSchema), validateBinding = ajv.compile(workflowBindingSchema);
 for (const kind of ['approval','handle','cc'] as const) {
  const definition=fixture(), bindings=binding();
  definition.nodes.fresh=createWorkflowHumanNode('fresh',kind,'新增','done'); definition.startAt='fresh';
  bindings.bindings.canvas_fresh={provider:'fixed_users',users:[]};
  assert.equal(validateDefinition(definition),true,JSON.stringify(validateDefinition.errors));
  assert.equal(validateBinding(bindings),true,JSON.stringify(validateBinding.errors));
  assert.deepEqual(validateWorkflowAdministration(definition,bindings),[], 'blank nodes must not require a nonexistent role scope');
  definition.nodes.fresh.administration.unknownRuntimeCapability=true;
  assert.equal(validateDefinition(definition),false,'unknown administration properties must remain forbidden');
 }
});
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

test('removing a fresh node prunes its binding without deleting released source entries',()=>{
 const def=fixture(),published=binding();published.bindings.canvas_published={provider:'initiator'};const current=structuredClone(published);current.bindings.canvas_deleted={provider:'fixed_users',users:[]};current.bindings.source_unused={provider:'initiator'};
 const pruned=pruneWorkflowCanvasBindings(def,current,published);assert.equal(pruned.bindings.canvas_deleted,undefined);assert.ok(pruned.bindings.canvas_published);assert.ok(pruned.bindings.source_unused);assert.ok(current.bindings.canvas_deleted);
});

test('a published definition with readability remains saveable after inserting a human node', () => {
 const base=fixture(), next=structuredClone(base), bindings=binding();
 base.readability={variables:{amount:{label:'申请金额',unit:'元'}},logic:[{code:'amount-check',title:'金额检查',description:'检查申请金额',phase:'submission',inputPaths:['amount'],source:{path:'src/amount.ts',symbol:'checkAmount',digest:`sha256:${'a'.repeat(64)}`}}]};
 next.readability=structuredClone(base.readability);
 next.nodes.fresh=createWorkflowHumanNode('fresh','approval','新增审核','done');next.startAt='fresh';bindings.bindings.canvas_fresh={provider:'fixed_users',users:['test-reviewer']};
 const validate=new Ajv2020({strict:false,allErrors:true}).compile(workflowDefinitionSchema);
 assert.equal(validate(next),true,JSON.stringify(validate.errors));
 assert.deepEqual(validateWorkflowDesignerCapabilities(base,next,binding(),bindings),[]);
 const modified=structuredClone(next);modified.readability.logic[0].description='changed';
 assert.ok(validateWorkflowDesignerCapabilities(base,modified,binding(),bindings).includes('WORKFLOW_DESIGNER_CODE_OWNED:readability.logic'));
 for(const change of [
  (d:any)=>{d.readability.unknown=true;},
  (d:any)=>{d.readability.variables.amount.unknown=true;},
  (d:any)=>{d.readability.variables.amount.label=' ';},
  (d:any)=>{d.readability.variables.amount.label='x'.repeat(161);},
  (d:any)=>{d.readability.logic[0].source.digest='untrusted';},
  (d:any)=>{d.readability.logic[0].source.unknown=true;},
  (d:any)=>{d.readability.logic=Array(33).fill(d.readability.logic[0]);},
 ]) {const bad=structuredClone(next);change(bad);assert.equal(validate(bad),false);}
});
