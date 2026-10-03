import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenXiangdaPlatformRequestError, platformRequestDiagnostic, requestApplicationApi, createNativeResourceClient } from '../src/browser/platform-client';
import { platformRequestDiagnostic as publicDiagnostic } from '../src/react';

async function fixture(work: () => Promise<void>) {
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document;
  const meta: Record<string, string> = { 'openxiangda-runtime-base': '/runtime/diagnostic', 'openxiangda-app-code': 'diagnostic', 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: meta[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  try { await work(); } finally { globalThis.fetch = previousFetch; if (previousDocument === undefined) delete (globalThis as any).document; else globalThis.document = previousDocument; }
}
const failed = (id: string, status = 503, code = 'PLATFORM_REQUEST_FAILED') => new Response(JSON.stringify({ code: status, errorCode: code, requestId: 'body-id', message: 'private message', data: { secret: 'private data' } }), { status, headers: { 'x-request-id': id } });

test('public diagnostics prefer the authoritative header and exclude query, body, data and message', async () => fixture(async () => {
  globalThis.fetch = async () => failed('gateway-request-1');
  await assert.rejects(requestApplicationApi('/example?token=secret', { method: 'POST', body: JSON.stringify({ private: 'request-secret' }) }), error => {
    assert.ok(error instanceof OpenXiangdaPlatformRequestError);
    const diagnostic = publicDiagnostic(error)!;
    assert.equal(diagnostic.requestId, 'gateway-request-1');
    assert.equal(diagnostic.method, 'POST');
    assert.equal(diagnostic.appCode, 'diagnostic'); assert.equal(diagnostic.environmentKey, 'preproduction');
    assert.ok(Number.isFinite(Date.parse(diagnostic.observedAt)));
    assert.ok(diagnostic.path.endsWith('/example'));
    assert.doesNotMatch(JSON.stringify(diagnostic), /secret|private|token|message|body-id/);
    return true;
  });
  globalThis.fetch = async () => failed('https://private.invalid/?token=hidden');
  await assert.rejects(requestApplicationApi('/example'), error => { assert.equal(platformRequestDiagnostic(error)!.requestId, 'body-id'); return true; });
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 500, requestId: 'a'.repeat(129) }), { status: 500 });
  await assert.rejects(requestApplicationApi('/example'), error => { assert.equal(platformRequestDiagnostic(error)!.requestId, null); return true; });
}));

test('unknown transport writes are sent once and do not leak the fetch exception; cancellation stays cancellation', async () => fixture(async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('https://user:secret@private/?token=hidden'); };
  await assert.rejects(requestApplicationApi('/write', { method: 'POST', body: '{}' }), error => {
    const value = platformRequestDiagnostic(error)!;
    assert.equal(value.code, 'PLATFORM_TRANSPORT_UNAVAILABLE'); assert.equal(value.requestId, null);
    assert.doesNotMatch(String(error), /user:|secret|hidden|private/); return true;
  });
  assert.equal(calls, 1);
  globalThis.fetch = async () => { throw new DOMException('cancelled', 'AbortError'); };
  await assert.rejects(requestApplicationApi('/write', { method: 'POST' }), { name: 'AbortError' });
}));

test('export errors and exhausted read retries retain the last request context', async () => fixture(async () => {
  const client = createNativeResourceClient('records', { fields: { name: { type: 'text.short' } }, list: {} } as any);
  globalThis.fetch = async () => failed('export-request');
  await assert.rejects(client.exportCsv({}, ['name']), error => {
    assert.ok(error instanceof OpenXiangdaPlatformRequestError);
    assert.equal(platformRequestDiagnostic(error)!.requestId, 'export-request'); return true;
  });
  let reads = 0;
  globalThis.fetch = async () => failed(`read-${++reads}`, 503, 'OPENXIANGDA_AUTHORIZATION_PROJECTION_NOT_READY');
  await assert.rejects(client.get('record'), error => {
    assert.equal(platformRequestDiagnostic(error)!.requestId, 'read-4');
    assert.equal(platformRequestDiagnostic(error)!.method, 'GET'); return true;
  });
  assert.equal(reads, 4);
}));

test('business and permission refusals preserve display message separately from code and retryability', async () => fixture(async () => {
  for (const status of [400, 403, 409, 422]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({
      code: 'BUSINESS_ALREADY_REGISTERED', message: '该人员已有有效报名，请先核对原报名。', retryable: false,
    }), {status, headers:{'x-request-id':'business-refusal'}}); };
    await assert.rejects(requestApplicationApi('/register', {method:'POST',body:'{}'}), error => {
      assert.ok(error instanceof OpenXiangdaPlatformRequestError);
      assert.equal(error.message, '该人员已有有效报名，请先核对原报名。');
      assert.equal(error.code, 'BUSINESS_ALREADY_REGISTERED');
      assert.equal(error.status, status); assert.equal(error.retryable, false);
      assert.equal(platformRequestDiagnostic(error)!.requestId, 'business-refusal');
      return true;
    });
    assert.equal(calls, 1);
  }
}));

test('throttled requests preserve Retry-After for bounded durable intake recovery',async()=>fixture(async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({code:429,errorCode:'CONCURRENCY_RATE_LIMITED'}),{status:429,headers:{'retry-after':'12'}});
  await assert.rejects(requestApplicationApi('/enqueue',{method:'POST',body:'{}'}),(error:any)=>error instanceof OpenXiangdaPlatformRequestError&&error.retryAfterMs===12000);
}));

test('native Nest HTTP refusals preserve the message without requiring an envelope code', async () => fixture(async () => {
  for (const status of [400, 403, 409, 422]) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({
        statusCode: 200, error: 'Conflict', message: '试卷已变化或该仪器已有试卷，不能覆盖',
        retryable: false, data: { guardIndex: 2, secret: 'private data' },
      }), { status, headers: { 'x-request-id': 'nest-refusal', 'retry-after': '3' } });
    };
    await assert.rejects(requestApplicationApi('/paper/prepare?token=secret', { method: 'POST', body: '{}' }), error => {
      assert.ok(error instanceof OpenXiangdaPlatformRequestError);
      assert.equal(error.message, '试卷已变化或该仪器已有试卷，不能覆盖');
      assert.equal(error.status, status);
      assert.equal(error.code, `HTTP_${status}`);
      assert.equal(error.retryable, false);
      assert.equal(error.retryAfterMs, 3000);
      assert.equal((error.data as any).guardIndex, 2);
      assert.equal(platformRequestDiagnostic(error)!.requestId, 'nest-refusal');
      assert.doesNotMatch(JSON.stringify(platformRequestDiagnostic(error)), /secret|private|试卷|token|guardIndex/);
      return true;
    });
    assert.equal(calls, 1);
  }
  globalThis.fetch = async () => new Response(JSON.stringify({
    errorCode: 'PAPER_CONTEXT_CHANGED', message: '请刷新试卷后核对草稿',
  }), { status: 409 });
  await assert.rejects(requestApplicationApi('/paper/prepare', { method: 'POST' }), error => {
    assert.ok(error instanceof OpenXiangdaPlatformRequestError);
    assert.equal(error.code, 'PAPER_CONTEXT_CHANGED');
    assert.equal(error.message, '请刷新试卷后核对草稿');
    return true;
  });
}));

test('plain successful JSON stays plain and non-object HTTP errors keep fallback diagnostics', async () => fixture(async () => {
  const value = { statusCode: 200, message: 'saved', data: { id: 'receipt' } };
  globalThis.fetch = async () => new Response(JSON.stringify(value));
  assert.deepEqual(await requestApplicationApi('/paper'), value);
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 200, data: value }));
  assert.deepEqual(await requestApplicationApi('/paper'), value);
  for (const body of ['null', '"private error"', '[{"message":"private error"}]', 'invalid JSON']) {
    globalThis.fetch = async () => new Response(body, { status: 409, headers: { 'x-request-id': 'fallback-refusal' } });
    await assert.rejects(requestApplicationApi('/paper'), error => {
      assert.ok(error instanceof OpenXiangdaPlatformRequestError);
      assert.equal(error.code, 'HTTP_409');
      assert.equal(error.message, 'HTTP_409: 平台请求失败 (requestId: fallback-refusal)');
      assert.equal(platformRequestDiagnostic(error)!.requestId, 'fallback-refusal');
      return true;
    });
  }
}));
