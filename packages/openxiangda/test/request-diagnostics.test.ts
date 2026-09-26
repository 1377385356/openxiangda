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
