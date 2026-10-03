import assert from 'node:assert/strict';
import test from 'node:test';
import { queryUserCandidateField, reconcileUserCandidateSelection, userCandidateFieldContext, userCandidateError } from '../src/browser/components/platform-fields/user-candidate-context';

test('constrained fields require saved revisions and never turn incomplete task context into Native directory access', () => {
  const base = { resourceCode: 'requests', fieldCode: 'leaders', operation: 'update' as const, recordId: 'record-1', expectedRevision: 7 };
  assert.deepEqual(userCandidateFieldContext(base).context, { kind: 'native', ...base });
  for (const expectedRevision of [undefined, 0, -1, NaN, 1.2])
    assert.equal(userCandidateFieldContext({ ...base, expectedRevision }).context, undefined);
  assert.equal(userCandidateFieldContext({ ...base, operation: 'create', requiresSavedScope: true }).context, undefined);
  assert.equal(userCandidateFieldContext({ ...base, workflowCandidateBinding: { taskId: 'task-1', expectedTaskVersion: undefined } }).context, undefined);
  assert.equal(userCandidateFieldContext({ ...base, workflowCandidateBinding: { taskId: '', expectedTaskVersion: 2 } }).context, undefined);
  assert.deepEqual(userCandidateFieldContext({ ...base, workflowCandidateBinding: { taskId: 'task-1', expectedTaskVersion: 2 } }).context,
    { kind: 'workflow-task', fieldCode: 'leaders', taskId: 'task-1', expectedTaskVersion: 2, expectedRevision: 7 });
  assert.equal(userCandidateFieldContext({ ...base, operation: 'create', requiresSavedScope: false }).context?.kind, 'native');
});

test('selected inspection uses stable IDs, retains stale labels and preserves choices from another pending page', () => {
  const values = [{ value: 'same-name-a', label: '张老师' }, { value: 'same-name-b', label: '张老师' }, { value: 'newer-choice', label: '尚未复核的选择' }];
  const result = reconcileUserCandidateSelection(values, [
    { value: 'same-name-a', label: '张老师（已更新）', status: 'valid' },
    { value: 'same-name-b', status: 'invalid' },
  ]);
  assert.deepEqual(result, [{ value: 'same-name-a', label: '张老师（已更新）', status: 'valid' },
    { value: 'same-name-b', label: '张老师', status: 'invalid' }, values[2]]);
  assert.equal(values[0]!.label, '张老师', 'inspection does not rewrite the saved snapshot');
  assert.match(userCandidateError({ code: 'WORKFLOW_TASK_FORM_REVISION_CONFLICT' }), /已更新/);
  assert.match(userCandidateError({ code: 'OPENXIANGDA_USER_CANDIDATES_TASK_CONTEXT_CHANGED' }), /已更新/);
  assert.match(userCandidateError(new Error('network')), /失败/);
});

test('candidate requests bind Native and task owners, propagate revisions and preserve errors without a directory fallback', async () => {
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  const metadata: Record<string, string> = { 'openxiangda-runtime-base': '/dev/candidate-fixture', 'openxiangda-app-code': 'candidate-fixture', 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: metadata[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let status = 200;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ code: status, data: status === 200 ? { items: [], selected: [], nextCursor: null }
      : { errorCode: 'OPENXIANGDA_USER_CANDIDATES_CURSOR_INVALID' } }), { status });
  };
  try {
    const created = userCandidateFieldContext({ resourceCode: 'requests', fieldCode: 'doctors', operation: 'create', launch: { workflowCode: 'return', operationCode: 'submit' } }).context!;
    await queryUserCandidateField(created, { keyword: '张', selectedIds: ['user-1'], roleCode: 'forged', scope: 'foreign' } as any);
    assert.match(calls[0]!.url, /data-resources\/requests\/fields\/doctors\/user-candidates\/query$/);
    assert.deepEqual(JSON.parse(String(calls[0]!.init!.body)), { schemaVersion: 'openxiangda.user-candidates-query/v2', operation: 'create', keyword: '张', selectedIds: ['user-1'],
      launch: { workflowCode: 'return', operationCode: 'submit' }, environmentKey: 'preproduction' });
    const updated = userCandidateFieldContext({ resourceCode: 'requests', fieldCode: 'leaders', operation: 'update', recordId: 'saved-1', expectedRevision: 8 }).context!;
    await queryUserCandidateField(updated, { cursor: 'page-2' });
    assert.deepEqual(JSON.parse(String(calls[1]!.init!.body)), { schemaVersion: 'openxiangda.user-candidates-query/v2', operation: 'update', cursor: 'page-2',
      recordId: 'saved-1', expectedRevision: 8, environmentKey: 'preproduction' });
    await queryUserCandidateField({ kind: 'workflow-task', taskId: 'task-1', fieldCode: 'leaders', expectedRevision: 8, expectedTaskVersion: 3 }, { selectedIds: ['user-1'] });
    assert.match(calls[2]!.url, /tasks\/task-1\/fields\/leaders\/user-candidates\/query$/);
    assert.deepEqual(JSON.parse(String(calls[2]!.init!.body)), { schemaVersion: 'openxiangda.user-candidates-query/v2', selectedIds: ['user-1'], expectedRevision: 8, expectedTaskVersion: 3 });
    status = 409;
    await assert.rejects(queryUserCandidateField(updated, {}));
    assert.equal(calls.length, 4);
    assert.ok(calls.every(call => !call.url.includes('/directory') && call.init?.credentials === 'include'));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldDocument === undefined) delete (globalThis as any).document; else globalThis.document = oldDocument;
  }
});
