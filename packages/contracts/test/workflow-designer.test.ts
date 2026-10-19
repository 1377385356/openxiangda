import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowDefinition } from '../src/types.js';
import { editWorkflowDesignerDefinition, validateWorkflowDesignerDocument, validateWorkflowDesignerCapabilities,classifyWorkflowAdoption } from '../src/native-compiler/workflow-designer.js';
const definition = (): WorkflowDefinition => ({ schemaVersion: 'openxiangda/workflow-definition@2', code: 'test', title: '测试', acceptedCommandDeactivationPolicy: 'finish-pinned', subject: { resourceCode: 'orders', businessKeyField: 'id', factProjection: {} }, startAt: 'review', inputSchema: { type: 'object', additionalProperties: false, properties: { amount: { type: 'number' }, category: { type: 'string' } } }, readability: { variables: { amount: { label: '金额' }, category: { label: '分类' } } }, nodes: { review: { id: 'review', kind: 'approval', title: '审批', binding: 'people', mode: 'single', onApprove: 'done', onReject: 'done' }, done: { id: 'done', kind: 'end', title: '结束', outcome: 'approved' } } } as unknown as WorkflowDefinition);
test('insert affects only selected decision, preserves IDs and source; remove reconnects', () => {
  const source = definition();
  const next = editWorkflowDesignerDefinition(source, { type: 'insert', from: 'review', target: 'done', node: { id: 'copy', kind: 'cc', title: '抄送', binding: 'people', next: 'done', emptyPolicy: 'block' } });
  assert.equal((next.nodes.review as any).onApprove, 'copy'); assert.equal((next.nodes.review as any).onReject, 'done'); assert.equal((source.nodes.review as any).onApprove, 'done');
  assert.deepEqual(editWorkflowDesignerDefinition(next, { type: 'remove', nodeId: 'copy' }), source);
});
test('reject missing targets, cycles, orphan nodes and numeric/string comparisons', () => {
  const source = definition();
  const next = editWorkflowDesignerDefinition(source, { type: 'insert', from: 'review', target: 'done', node: { id: 'branch', kind: 'condition', title: '金额分支', branches: [{ when: { op: 'gte', left: { op: 'path', path: 'amount' }, right: { op: 'literal', value: 50 } }, target: 'done' }], otherwise: 'done' } });
  assert.deepEqual(validateWorkflowDesignerDocument(next), []);
  (next.nodes.branch as any).branches[0].when.right.value = '50'; assert.ok(validateWorkflowDesignerDocument(next).some(error => error.includes('CONDITION_TYPE')));
  (next.nodes.branch as any).otherwise = 'review'; assert.ok(validateWorkflowDesignerDocument(next).some(error => error.includes('CYCLE')));
  (next.nodes.branch as any).otherwise = 'missing'; assert.ok(validateWorkflowDesignerDocument(next).some(error => error.includes('TARGET_MISSING')));
});
test('adoption honours holds, missing current nodes, fact types and deferred effects', () => {
  const source = definition(), target = definition();
  assert.equal(classifyWorkflowAdoption(source, target, { currentNodeId: 'review', facts: {} }).outcome, 'eligible');
  assert.equal(classifyWorkflowAdoption(source, target, { currentNodeId: 'review', facts: {}, held: true }).outcome, 'held');
  assert.equal(classifyWorkflowAdoption(source, target, { currentNodeId: 'review', facts: {}, businessStepPending: true }).outcome, 'deferred');
  delete target.nodes.review; assert.equal(classifyWorkflowAdoption(source, target, { currentNodeId: 'review', facts: {} }).outcome, 'excepted');
});
test('malformed or oversized condition groups fail with diagnostics', () => {
  const next = definition();
  (next.nodes.review as any) = { id: 'review',kind: 'condition',branches: 'invalid',otherwise: 'done' };
  assert.ok(validateWorkflowDesignerDocument(next).some(error => error.includes('BRANCH_INVALID')));
});
test('new future condition input must exist with the canonical fact type', () => {
  const source = definition();source.inputSchema.required = ['amount'];
  const target = editWorkflowDesignerDefinition(source,{ type: 'insert',from: 'review',target: 'done',node: { id: 'branch',kind: 'condition',branches: [{ when: { op: 'gt',left: { op: 'path',path: 'amount' },right: { op: 'literal',value: 100 } },target: 'done' }],otherwise: 'done' } });
  assert.equal(classifyWorkflowAdoption(source,target,{ currentNodeId: 'review',facts: {} }).outcome,'excepted');
  assert.equal(classifyWorkflowAdoption(source,target,{ currentNodeId: 'review',facts: { amount: '200' } }).outcome,'excepted');
  assert.equal(classifyWorkflowAdoption(source,target,{ currentNodeId: 'review',facts: { amount: 200 } }).outcome,'eligible');
});

test('canonical drafts retain mandatory forward actions and legacy code-required opinions', () => {
  const base = definition();(base.nodes.review as any).operationPolicy = { approve: { commentRequired: true } };
  const binding: any = { workflowCode: 'test',schemaVersion: 'openxiangda.workflow-binding/v2',bindings: { people: { provider: 'initiator' } } };
  const weaker = structuredClone(base);(weaker.nodes.review as any).operationPolicy = { approve: { opinion: 'none' } };
  assert.ok(validateWorkflowDesignerCapabilities(base,weaker,binding,binding).some(error => error.includes('minimumOpinion')));
  (weaker.nodes.review as any).allowedOperations = ['reject'];
  assert.ok(validateWorkflowDesignerCapabilities(base,weaker,binding,binding).some(error => error.includes('REQUIRED_ACTION')));
});

test('nullable and optional declared facts retain their presence semantics during adoption', () => {
  const source = definition();source.inputSchema.properties = { note: { type: ['string','null'] } };source.readability = { variables: { note: { label: '说明' } } };
  const target = editWorkflowDesignerDefinition(source,{ type: 'insert',from: 'review',target: 'done',node: { id: 'branch',kind: 'condition',branches: [{ when: { op: 'exists',value: { op: 'path',path: 'note' } },target: 'done' }],otherwise: 'done' } });
  assert.deepEqual(validateWorkflowDesignerDocument(target),[]);
  for (const facts of [{},{note:null},{note:'说明'}]) assert.equal(classifyWorkflowAdoption(source,target,{ currentNodeId:'review',facts }).outcome,'eligible');
});

test('new human node can edit handling defaults within its released template authority', () => {
  const base = definition();
  Object.assign(base.nodes.review, {
    fieldPolicy: { title: 'read', amount: 'edit' },
    requiredOperations: ['approve'],
    allowedOperations: ['approve', 'reject', 'save_form'],
    administration: { modes: ['single', 'all'] },
    operationPolicy: { approve: { minimumOpinion: 'optional', opinion: 'optional', label: '同意' }, reject: { commentRequired: true, label: '拒绝申请' } },
  });
  const template = base.nodes.review as any;
  const binding: any = { workflowCode: 'test', schemaVersion: 'openxiangda.workflow-binding/v2', bindings: { people: { provider: 'initiator' } } };
  const added = editWorkflowDesignerDefinition(base, { type: 'insert', from: 'review', target: 'done', node: { ...structuredClone(template), id: 'added' } });
  const human = added.nodes.added as any;
  human.mode = 'all';
  human.operationPolicy.approve.label = '确认大额申请';
  human.operationPolicy.approve.opinion = 'required';
  human.operationPolicy.save_form = { label: '保存资料' };
  assert.deepEqual(validateWorkflowDesignerCapabilities(base, added, binding, binding), []);
  for (const change of [
    (value: any) => { value.operationPolicy.reject = { opinion: 'optional' }; },
    (value: any) => { value.operationPolicy.approve.minimumOpinion = 'none'; },
    (value: any) => { value.mode = 'sequence'; },
    (value: any) => { value.fieldPolicy.title = 'edit'; },
    (value: any) => { value.requiredOperations = []; },
    (value: any) => { value.allowedOperations = ['reject']; },
  ]) {
    const refused = structuredClone(added); change(refused.nodes.added);
    assert.ok(validateWorkflowDesignerCapabilities(base, refused, binding, binding).length > 0);
  }
});


test('published node cannot replace its code-owned binding with a canvas-owned key', () => {
  const base = definition();
  const original: any = { workflowCode: 'test', schemaVersion: 'openxiangda.workflow-binding/v2', bindings: { people: { provider: 'initiator' } } };
  const next = structuredClone(base);
  (next.nodes.review as any).binding = 'canvas_review';
  const changed = { ...original, bindings: { ...original.bindings, canvas_review: { provider: 'fixed_users', users: ['replacement'] } } };
  const errors = validateWorkflowDesignerCapabilities(base, next, original, changed);
  assert.ok(errors.includes('WORKFLOW_DESIGNER_BINDING_CODE_OWNED:review'));
  assert.ok(errors.includes('WORKFLOW_DESIGNER_BINDING_UNRELEASED:canvas_review'));
});

test('existing node draft bindings use declared administration and released parameter bounds',()=>{
  const source=definition();const human=source.nodes.review as any;human.administration={assigneeProviders:['fixed_users','app_role'],modes:['single'],operations:['approve','reject']};
  const bindings:any={schemaVersion:'openxiangda.workflow-binding/v2',workflowCode:'test',bindings:{people:{provider:'fixed_users',users:['first']}}};
  const next=structuredClone(bindings);next.bindings.people={provider:'fixed_users',users:['second']};
  assert.deepEqual(validateWorkflowDesignerCapabilities(source,source,bindings,next),[]);
  next.bindings.people={provider:'department_supervisor',departmentIdFrom:'unknown',level:3};
  assert.ok(validateWorkflowDesignerCapabilities(source,source,bindings,next).length);
  human.administration.assigneeProviders=['app_role'];next.bindings.people={provider:'fixed_users',users:['second']};
  assert.ok(validateWorkflowDesignerCapabilities(source,source,bindings,next).some(error=>error.includes('PROVIDER_READONLY')));
});

test('department supervisor draft parameters admit declared platform department facts only',()=>{
  const source=definition() as any;source.organizationContext={department:{source:'choose_if_multiple',required:true}};
  source.authoring={peopleSources:[{code:'department',title:'Department',entry:{provider:'department_supervisor',departmentIdFrom:'organizationContext.departmentId',level:1,min:1,max:1,fallbackToAncestorSupervisor:false},parameters:{level:{values:[1,2,3]}}}]};
  const bindings:any={schemaVersion:'openxiangda.workflow-binding/v2',workflowCode:'test',bindings:{people:structuredClone(source.authoring.peopleSources[0].entry)}};
  const next=structuredClone(bindings);next.bindings.people.level=2;
  const catalog:any={appVersionId:'test',digest:'test',steps:[],taskPages:{},peopleSources:bindings.bindings,nativePeopleAuthoring:true,peopleSourceTemplates:source.authoring.peopleSources};
  assert.deepEqual(validateWorkflowDesignerCapabilities(source,source,bindings,next,{catalog}),[]);
  delete source.organizationContext;
  assert.ok(validateWorkflowDesignerCapabilities(source,source,bindings,next,{catalog}).some(error=>error.includes('FACT_UNAVAILABLE')));
});
