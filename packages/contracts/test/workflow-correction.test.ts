import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkflowCorrections } from '../src/native-compiler/workflow-correction.js';
import { refreshWorkflowTaskPageFacts, workflowTaskPageReplayCoversInvalidation } from '../src/native-compiler/workflow-task-page.js';
import { editWorkflowDesignerDefinition } from '../src/native-compiler/workflow-designer.js';

const fixture = (): any => ({
  startAt: 'calculate', subject: { resourceCode: 'requests', factProjection: { amount: 'amount' } },
  taskPages: { correction: { title: '本人补正', fields: [{ code: 'amount', required: true }] } },
  nodes: {
    calculate: { id: 'calculate', kind: 'action', inputs: { amount: { source: 'fact', path: 'amount' } }, next: 'review' },
    review: { id: 'review', kind: 'approval', returnTargets: ['correct'], onApprove: 'end', onReject: 'end' },
    correct: { id: 'correct', kind: 'correction', title: '补正', taskPageCode: 'correction', next: 'calculate' },
    end: { id: 'end', kind: 'end' },
  },
});
test('correction is return-only with a fixed replay target and page', () => {
  assert.deepEqual(validateWorkflowCorrections(fixture()), []);
  assert.deepEqual(validateWorkflowCorrections({ startAt: 'end', nodes: { end: { id: 'end', kind: 'end' } } }), []);
});
for (const [name, change, code] of [
  ['forward edge', (d: any) => d.nodes.review.onReject = 'correct', 'WORKFLOW_CORRECTION_FORWARD_ENTRY_FORBIDDEN'],
  ['start node', (d: any) => d.startAt = 'correct', 'WORKFLOW_CORRECTION_REPLAY_TARGET_INVALID'],
  ['wrong replay', (d: any) => d.nodes.correct.next = 'review', 'WORKFLOW_CORRECTION_REPLAY_TARGET_INVALID'],
  ['unreachable return source', (d: any) => d.nodes.calculate.next = 'end', 'WORKFLOW_CORRECTION_RETURN_SOURCE_REQUIRED'],
  ['no return source', (d: any) => d.nodes.review.returnTargets = [], 'WORKFLOW_CORRECTION_RETURN_SOURCE_REQUIRED'],
  ['missing page', (d: any) => d.nodes.correct.taskPageCode = 'unknown', 'WORKFLOW_CORRECTION_PAGE_REQUIRED'],
  ['injected binding', (d: any) => d.nodes.correct.binding = 'other', 'WORKFLOW_CORRECTION_NODE_INVALID'],
  ['automatic approval', (d: any) => d.nodes.correct.initiatorApprovalPolicy = 'auto_approve', 'WORKFLOW_CORRECTION_NODE_INVALID'],
  ['projected owned mutation', (d: any) => { d.subject.factProjection.rows = 'items'; d.taskPages.correction.fields.push({ code: 'items', subtable: {} }); }, 'WORKFLOW_CORRECTION_OWNED_FACTS_UNSUPPORTED'],
  ['projected owned child path', (d: any) => { d.subject.factProjection.names = 'items.name'; d.taskPages.correction.fields.push({ code: 'items', subtable: {} }); }, 'WORKFLOW_CORRECTION_OWNED_FACTS_UNSUPPORTED'],
] as const) test(`reject ${name}`, () => { const d = fixture(); change(d); assert.ok(validateWorkflowCorrections(d).includes(code)); });
test('allows owned correction without projecting the rows into routing facts', () => {
  const d = fixture();
  d.taskPages.correction.fields.push({ code: 'items', subtable: { create: true, delete: true, reorder: true, fields: [{ code: 'name', required: true }] } });
  // A scalar whose name has the same prefix is a different top-level field.
  d.subject.factProjection.counter = 'itemsCount';
  assert.deepEqual(validateWorkflowCorrections(d), []);
});
test('scalar correction invalidates prior step outputs and start replay covers them', () => {
  const d = fixture();
  const refreshed = refreshWorkflowTaskPageFacts(d, { amount: 100, steps: { calculate: { total: 100 } } }, { amount: 2000 });
  assert.equal(refreshed.facts.amount, 2000);
  assert.deepEqual(refreshed.invalidatedNodeIds, ['calculate']);
  assert.equal(workflowTaskPageReplayCoversInvalidation(d, d.nodes.correct.next, refreshed.invalidatedNodeIds), true);
  assert.equal(workflowTaskPageReplayCoversInvalidation(d, 'review', refreshed.invalidatedNodeIds), false);
});

test('consecutive entry insertions and removal keep all correction replays on the full new path', () => {
  const source = fixture();
  source.nodes.secondCorrection = { ...source.nodes.correct,id: 'secondCorrection' };
  source.nodes.review.returnTargets.push('secondCorrection');
  const before = structuredClone(source);
  const first = editWorkflowDesignerDefinition(source, { type: 'insert_start',target: 'calculate',node: { id: 'first',kind: 'approval',title: '首审',binding: 'people',mode: 'single',onApprove: 'calculate',onReject: 'end' } });
  const second = editWorkflowDesignerDefinition(first, { type: 'insert_start',target: 'first',node: { id: 'second',kind: 'cc',title: '抄送',binding: 'people',next: 'first',emptyPolicy: 'block' } });
  for (const next of [first,second]) {
    assert.deepEqual(validateWorkflowCorrections(next), []);
    for (const id of ['correct','secondCorrection']) assert.equal((next.nodes[id] as any).next,next.startAt);
    assert.equal(workflowTaskPageReplayCoversInvalidation(next,next.startAt,['calculate']),true);
  }
  assert.deepEqual(editWorkflowDesignerDefinition(second,{type:'remove',nodeId:'second'}),first);
  assert.deepEqual(editWorkflowDesignerDefinition(first,{type:'remove',nodeId:'first'}),source);
  assert.deepEqual(source,before);
});

test('entry parallel insertion and removal preserve correction replay atomically', () => {
  const source = fixture();
  const next = editWorkflowDesignerDefinition(source,{type:'insert_start_parallel',target:'calculate',id:'fork',joinId:'join',title:'并行',branches:[{id:'a',title:'分支A'},{id:'b',title:'分支B'}]});
  assert.equal((next.nodes.correct as any).next,'fork');
  assert.equal((next.nodes.join as any).next,'calculate');
  assert.deepEqual(validateWorkflowCorrections(next),[]);
  assert.deepEqual(editWorkflowDesignerDefinition(next,{type:'remove',nodeId:'fork'}),source);
  const forbidden = structuredClone(next);
  (forbidden.nodes.fork as any).branches[0].target='correct';
  assert.ok(validateWorkflowCorrections(forbidden).includes('WORKFLOW_CORRECTION_FORWARD_ENTRY_FORBIDDEN'));
  const unreachable = structuredClone(next);
  (unreachable.nodes.join as any).next='end';
  assert.ok(validateWorkflowCorrections(unreachable).includes('WORKFLOW_CORRECTION_RETURN_SOURCE_REQUIRED'));
});

test('non-entry insertion leaves replay unchanged and stale entry selection cannot edit the graph', () => {
  const source = fixture();
  const next = editWorkflowDesignerDefinition(source,{type:'insert',from:'review',target:'end',node:{id:'last',kind:'cc',title:'末尾',binding:'people',next:'end',emptyPolicy:'block'}});
  assert.deepEqual(next.nodes.correct,source.nodes.correct);
  assert.deepEqual(validateWorkflowCorrections(next),[]);
  assert.throws(()=>editWorkflowDesignerDefinition(next,{type:'insert_start',target:'review',node:{id:'wrong',kind:'cc',title:'错误',binding:'people',next:'review',emptyPolicy:'block'}}),/WORKFLOW_DESIGNER_INSERT_INVALID/);
});

test('entry insertion does not silently repair an already invalid correction target', () => {
  const source = fixture();source.nodes.correct.next='review';
  const next = editWorkflowDesignerDefinition(source,{type:'insert_start',target:'calculate',node:{id:'first',kind:'cc',title:'抄送',binding:'people',next:'calculate',emptyPolicy:'block'}});
  assert.equal((next.nodes.correct as any).next,'review');
  assert.ok(validateWorkflowCorrections(next).includes('WORKFLOW_CORRECTION_REPLAY_TARGET_INVALID'));
});
