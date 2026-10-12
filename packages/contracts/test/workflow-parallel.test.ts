import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowDefinition } from '../src/types.js';
import { inspectWorkflowParallel, validateWorkflowParallel, workflowPositionActive } from '../src/native-compiler/workflow-parallel.js';
import { classifyWorkflowAdoption, validateWorkflowDesignerDocument, editWorkflowDesignerDefinition } from '../src/native-compiler/workflow-designer.js';

const definition = (): WorkflowDefinition => ({ schemaVersion: 'openxiangda.workflow-definition/v2', code: 'request', title: 'Request', acceptedCommandDeactivationPolicy: 'finish-pinned',
  subject: { resourceCode: 'requests', factProjection: { amount: 'amount', note: 'note' } },
  inputSchema: { type: 'object', additionalProperties: false, properties: { amount: { type: 'number' }, note: { type: 'string' } } }, startAt: 'fork',
  taskPages: { finance: { title: 'Finance', fields: [{ code: 'amount' }] }, legal: { title: 'Legal', fields: [{ code: 'note' }] } },
  nodes: { fork: { id: 'fork', kind: 'parallel', title: 'Review together', join: 'join', branches: [{ id: 'finance', title: 'Finance', target: 'a' }, { id: 'legal', title: 'Legal', target: 'b' }] },
    a: { id: 'a', kind: 'approval', title: 'Finance', binding: 'finance', mode: 'single', onApprove: 'join', onReject: 'rejected', taskPageCode: 'finance', fieldPolicy: { default: 'edit' } },
    b: { id: 'b', kind: 'approval', title: 'Legal', binding: 'legal', mode: 'single', onApprove: 'join', onReject: 'rejected', taskPageCode: 'legal', fieldPolicy: { default: 'edit' } },
    join: { id: 'join', kind: 'join', title: 'All reviews complete', parallel: 'fork', next: 'done' },
    done: { id: 'done', kind: 'end', title: 'Done', outcome: 'approved' }, rejected: { id: 'rejected', kind: 'end', title: 'Rejected', outcome: 'rejected' } } });
test('paired disjoint branches share only their join and rejected end', () => {
  const source = definition(), before = structuredClone(source);
  const inspected = inspectWorkflowParallel(source);
  assert.deepEqual(inspected.errors, []);
  assert.deepEqual(inspected.regions[0]?.branches.map(branch => branch.nodeIds), [['a'], ['b']]);
  assert.deepEqual(validateWorkflowDesignerDocument(source), []);
  assert.deepEqual(source, before);
});
test('rejects overlap, external entry, orphan joins, and early successful completion', () => {
  const overlap = definition(); (overlap.nodes.fork as any).branches[1].target = 'a';
  assert.ok(validateWorkflowParallel(overlap).some(error => error.includes('BODY_OVERLAP')));
  const external = definition(); external.startAt = 'a';
  assert.ok(validateWorkflowParallel(external).some(error => error.includes('EXTERNAL_ENTRY')));
  const orphan = definition(); (orphan.nodes.join as any).parallel = 'missing';
  assert.ok(validateWorkflowParallel(orphan).some(error => error.includes('PAIR_INVALID')));
  const early = definition(); (early.nodes.a as any).onApprove = 'done';
  assert.ok(validateWorkflowParallel(early).some(error => error.includes('BRANCH_END_INVALID')));
});
test('branch returns and editable root fields cannot cross branch authority', () => {
  const returns = definition(); (returns.nodes.a as any).returnTargets = ['b'];
  assert.ok(validateWorkflowParallel(returns).some(error => error.includes('RETURN_CROSSES_BRANCH')));
  const fields = definition(); (fields.nodes.b as any).taskPageCode = 'finance';
  assert.ok(validateWorkflowParallel(fields).some(error => error.includes('SHARED_WRITABLE_FIELD')));
  (fields.nodes.b as any).fieldPolicy = { default: 'readonly' };
  assert.deepEqual(validateWorkflowParallel(fields), []);
});
test('a step cannot read sibling writable facts or output ancestors', () => {
  const source = definition(); (source.nodes.a as any).onApprove = 'step';
  source.nodes.step = { id: 'step', kind: 'action', title: 'Step', next: 'join', handler: { code: 'check', version: 1, mode: 'pure' }, inputSchema: {}, outputSchema: {}, inputs: { note: { source: 'fact', path: 'note' } } };
  assert.ok(validateWorkflowParallel(source).some(error => error.includes('SIBLING_INPUT:step:note')));
  source.nodes.step.inputs = { amount: { source: 'fact', path: 'amount' } };
  assert.deepEqual(validateWorkflowParallel(source), []);
});
test('a scoped position refuses arrived, rejected, wrong visit and missing tokens', () => {
  const input = { status: 'running', currentNodeId: 'fork', nodeId: 'a', forkVisitId: 'visit', branchId: 'finance', activeToken: true,
    fork: { forkVisitId: 'visit', parallelNodeId: 'fork', branchId: 'finance', activation: ['finance', 'legal'], arrived: [], status: 'active' as const } };
  assert.equal(workflowPositionActive(input), true);
  assert.equal(workflowPositionActive({ ...input, activeToken: false }), false);
  assert.equal(workflowPositionActive({ ...input, forkVisitId: 'old' }), false);
  assert.equal(workflowPositionActive({ ...input, fork: { ...input.fork, arrived: ['finance'] } }), false);
  assert.equal(workflowPositionActive({ ...input, fork: { ...input.fork, status: 'rejected' } }), false);
  assert.equal(workflowPositionActive({ status: 'running', currentNodeId: 'a', nodeId: 'a', activeToken: false }), true);
});
test('adoption keeps every active branch but allows an already arrived branch to disappear', () => {
  const source = definition(), target = definition();
  const state = { currentNodeId: 'fork', forkNodeId: 'fork', activeNodeIds: ['a'], unarrivedBranchIds: ['finance'], facts: { amount: 1, note: '' } };
  assert.equal(classifyWorkflowAdoption(source, target, state).outcome, 'eligible');
  (target.nodes.fork as any).branches = [{ id: 'legal', title: 'Legal', target: 'b' }];
  assert.equal(classifyWorkflowAdoption(source, target, state).outcome, 'excepted');
  (target.nodes.fork as any).branches = [{ id: 'finance', title: 'Finance', target: 'a' }, { id: 'extra', title: 'Extra', target: 'join' }];
  delete target.nodes.b;
  assert.equal(classifyWorkflowAdoption(source, target, state).outcome, 'eligible');
  assert.equal(classifyWorkflowAdoption(source, source, { ...state, businessStepPending: true }).outcome, 'deferred');
});

test('semantic insertion, branch removal and full-region removal preserve ids and disjoint bodies', () => {
  const source = definition();
  const base = structuredClone(source);base.startAt = 'done';base.nodes = { done: base.nodes.done! };
  // A normal predecessor makes the selected insertion edge explicit.
  base.startAt = 'notice';base.nodes.notice = { id: 'notice',kind: 'cc',title: 'Notice',binding: 'people',emptyPolicy: 'block',next: 'done' };
  let next = editWorkflowDesignerDefinition(base,{ type: 'insert_parallel',from: 'notice',target: 'done',id: 'fork',joinId: 'join',title: 'Together',branches: [{ id: 'one',title: 'One' },{ id: 'two',title: 'Two' },{ id: 'three',title: 'Three' }] });
  assert.deepEqual(validateWorkflowParallel(next), []);
  next = editWorkflowDesignerDefinition(next,{ type: 'insert',from: 'fork',target: 'join',edge: 1,node: { id: 'review',kind: 'approval',title: 'Review',binding: 'people',mode: 'single',onApprove: 'join',onReject: 'rejected' } });
  next.nodes.rejected = source.nodes.rejected!;
  assert.equal((next.nodes.fork as any).branches[1].target,'review');
  next = editWorkflowDesignerDefinition(next,{ type: 'remove_parallel_branch',nodeId: 'fork',branchId: 'two' });
  assert.equal(next.nodes.review,undefined);assert.equal((next.nodes.fork as any).branches.length,2);
  next = editWorkflowDesignerDefinition(next,{ type: 'remove',nodeId: 'fork' });
  assert.equal((next.nodes.notice as any).next,'done');assert.equal(next.nodes.join,undefined);assert.equal(next.nodes.fork,undefined);
  assert.deepEqual(base.nodes,{ notice: base.nodes.notice,done: base.nodes.done });
});
