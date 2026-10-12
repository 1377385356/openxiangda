import { createWorkflowHumanNode } from '../src/native-compiler/workflow-authoring.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { WorkflowSourceBundle } from '../src/native-compiler/workflow-source-sync.js';
import { workflowSourceReferences,validateWorkflowSourceBundle,workflowSourceImportDrift,workflowSourceStatus,classifyWorkflowSourceDeployment } from '../src/native-compiler/workflow-source-sync.js';
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,stable(value[key])])) : value;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const bundle = (): WorkflowSourceBundle => {
  const definition: any = { schemaVersion: 'openxiangda.workflow-definition/v2',code: 'review',title: 'Review',startAt: 'a',acceptedCommandDeactivationPolicy: 'finish-pinned',subject: { resourceCode: 'requests',factProjection: {} },inputSchema: { type: 'object',additionalProperties: false,properties: {} },
    nodes: { a: { id: 'a',kind: 'approval',title: 'A',binding: 'people',mode: 'single',onApprove: 'done',onReject: 'done',taskPageCode: 'review' },done: { id: 'done',kind: 'end',title: 'Done',outcome: 'approved' } },taskPages: { review: { title: 'Review',fields: [{ code: 'note' }] } } };
  const binding: any = { schemaVersion: 'openxiangda.workflow-binding/v2',workflowCode: 'review',bindings: { people: { provider: 'fixed_users',users: ['declared-person'] } } };
  const references = workflowSourceReferences(definition,binding,digest),handling: WorkflowSourceBundle['handling'] = { a: { assignee: { kind: 'named_people',count: 2 },operations: { save_form: { enabled: true,label: '保存' } } } };
  return { schemaVersion: 'openxiangda.workflow-source-bundle/v1',appCode: 'app',workflowCode: 'review',origin: { environmentKey: 'production',headRevision: 14,definitionVersion: 13,bindingVersion: 9,definitionDigest: digest(definition),bindingDigest: digest(binding),handlingDigest: digest(handling),catalogDigest: digest(references) },definition,binding,references,handling };
};
test('canonical fixed-user source references survive while handling exports only counts', () => {
  const value = bundle(),before = structuredClone(value);
  assert.deepEqual(validateWorkflowSourceBundle(value,digest),[]);
  assert.deepEqual(value.binding.bindings.people?.users,['declared-person']);
  assert.deepEqual(value.handling.a?.assignee,{ kind: 'named_people',count: 2 });
  assert.deepEqual(value,before);
  assert.equal(JSON.stringify(value).includes('environmentId'),false);
});
test('tampered documents, missing catalog contracts and named-person leakage refuse import', () => {
  const value = bundle();value.definition.title='Changed';
  assert.ok(validateWorkflowSourceBundle(value,digest).includes('WORKFLOW_BUNDLE_CORRUPT'));
  const unsafe = bundle();(unsafe.handling.a!.assignee as any).userIds = ['runtime-person'];unsafe.origin.handlingDigest=digest(unsafe.handling);
  assert.ok(validateWorkflowSourceBundle(unsafe,digest).includes('WORKFLOW_BUNDLE_HANDLING_INVALID'));
  const missing = bundle(),local = structuredClone(missing.definition);delete local.taskPages!.review;
  assert.ok(workflowSourceImportDrift(local,missing.binding,missing,digest).some(error => error.includes('CODE_OWNED_DRIFT')));
  const malformed = bundle();(malformed.definition.nodes.a as any) = { id: 'a',kind: 'action' };
  assert.ok(validateWorkflowSourceBundle(malformed,digest).includes('WORKFLOW_BUNDLE_CORRUPT'));
});
test('digest-based status has no foreign head-revision dependency', () => {
  const base = { definitionDigest: 'a',bindingDigest: 'b' },declared = { definitionDigest: 'new',bindingDigest: 'b' };
  assert.equal(workflowSourceStatus({ base,declared: base,head: base }),'in_sync');
  assert.equal(workflowSourceStatus({ base,declared,head: base }),'ahead');
  assert.equal(workflowSourceStatus({ base,declared: base,head: { ...base,definitionDigest: 'canvas' } }),'behind');
  assert.equal(workflowSourceStatus({ base,declared,head: { ...base,definitionDigest: 'canvas' } }),'diverged');
  assert.equal(workflowSourceStatus({ base,declared,head: null }),'not_active');
});
test('unchanged application workflow preserves a canvas head; unrelated revisions do not block a fast-forward', () => {
  const original = { definitionDigest: 'a',bindingDigest: 'b' },canvas = { definitionDigest: 'canvas',bindingDigest: 'b' },candidate = { definitionDigest: 'candidate',bindingDigest: 'b' };
  assert.equal(classifyWorkflowSourceDeployment({ declared: original,activeDeclaration: original,head: canvas }),'preserve');
  assert.equal(classifyWorkflowSourceDeployment({ declared: candidate,base: original,activeDeclaration: original,head: original }),'advance');
  assert.equal(classifyWorkflowSourceDeployment({ declared: candidate,base: canvas,head: original }),'diverged');
  assert.equal(classifyWorkflowSourceDeployment({ declared: candidate,head: candidate }),'reuse');
});

test('ordinary source edits use the active application declaration as a base before the first canvas import', () => {
  const original={ definitionDigest: 'original',bindingDigest: 'people' },changed={ definitionDigest: 'source-edit',bindingDigest: 'people' };
  assert.equal(workflowSourceStatus({ declared: changed,activeDeclaration: original,head: original }),'ahead');
  assert.equal(workflowSourceStatus({ declared: original,activeDeclaration: original,head: changed }),'behind');
  assert.equal(workflowSourceStatus({ declared: changed,activeDeclaration: original,head: { ...changed,definitionDigest: 'other-edit' } }),'diverged');
});

test('canvas source import preserves blank bindings and consumes unused released steps',()=>{
 const value=bundle(),local=structuredClone(value.definition),localBinding=structuredClone(value.binding);
 const step:any={title:'预算校验',handler:{code:'budget-v1',version:1,mode:'pure'},inputSchema:{type:'object',additionalProperties:false,properties:{note:{type:'string'}}},outputSchema:{type:'object',additionalProperties:false,properties:{valid:{type:'boolean'}}}};
 local.authoring={businessSteps:[step]};value.definition.authoring=structuredClone(local.authoring);
 value.definition.nodes.fresh=createWorkflowHumanNode('fresh','approval','新增审批','a');
 value.binding.bindings.canvas_fresh={provider:'app_role',roleCode:'finance'};
 value.definition.nodes.step={...structuredClone(step),id:'step',kind:'action',next:'fresh',inputs:{note:{source:'literal',value:'check'}}};value.definition.startAt='step';
 const refresh=()=>{value.references=workflowSourceReferences(value.definition,value.binding,digest);value.origin.definitionDigest=digest(value.definition);value.origin.bindingDigest=digest(value.binding);value.origin.catalogDigest=digest(value.references);};
 refresh();const before=structuredClone(value);
 assert.deepEqual(workflowSourceImportDrift(local,localBinding,value,digest),[]);assert.deepEqual(value,before);
 (value.definition.nodes.step as any).handler.version=2;refresh();
 assert.ok(workflowSourceImportDrift(local,localBinding,value,digest).some(error=>error.includes('CODE_OWNED_DRIFT')));
});
test('supervisor stop roles are retained in source reference roles',()=>{
 const value=bundle();value.binding.bindings.chain={provider:'supervisor_chain',from:'initiator',until:{roleCode:'director'}};
 assert.deepEqual(workflowSourceReferences(value.definition,value.binding,digest).roles,['director']);
});
