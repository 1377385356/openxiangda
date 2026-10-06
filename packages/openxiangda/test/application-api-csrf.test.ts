import assert from 'node:assert/strict';
import test from 'node:test';
import { configureApplicationIdentity, loadApplicationLoginSurface, requestApplicationApi } from '../src/core';

test('ordinary application API writes retain the login CSRF and original body through failure and resolution', async () => {
  configureApplicationIdentity({ appCode: 'api-csrf-test', appName: 'API CSRF test' });
  const previous = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).includes('/auth/surface')) return Response.json({ code: 200, data: { csrfToken: 'verified-login-csrf' } });
    if (JSON.parse(String(init?.body || '{}')).mode === 'generate') return Response.json({ message: 'lost generation response' }, { status: 503 });
    return Response.json({ code: 200, data: { outcome: 'committed', id: 'original-file' } });
  };
  try {
    await requestApplicationApi('/api/records');
    assert.equal(requests.length, 1);
    await loadApplicationLoginSurface({ device: 'desktop', returnTo: '/' });
    const wire = JSON.stringify({ mode: 'generate', idempotencyKey: 'original-key' });
    await assert.rejects(requestApplicationApi('/api/documents', { method: 'POST', body: wire }));
    const generated = requests.filter(request => request.url.endsWith('/api/documents'));
    assert.equal(generated.length, 1);
    assert.equal(generated[0]!.init!.body, wire);
    assert.equal(generated[0]!.init!.credentials, 'include');
    assert.equal(new Headers(generated[0]!.init!.headers).get('x-openxiangda-csrf-token'), 'verified-login-csrf');
    const result = await requestApplicationApi<{ id: string }>('/api/documents', {
      method: 'POST', body: JSON.stringify({ mode: 'resolve', idempotencyKey: 'original-key' }),
      headers: { 'x-openxiangda-csrf-token': 'original-bound-csrf' },
    });
    assert.equal(result.id, 'original-file');
    assert.equal(new Headers(requests.at(-1)!.init!.headers).get('x-openxiangda-csrf-token'), 'original-bound-csrf');
  } finally { globalThis.fetch = previous; }
});
