import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import { workflowTaskFormPatch } from '../src/browser/components/workflow/WorkflowTaskForm';
import { clearPendingWorkflowTaskCommand, readPendingWorkflowTaskCommand, workflowCommandTokenDigest, workflowTaskCommandScope,
  workflowTaskCommandWasRejected, writePendingWorkflowTaskCommand } from '../src/browser/workflow-task-command-recovery';

const source: any = { pageCode: 'fill', expectedRevision: 3, page: { title: '补填', fields: [
  { code: 'title', readonly: true }, { code: 'amount' }, { code: 'needsReason' },
  { code: 'reason', visibleWhen: { op: 'path', path: 'values.needsReason' } }, { code: 'date' },
] }, fields: { title: { type: 'text.short' }, amount: { type: 'number.integer' }, needsReason: { type: 'boolean' },
  reason: { type: 'text.long' }, date: { type: 'date' } },
  values: { title: '原申请', amount: 100, needsReason: true, reason: '原说明', date: '2026-10-02' } };

test('task patch keeps CAS and omits readonly, hidden and unchanged fields', () => {
  assert.deepEqual(workflowTaskFormPatch(source, { title: '篡改', amount: 0, needsReason: false, reason: '未提交隐藏值', date: dayjs('2026-10-02') }),
    { expectedRevision: 3, values: { amount: 0, needsReason: false } });
});
test('date edits use the same canonical codec as Native resource forms', () => {
  assert.deepEqual(workflowTaskFormPatch(source, { ...source.values, date: dayjs('2026-10-03') }),
    { expectedRevision: 3, values: { date: '2026-10-03' } });
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
