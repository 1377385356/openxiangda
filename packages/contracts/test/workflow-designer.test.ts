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
