import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DataRecordCommentPage, DataRecordCommentReceipt } from 'openxiangda-contracts/browser';
import { createNativeRecordComment, loadNativeRecordComments, loadNativeRecordCommentReceipt, OpenXiangdaPlatformRequestError } from '../src/browser/platform-client';
import { ResourceRecordComments, loadNativeRecordComments as publicRead } from '../src/react';
import { createRecordCommentSession, type RecordCommentState } from '../src/browser/components/resource/record-comment-session';
import { RecordCommentList } from '../src/browser/components/resource/ResourceRecordComments';

const comment = { id: 'comment-1', body: '申请说明', authorUserId: 'viewer', isOwn: true, createdAt: '2026-10-04T04:00:00.000Z', appVersionId: 'version-1', environmentHeadRevision: 2 };
const receipt = (key = 'key-1'): DataRecordCommentReceipt => ({ schemaVersion: 'openxiangda.data-record-comment-receipt/v1', resourceCode: 'requests', recordId: 'record/id', idempotencyKey: key, comment, replayed: false });
const page: DataRecordCommentPage = { schemaVersion: 'openxiangda.data-record-comments/v1', resourceCode: 'requests', recordId: 'record/id', items: [comment], nextCursor: null, limit: 20 };
function failure(status: number, code = `HTTP_${status}`) { return new OpenXiangdaPlatformRequestError({ status, code, message: code }); }
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

test('public client preserves exact record, original key and declared pagination, without automatic write replay', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document;
  const metadata: Record<string, string> = { 'openxiangda-runtime-base': '/apps/comment-app', 'openxiangda-app-code': 'comment-app', 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: metadata[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url), 'http://localhost'); calls.push({ url: parsed, init });
    return new Response(JSON.stringify({ code: 200, data: init?.method === 'POST' || parsed.pathname.endsWith('/receipt') ? receipt() : page }));
  };
  try {
    assert.equal(publicRead, loadNativeRecordComments); assert.equal(typeof ResourceRecordComments, 'function');
    await publicRead('requests', 'record/id'); await createNativeRecordComment('requests', 'record/id', { schemaVersion: 'openxiangda.data-record-comment-create/v1', body: '申请说明', idempotencyKey: 'key-1' });
    await loadNativeRecordCommentReceipt('requests', 'record/id', 'key-1');
    assert.equal(calls[0]!.url.pathname.endsWith('/records/record%2Fid/comments'), true);
    assert.equal(calls[0]!.url.searchParams.get('limit'), '20');
    assert.equal(JSON.parse(String(calls[1]!.init?.body)).idempotencyKey, 'key-1');
    assert.equal(calls[2]!.url.searchParams.get('idempotencyKey'), 'key-1');
    globalThis.fetch = async () => { throw new Error('lost response'); };
    await assert.rejects(createNativeRecordComment('requests', 'record/id', { schemaVersion: 'openxiangda.data-record-comment-create/v1', body: '申请说明', idempotencyKey: 'key-1' }), error => error instanceof OpenXiangdaPlatformRequestError && error.code === 'PLATFORM_TRANSPORT_UNAVAILABLE');
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 200, data: { ...page, recordId: 'another' } }));
    await assert.rejects(publicRead('requests', 'record/id'), /RECORD_COMMENTS_RESPONSE_INVALID/);
    await assert.rejects(publicRead('requests', 'record/id', { limit: 51 }), /PAGE_INVALID/);
  } finally { globalThis.fetch = originalFetch; if (originalDocument === undefined) delete (globalThis as any).document; else globalThis.document = originalDocument; }
});
test('unknown submit retains exact original body/key and only receipt absence permits same-key retry', async () => {
  const states: RecordCommentState[] = []; const sent: unknown[] = []; let keys = 0, attempts = 0;
  const session = createRecordCommentSession(async input => { sent.push(input); if (++attempts === 1) throw failure(503); return receipt(input.idempotencyKey); },
    async () => { throw failure(404, 'OPENXIANGDA_NATIVE_RECORD_COMMENTS_RECEIPT_NOT_FOUND'); }, state => states.push(state), () => `key-${++keys}`);
  await session.send(' original body '); await session.send('replacement'); await session.retry();
  assert.equal(sent.length, 1); assert.equal(states.at(-1)?.pending?.body, ' original body '); assert.equal(keys, 1);
  await session.recover(); assert.equal(states.at(-1)?.retryAllowed, true); await session.retry();
  assert.deepEqual(sent[1], sent[0]); assert.equal(states.at(-1)?.receipt?.idempotencyKey, 'key-1');
});
test('a missing record or forbidden receipt does not authorize replay', async () => {
  for (const error of [failure(404, 'OPENXIANGDA_NATIVE_DATA_RECORD_NOT_FOUND'), failure(403), failure(503)]) {
    let calls = 0; const states: RecordCommentState[] = [];
    const session = createRecordCommentSession(async () => { calls++; throw failure(503); }, async () => { throw error; }, state => states.push(state), () => 'key-1');
    await session.send('body'); await session.recover(); await session.retry();
    assert.equal(calls, 1); assert.equal(states.at(-1)?.retryAllowed, false);
  }
});
test('receipt recovery finishes the original submission without another POST', async () => {
  let sends = 0; const states: RecordCommentState[] = [];
  const session = createRecordCommentSession(async () => { sends++; throw failure(503); }, async key => receipt(key), state => states.push(state), () => 'key-1');
  await session.send('body'); await session.recover(); await session.retry();
  assert.equal(sends, 1); assert.ok(states.at(-1)?.receipt); assert.equal(states.at(-1)?.pending, undefined);
});
test('double click shares one write; closing discards all late replies', async () => {
  const pending = deferred<DataRecordCommentReceipt>(); let sends = 0; const states: RecordCommentState[] = [];
  const session = createRecordCommentSession(async () => { sends++; return pending.promise; }, async () => receipt(), state => states.push(state), () => 'key-1');
  const first = session.send('body'); await session.send('body'); await session.recover();
  assert.equal(sends, 1); session.close(); const count = states.length; pending.resolve(receipt()); await first;
  assert.equal(states.length, count);
});
test('a certain rejection retains user draft responsibility while dropping the completed request', async () => {
  const states: RecordCommentState[] = [];
  const session = createRecordCommentSession(async () => { throw failure(403); }, async () => receipt(), state => states.push(state), () => 'key-1');
  await session.send('body'); assert.equal(states.at(-1)?.unknown, false); assert.equal(states.at(-1)?.pending, undefined);
});
test('comment text and author identifiers cannot inject markup or external content', () => {
  const html = renderToStaticMarkup(createElement(RecordCommentList, { data: { ...page, items: [{ ...comment, isOwn: false, authorUserId: '<img src=x>', body: '<script>alert(1)</script>\n第二行' }] }, timeZone: 'Asia/Shanghai' }));
  assert.doesNotMatch(html, /<script|<img/); assert.match(html, /&lt;script&gt;/); assert.match(html, /第二行/);
});
