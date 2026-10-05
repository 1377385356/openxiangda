import assert from 'node:assert/strict';
import test from 'node:test';
import { searchResource } from '../src/browser/platform-client';

test('task selectors use current task revisions without granting ordinary Native update', async () => {
  const previousDocument = globalThis.document, previousFetch = globalThis.fetch;
  const meta: Record<string, string> = { 'openxiangda-runtime-base': '/dev/task-source-fixture', 'openxiangda-app-code': 'task-source-fixture', 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: meta[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ code: 200, data: { schemaVersion: 'openxiangda.data-field-source-page/v2', items: [], nextCursor: null } }), { status: 200 });
  };
  const options = { operation: 'update' as const, keyword: '  司机  ', cursor: 'original-cursor', bindings: { college: null },
    task: { taskId: 'current-task', expectedRevision: 7, expectedTaskVersion: 2 } };
  try {
    await searchResource('action-owned', 'driver', options);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.url.endsWith('/workflow/tasks/current-task/fields/driver/source/query'));
    assert.deepEqual(JSON.parse(String(calls[0]!.init!.body)), { schemaVersion: 'openxiangda.workflow-task-field-source-query/v2',
      expectedRevision: 7, expectedTaskVersion: 2, keyword: '司机', cursor: 'original-cursor', bindings: { college: null } });
    assert.equal(calls[0]!.init!.credentials, 'include');
    for (const patch of [{ operation: 'create' }, { launch: { workflowCode: 'flow', operationCode: 'submit' } },
      { action: { operationCode: 'edit', recordId: 'record', expectedRevision: 7 } }]) {
      await assert.rejects(searchResource('action-owned', 'driver', { ...options, ...patch } as any), /WORKFLOW_TASK_FIELD_SOURCE_CONTEXT_INVALID/);
    }
    assert.equal(calls.length, 1, 'mixed authority is rejected before a request');
    await searchResource('orders', 'customer', { operation: 'update', keyword: '', bindings: { college: 'c1' } });
    assert.ok(calls[1]!.url.includes('/native/data-resources/orders/fields/customer/source/query'));
    assert.equal(JSON.parse(String(calls[1]!.init!.body)).schemaVersion, 'openxiangda.data-field-source-query/v2');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDocument === undefined) delete (globalThis as any).document; else globalThis.document = previousDocument;
  }
});
