import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWorkflowRecordHistory, OpenXiangdaPlatformRequestError } from '../src/browser/platform-client';
import { loadWorkflowRecordHistory as publicLoad } from '../src/react';

test('public history read keeps environment, subject, optional frozen instance and paging without issuing a handling surface', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document;
  const metadata: Record<string, string> = { 'openxiangda-runtime-base': '/dev/history-app', 'openxiangda-app-code': 'history-app', 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: metadata[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  const urls: URL[] = [];
  globalThis.fetch = async (url, input) => {
    assert.equal(input?.method || 'GET', 'GET');
    const current = new URL(String(url), 'http://localhost');
    assert.match(current.pathname, /\/workflow\/records\/request%20type\/record%2Fid\/history$/);
    urls.push(current);
    return new Response(JSON.stringify({ code: 200, data: { schemaVersion: 'openxiangda.workflow-record-history/v1', items: [] } }));
  };
  try {
    assert.equal(publicLoad, loadWorkflowRecordHistory);
    await publicLoad('request type', 'record/id');
    await publicLoad('request type', 'record/id', { instanceId: 'original-instance', limit: 10, offset: 20 });
    assert.deepEqual([...urls[0]!.searchParams], [['environmentKey', 'preproduction'], ['limit', '20'], ['offset', '0']]);
    assert.equal(urls[1]!.searchParams.get('instanceId'), 'original-instance');
    assert.equal(urls[1]!.searchParams.get('offset'), '20');
    assert.equal(urls.length, 2);
    for (const options of [{ limit: 0 }, { limit: 101 }, { offset: -1 }, { offset: 501 }, { offset: NaN }])
      await assert.rejects(publicLoad('request type', 'record/id', options), /WORKFLOW_V2_RECORD_HISTORY_PAGE_INVALID/);
    assert.equal(urls.length, 2);
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 403, message: 'WORKFLOW_V2_RECORD_HISTORY_FORBIDDEN' }), { status: 403 });
    await assert.rejects(publicLoad('request type', 'record/id'), error => error instanceof OpenXiangdaPlatformRequestError && error.status === 403);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete (globalThis as any).document; else globalThis.document = originalDocument;
  }
});
