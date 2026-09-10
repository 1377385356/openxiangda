import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getNotificationMessage,
  getDingTalkCardReadReceipt,
  refreshDingTalkCardReadReceipt,
} from '../src/core';

test('browser read receipts use current app, environment and session with single-delivery requests', async () => {
  const previousFetch = globalThis.fetch;
  const previousDocument = globalThis.document;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const meta: Record<string, string> = {
    'openxiangda-runtime-base': '/runtime/notice',
    'openxiangda-app-code': 'notice',
    'openxiangda-environment': 'preproduction',
  };
  globalThis.document = { querySelector: (selector: string) => ({ content: meta[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ code: 200, data: { readState: 'unknown', queryState: 'pending' } }), { status: 200 });
  };
  try {
    await getNotificationMessage('message/one');
    await getDingTalkCardReadReceipt('message/one', 'delivery/two');
    await refreshDingTalkCardReadReceipt('message/one', 'delivery/two');
    const base = '/service/openxiangda-api/v2/applications/notice/notification-hub/management/messages/message%2Fone';
    assert.deepEqual(calls.map(call => call.url), [
      `${base}?environmentKey=preproduction`,
      `${base}/deliveries/delivery%2Ftwo/read-receipt?environmentKey=preproduction`,
      `${base}/deliveries/delivery%2Ftwo/read-receipt/refresh`,
    ]);
    assert.equal(calls[2]?.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { environmentKey: 'preproduction' });
    assert.ok(calls.every(call => call.init?.credentials === 'include'));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDocument === undefined) delete (globalThis as any).document;
    else globalThis.document = previousDocument;
  }
});
