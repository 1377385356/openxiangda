import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DataRecordPrint } from 'openxiangda-contracts/browser';
import { loadNativeRecordPrint, OpenXiangdaPlatformRequestError } from '../src/browser/platform-client';
import { loadNativeRecordPrint as publicLoad, ResourceRecordPrintPreview } from '../src/react';
import { ResourceRecordPrintDocument, recordPrintFieldText } from '../src/browser/components/resource/ResourceRecordPrintPreview';
import { createRecordPrintSession, type RecordPrintState } from '../src/browser/components/resource/record-print-session';

function snapshot(title = '合成申请'): DataRecordPrint {
  return { schemaVersion: 'openxiangda.data-record-print/v1', resourceCode: 'request type', resourceName: '申请资料',
    recordId: 'record/id', appVersionId: 'version-1', environmentHeadRevision: 7, preparedAt: '2026-10-04T03:00:00Z',
    fields: [{ code: 'title', label: '标题', type: 'text.short', widget: 'text', section: '申请信息' }], data: { title } };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('public print loading uses current environment, exact subject and optional view, without a handling surface', async () => {
  const originalFetch = globalThis.fetch; const originalDocument = globalThis.document;
  const metadata: Record<string, string> = { 'openxiangda-runtime-base': '/apps/print-app', 'openxiangda-app-code': 'print-app', 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: metadata[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  const urls: URL[] = [];
  globalThis.fetch = async (url, input) => {
    assert.equal(input?.method || 'GET', 'GET'); const current = new URL(String(url), 'http://localhost'); urls.push(current);
    assert.match(current.pathname, /\/native\/data\/request%20type\/records\/record%2Fid\/print$/);
    return new Response(JSON.stringify({ code: 200, data: { ...snapshot(), ...(current.searchParams.has('viewCode') ? { viewCode: 'compact' } : {}) } }));
  };
  try {
    assert.equal(publicLoad, loadNativeRecordPrint); assert.equal(typeof ResourceRecordPrintPreview, 'function');
    await publicLoad('request type', 'record/id'); await publicLoad('request type', 'record/id', { viewCode: 'compact' });
    assert.deepEqual([...urls[0]!.searchParams], [['environmentKey', 'preproduction']]);
    assert.equal(urls[1]!.searchParams.get('viewCode'), 'compact'); assert.equal(urls.length, 2);
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 403, message: 'OPENXIANGDA_NATIVE_RECORD_PRINT_FORBIDDEN' }), { status: 403 });
    await assert.rejects(publicLoad('request type', 'record/id'), error => error instanceof OpenXiangdaPlatformRequestError && error.status === 403);
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 200, data: { ...snapshot(), recordId: 'another' } }));
    await assert.rejects(publicLoad('request type', 'record/id'), /RECORD_PRINT_RESPONSE_INVALID/);
  } finally { globalThis.fetch = originalFetch; if (originalDocument === undefined) delete (globalThis as any).document; else globalThis.document = originalDocument; }
});

test('a print always reloads and uses newly authorized data after rendering', async () => {
  const states: RecordPrintState[] = []; const printed: string[] = []; let loaded = 0;
  const session = createRecordPrintSession(async () => snapshot(`第${++loaded}次`), state => states.push(state), async () => {
    assert.equal(states.at(-1)?.data?.data.title, '第2次');
  }, () => printed.push(String(states.at(-1)?.data?.data.title)));
  await session.read(); await session.read(true);
  assert.equal(loaded, 2); assert.deepEqual(printed, ['第2次']);
  assert.deepEqual(states[2], { busy: true }); assert.equal(states.at(-1)?.busy, false);
});

test('authorization and network refusals clear prior data and never print its cache', async () => {
  for (const error of [Object.assign(new Error('revoked'), { status: 403 }), new Error('offline')]) {
    const states: RecordPrintState[] = []; let calls = 0, printed = 0;
    const session = createRecordPrintSession(async () => { if (++calls > 1) throw error; return snapshot(); },
      state => states.push(state), async () => {}, () => printed++);
    await session.read(); await session.read(true);
    assert.deepEqual(states.at(-1), { busy: false, error }); assert.equal(printed, 0);
    assert.ok(!states.at(-1)?.data);
  }
});

test('late responses after close or replacement cannot resurrect or print previous authorization data', async () => {
  const old = deferred<DataRecordPrint>(); const newer = deferred<DataRecordPrint>(); const states: RecordPrintState[] = [];
  let loads = 0, printed = 0;
  const session = createRecordPrintSession(() => ++loads === 1 ? old.promise : newer.promise,
    state => states.push(state), async () => {}, () => printed++);
  const first = session.read(true); const second = session.read(); newer.resolve(snapshot('新资料')); await second;
  old.resolve(snapshot('旧资料')); await first;
  assert.equal(states.at(-1)?.data?.data.title, '新资料'); assert.equal(printed, 0);
  const pending = deferred<DataRecordPrint>(); const closedStates: RecordPrintState[] = [];
  const closed = createRecordPrintSession(() => pending.promise, state => closedStates.push(state), async () => {}, () => printed++);
  const read = closed.read(true); closed.close(); pending.resolve(snapshot('撤权前')); await read;
  assert.deepEqual(closedStates, [{ busy: true }]); assert.equal(printed, 0);
});

test('closing or changing identity while the new preview is rendering prevents system print', async () => {
  const rendering = deferred<void>(); let printed = 0;
  const session = createRecordPrintSession(async () => snapshot(), () => {}, () => rendering.promise, () => printed++);
  const read = session.read(true); await Promise.resolve(); session.close(); rendering.resolve(); await read;
  assert.equal(printed, 0);
});

test('print documents escape markup and show file names, fixed option labels and full long values', () => {
  const data = snapshot('<script>alert(1)</script>');
  data.fields.push({ code: 'file', label: '证明', type: 'file', widget: 'attachment' },
    { code: 'reason', label: '原因', type: 'option.single', widget: 'select', options: [{ value: 'illness', label: '因病' }] },
    { code: 'detail', label: '说明', type: 'text.long', widget: 'textarea' });
  data.data.file = [{ fileName: '康复证明.pdf', fileSize: 99, url: 'https://private.test/file', fileId: 'SECRET_FILE_ID' }];
  data.data.reason = { value: 'illness', label: '旧标签' }; data.data.detail = '长内容'.repeat(200);
  const html = renderToStaticMarkup(createElement(ResourceRecordPrintDocument, { snapshot: data, timeZone: 'Asia/Shanghai' }));
  assert.doesNotMatch(html, /<script|private\.test|SECRET_FILE_ID|旧标签|<button|<input/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /康复证明.pdf（99 字节）/); assert.match(html, /因病/);
  assert.ok(html.includes(String(data.data.detail)));
  assert.equal(recordPrintFieldText(data.fields[0]!, null), '—');
});
