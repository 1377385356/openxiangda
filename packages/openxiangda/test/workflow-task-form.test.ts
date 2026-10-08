import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import { workflowTaskFormLinkage, workflowTaskFormPatch, workflowTaskFormReviewFields } from '../src/browser/components/workflow/WorkflowTaskForm';
import { workflowTaskDraftConfirmsSave, workflowTaskDraftWasRejected } from '../src/browser/components/workflow/WorkflowTaskDraftPanel';
import { clearPendingWorkflowTaskCommand, readPendingWorkflowTaskCommand, workflowCommandTokenDigest, workflowTaskCommandScope,
  workflowTaskCommandWasRejected, writePendingWorkflowTaskCommand } from '../src/browser/workflow-task-command-recovery';

const source: any = { pageCode: 'fill', expectedRevision: 3, page: { title: '补填', fields: [
  { code: 'title', readonly: true }, { code: 'amount' }, { code: 'needsReason' },
  { code: 'reason', visibleWhen: { op: 'path', path: 'values.needsReason' } }, { code: 'date' },
] }, fields: { title: { type: 'text.short' }, amount: { type: 'number.integer' }, needsReason: { type: 'boolean' },
  reason: { type: 'text.long' }, date: { type: 'date' } },
  values: { title: '原申请', amount: 100, needsReason: true, reason: '原说明', date: '2026-10-02' } };

const context = { workflowCode: 'business', nodeId: 'review', pageCode: 'fill' };
test('task value linkage uses canonical dates, preserves independent edits and cannot mutate input', () => {
  const values = { ...source.values, date: dayjs('2026-10-03'), reason: '手填意见' };
  const rule = (changed: any, all: any, received: any) => {
    assert.deepEqual(received, context); assert.equal(Object.hasOwn(all, 'title'), false);
    if (!Object.hasOwn(changed, 'date')) return {};
    assert.equal(all.date, '2026-10-03'); all.amount = 999;
    return { reason: `会议日期：${all.date}` };
  };
  assert.deepEqual(workflowTaskFormLinkage(source, { date: values.date }, values, rule, context), { reason: '会议日期：2026-10-03' });
  assert.deepEqual(workflowTaskFormLinkage(source, { reason: '手填意见' }, values, rule, context), {});
  assert.equal(values.amount, 100); assert.equal(source.expectedRevision, 3);
});
test('task linkage rejects an entire mixed patch targeting hidden, readonly, unmatched, owned or file fields', () => {
  const bounded: any = { ...source, page: { ...source.page, fields: [...source.page.fields,
    { code: 'children', subtable: {} }, { code: 'file' }] }, fields: { ...source.fields, children: { type: 'subtable' }, file: { type: 'file' } } };
  const values = { ...source.values, needsReason: false };
  for (const code of ['title', 'reason', 'undeclared', 'children', 'file'])
    assert.throws(() => workflowTaskFormLinkage(bounded, { amount: 2 }, values, () => ({ amount: 2, [code]: 'forged' }), context), /FIELD_UNAVAILABLE/);
  assert.deepEqual(workflowTaskFormPatch(source, { ...source.values, amount: 2 }), { expectedRevision: 3, values: { amount: 2 } });
});
test('task linkage rejects asynchronous rules and ignores non-scalar changes without overwriting entered values', () => {
  for (const output of [Promise.resolve({ amount: 1 }), { then: () => {} }, []])
    assert.throws(() => workflowTaskFormLinkage(source, { amount: 2 }, source.values, (() => output) as any, context), /LINKAGE_INVALID/);
  let called = false;
  assert.deepEqual(workflowTaskFormLinkage(source, { undeclared: 1 }, source.values, () => { called = true; return {}; }, context), {});
  assert.equal(called, false); assert.equal(source.values.amount, 100);
});

test('task patch keeps CAS and omits readonly, hidden and unchanged fields', () => {
  assert.deepEqual(workflowTaskFormPatch(source, { title: '篡改', amount: 0, needsReason: false, reason: '未提交隐藏值', date: dayjs('2026-10-02') }),
    { expectedRevision: 3, values: { amount: 0, needsReason: false } });
});
test('date edits use the same canonical codec as Native resource forms', () => {
  assert.deepEqual(workflowTaskFormPatch(source, { ...source.values, date: dayjs('2026-10-03') }),
    { expectedRevision: 3, values: { date: '2026-10-03' } });
});
test('newly visible file controls submit canonical empty arrays without changing signature values', () => {
  const conditional: any = { ...source, page: { ...source.page, fields: [...source.page.fields,
    { code: 'file', visibleWhen: { op: 'path', path: 'values.needsReason' } }, { code: 'image' }, { code: 'signature' }] },
    fields: { ...source.fields, file: { type: 'file' }, image: { type: 'image' }, signature: { type: 'signature' } },
    values: { ...source.values, needsReason: false } };
  assert.deepEqual(workflowTaskFormPatch(conditional, { ...conditional.values, needsReason: true, file: undefined, image: null, signature: undefined }).values,
    { needsReason: true, file: [], image: [], signature: null });
});
test('conflict comparison exposes only fresh-page visible editable values, including other participants changes', () => {
  const latest = { ...source, expectedRevision: 4, values: { ...source.values, title: '最新只读标题', amount: 222, needsReason: false, reason: '最新隐藏说明' } };
  const fields = workflowTaskFormReviewFields(source, latest, { ...source.values, amount: 111, unknown: '未声明输入' });
  assert.deepEqual(fields.map(field => field.code), ['amount', 'needsReason']);
  assert.deepEqual(workflowTaskFormReviewFields(source, { ...source, expectedRevision: 4 }, source.values), []);
});
test('reloaded task recovery stores only a locator and cannot clear a newer command', async () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  const scope = workflowTaskCommandScope('app', 'env-1', 'user-1', 'task-1');
  const value = { taskId: 'task-1', command: 'save_form', idempotencyKey: 'original-key', requestedAt: new Date().toISOString(),
    tokenDigest: await workflowCommandTokenDigest('private-command-token'), commandToken: 'private-command-token', form: { secret: 'input' } };
  assert.equal(writePendingWorkflowTaskCommand(storage, scope, value), true);
  const encoded = storage.getItem(scope)!;
  assert.doesNotMatch(encoded, /private-command-token|secret|"form":|"commandToken":/);
  assert.equal(readPendingWorkflowTaskCommand(storage, scope)?.idempotencyKey, 'original-key');
  assert.equal(readPendingWorkflowTaskCommand(storage, workflowTaskCommandScope('app', 'env-2', 'user-1', 'task-1')), null);
  clearPendingWorkflowTaskCommand(storage, scope, 'another-key');
  assert.notEqual(readPendingWorkflowTaskCommand(storage, scope), null);
  clearPendingWorkflowTaskCommand(storage, scope, 'original-key');
  assert.equal(readPendingWorkflowTaskCommand(storage, scope), null);
});
test('malformed locators and a transport failure do not authorize a fresh submission', () => {
  const storage = { getItem: () => JSON.stringify({ commandToken: 'token', input: {} }) } as any;
  assert.equal(readPendingWorkflowTaskCommand(storage, 'scope'), null);
  assert.equal(workflowTaskCommandWasRejected({ status: 503, code: 'PLATFORM_TRANSPORT_UNAVAILABLE' }), false);
  assert.equal(workflowTaskCommandWasRejected({ status: 409, code: 'WORKFLOW_TASK_FORM_REVISION_CONFLICT' }), true);
  assert.equal(workflowTaskCommandWasRejected({ status: 409, code: 'GATEWAY_UNAVAILABLE' }), false);
});

test('private draft recovery confirms only the original id, revision, baseline and values', () => {
  const input = { id: 'draft-1', expectedRevision: 2, recordRevision: 4, values: { amount: 222, needsReason: false } };
  const saved: any = { id: 'draft-1', revision: 3, recordRevision: 4, values: { needsReason: false, amount: 222 } };
  assert.equal(workflowTaskDraftConfirmsSave(saved, input), true);
  for (const patch of [{ id: 'draft-2' }, { revision: 4 }, { recordRevision: 5 }, { values: { amount: 333 } }])
    assert.equal(workflowTaskDraftConfirmsSave({ ...saved, ...patch }, input), false);
  assert.equal(workflowTaskDraftWasRejected({ status: 409, code: 'OPENXIANGDA_TASK_DRAFT_REVISION_CONFLICT' }), true);
  assert.equal(workflowTaskDraftWasRejected({ status: 503, code: 'OPENXIANGDA_TASK_DRAFT_REVISION_CONFLICT' }), false);
  assert.equal(workflowTaskDraftWasRejected({ status: 409, code: 'GATEWAY_UNAVAILABLE' }), false);
  assert.equal(workflowTaskDraftWasRejected({ status: 429, code: 'OPENXIANGDA_NATIVE_RATE_LIMIT' }), false);
});
