import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkflowCorrections } from '../src/native-compiler/workflow-correction.js';
import { refreshWorkflowTaskPageFacts, workflowTaskPageReplayCoversInvalidation } from '../src/native-compiler/workflow-task-page.js';

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
  ['owned data mutation', (d: any) => d.taskPages.correction.fields.push({ code: 'items', subtable: {} }), 'WORKFLOW_CORRECTION_OWNED_FACTS_UNSUPPORTED'],
] as const) test(`reject ${name}`, () => { const d = fixture(); change(d); assert.ok(validateWorkflowCorrections(d).includes(code)); });
test('scalar correction invalidates prior step outputs and start replay covers them', () => {
  const d = fixture();
  const refreshed = refreshWorkflowTaskPageFacts(d, { amount: 100, steps: { calculate: { total: 100 } } }, { amount: 2000 });
  assert.equal(refreshed.facts.amount, 2000);
  assert.deepEqual(refreshed.invalidatedNodeIds, ['calculate']);
  assert.equal(workflowTaskPageReplayCoversInvalidation(d, d.nodes.correct.next, refreshed.invalidatedNodeIds), true);
  assert.equal(workflowTaskPageReplayCoversInvalidation(d, 'review', refreshed.invalidatedNodeIds), false);
});
