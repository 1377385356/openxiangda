import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWorkflowTaskPageValues,
  refreshWorkflowTaskPageFacts,
  validateWorkflowTaskPages,
  workflowTaskPageFieldState,
  workflowTaskPageReplayCoversInvalidation,
  type WorkflowTaskPage,
} from '../src/native-compiler/workflow-task-page.js';

const page: WorkflowTaskPage = {
  title: '调度办理',
  fields: [
    { code: 'title', readonly: true },
    { code: 'requiresReason' },
    { code: 'reason', visibleWhen: { op: 'path', path: 'values.requiresReason' }, requiredWhen: { op: 'path', path: 'values.requiresReason' } },
    { code: 'amountCents', required: true },
    { code: 'confirmed', required: true },
  ],
};
const definition = { taskPages: { dispatch: page }, nodes: { review: { kind: 'approval', taskPageCode: 'dispatch' } } };

test('task pages are independent fixed declarations and node references must exist', () => {
  assert.deepEqual(validateWorkflowTaskPages(definition), []);
  assert.match(validateWorkflowTaskPages({ ...definition, nodes: { review: { kind: 'approval', taskPageCode: 'missing' } } }).join(','), /PAGE_NOT_FOUND/);
  assert.match(validateWorkflowTaskPages({ ...definition, nodes: { cc: { kind: 'cc', taskPageCode: 'dispatch' } } }).join(','), /PAGE_NOT_FOUND/);
  assert.match(validateWorkflowTaskPages({ taskPages: { dispatch: { ...page, topology: {} } } } as any).join(','), /PAGE_INVALID/);
  assert.match(validateWorkflowTaskPages({ ...definition, taskPages: { dispatch: {} } } as any).join(','), /PAGE_INVALID/);
  assert.match(validateWorkflowTaskPages({ ...definition, nodes: { review: { kind: 'approval', taskPageCode: 'dispatch', fieldPolicy: { fields: { reason: 'hidden' } } } } }).join(','), /FIELD_HIDDEN/);
});

test('page expressions are bounded and only reference declared form fields', () => {
  for (const path of ['values.other', 'steps.calculate.amountCents', 'values.reason.constructor', 'values.__proto__']) {
    assert.match(validateWorkflowTaskPages({ taskPages: { dispatch: { title: '办理', fields: [{ code: 'reason', visibleWhen: { op: 'path', path } }] } } }).join(','), /EXPRESSION_INVALID/);
  }
  let expression: any = { op: 'literal', value: true };
  for (let i = 0; i < 10; i++) expression = { op: 'not', value: expression };
  assert.match(validateWorkflowTaskPages({ taskPages: { dispatch: { title: '办理', fields: [{ code: 'reason', visibleWhen: expression }] } } }).join(','), /EXPRESSION_INVALID/);
});

test('compiler checks actual Native field metadata without exposing unsupported editors', () => {
  const fields = new Map(page.fields.map(field => [field.code, { type: 'string' }]));
  assert.deepEqual(validateWorkflowTaskPages(definition, fields), []);
  for (const type of ['file', 'image']) assert.deepEqual(validateWorkflowTaskPages(definition, new Map([...fields, ['reason', { type }]])), []);
  for (const metadata of [{ type: 'string', hidden: true }, { type: 'string', system: true }, { type: 'serial-number' }, { type: 'subtable' }, { type: 'signature' }, { type: 'text.rich' }, { type: 'string', widget: 'readonly' }]) {
    assert.match(validateWorkflowTaskPages(definition, new Map([...fields, ['reason', metadata]])).join(','), /RESOURCE_FIELD_INVALID/);
  }
  assert.match(validateWorkflowTaskPages(definition, new Map()).join(','), /RESOURCE_FIELD_INVALID/);
});

test('server requires visible fields using merged values; zero and false remain valid', () => {
  const base = { title: '原申请', requiresReason: false, amountCents: 0, confirmed: false };
  assert.deepEqual(applyWorkflowTaskPageValues(page, base, {}, true), base);
  assert.throws(() => applyWorkflowTaskPageValues(page, base, { requiresReason: true }, true), /FORM_REQUIRED/);
  assert.throws(() => applyWorkflowTaskPageValues(page, base, { requiresReason: true, reason: '  ' }, true), /FORM_REQUIRED/);
  assert.equal(applyWorkflowTaskPageValues(page, base, { requiresReason: true, reason: '追加信息' }, true).reason, '追加信息');
  assert.equal(workflowTaskPageFieldState(page, base).find(field => field.code === 'reason')?.visible, false);
});

test('partial submitted data can be saved but completion still enforces page requirements', () => {
  assert.equal(applyWorkflowTaskPageValues(page, {}, { requiresReason: true }, false).requiresReason, true);
  assert.throws(() => applyWorkflowTaskPageValues(page, {}, { requiresReason: true }, true), /FORM_REQUIRED/);
});

test('unknown readonly hidden and prototype fields cannot be submitted', () => {
  for (const input of [{ title: '篡改' }, { otherRecord: '另一记录' }, { reason: '当前隐藏' }, JSON.parse('{"__proto__":{"polluted":true}}')]) {
    assert.throws(() => applyWorkflowTaskPageValues(page, { requiresReason: false }, input, false), /FORM_(FIELD_NOT_EDITABLE|VALUES_INVALID)/);
  }
  assert.equal(({} as any).polluted, undefined);
});

test('form payload rejects excessive structure invalid numbers and non-JSON objects', () => {
  for (const input of [{ reason: 'x'.repeat(65536) }, { amountCents: Infinity }, { amountCents: NaN }, { amountCents: new Date() }, { reason: new Array(1001).fill('x') }]) {
    assert.throws(() => applyWorkflowTaskPageValues(page, {}, input, false), /VALUES_INVALID/);
  }
});

test('changed projected inputs invalidate derived steps transitively while preserving history and unrelated results', () => {
  const current = { amount: 100, unchanged: true, steps: { 'calculate-total': { total: 100 }, record: { recorded: true }, independent: { ready: true } } };
  const result = refreshWorkflowTaskPageFacts({ subject: { factProjection: { amount: 'amountCents' } }, nodes: {
    'calculate-total': { id: 'calculate-total', kind: 'action', inputs: { amount: { source: 'fact', path: 'amount' } } },
    record: { id: 'record', kind: 'action', inputs: { total: { source: 'fact', path: 'steps.calculate-total.total' } } },
    independent: { id: 'independent', kind: 'action', inputs: { flag: { source: 'literal', value: true } } },
  } }, current, { amountCents: 200 });
  assert.equal(result.facts.amount, 200);
  assert.deepEqual(result.invalidatedNodeIds, ['calculate-total', 'record']);
  assert.deepEqual(result.facts.steps, { independent: { ready: true } });
  assert.equal(current.steps['calculate-total'].total, 100);
});

test('unchanged projected values preserve fixed output snapshots and reject reserved projections', () => {
  const current = { amount: 100, steps: { calculate: { total: 100 } } };
  assert.deepEqual(refreshWorkflowTaskPageFacts({ subject: { factProjection: { amount: 'amountCents' } }, nodes: { calculate: { id: 'calculate', kind: 'action', inputs: { amount: { source: 'fact', path: 'amount' } } } } }, current, { amountCents: 100 }), { facts: current, invalidatedNodeIds: [] });
  assert.throws(() => refreshWorkflowTaskPageFacts({ subject: { factProjection: { 'steps.calculate': 'amountCents' } } }, current, { amountCents: 200 }), /FACT_PROJECTION_INVALID/);
  assert.throws(() => refreshWorkflowTaskPageFacts({ subject: { factProjection: { amount: 'missing' } } }, current, {}), /FACT_FIELD_MISSING/);
});

test('replay must cover every invalidated producer and cannot skip it on a branch', () => {
  const nodes = {
    calculate: { kind: 'action', next: 'record' }, record: { kind: 'action', next: 'done' },
    review: { kind: 'approval', onApprove: 'calculate', onReject: 'rejected' },
    done: { kind: 'end' }, rejected: { kind: 'end' },
    branch: { kind: 'condition', branches: [{ target: 'review' }], otherwise: 'done' },
    cycle: { kind: 'approval', onApprove: 'cycle' },
  };
  assert.equal(workflowTaskPageReplayCoversInvalidation({ nodes }, 'review', ['calculate', 'record']), true);
  for (const start of ['branch', 'cycle', 'record', 'missing'])
    assert.equal(workflowTaskPageReplayCoversInvalidation({ nodes }, start, ['calculate']), false);
});
