import assert from 'node:assert/strict';
import test from 'node:test';
import { configureApplicationIdentity } from '../src/core';
import {
  loadResourceListPreference,
  resetResourceListPreference,
  saveResourceListPreference,
  type ResourceListPreference,
} from '../src/browser/platform-client';

test('stores resource list preferences in the current platform account scope', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const preference: ResourceListPreference = {
    version: 1,
    columns: [{ key: 'subject', visible: true }],
    filters: { keyword: '出差', values: { status: 'pending' } },
    sorts: [{ field: 'created_at', direction: 'descend' }],
    density: 'middle',
    pageSize: 20,
  };
  configureApplicationIdentity({
    appCode: 'expense-demo',
    appName: '费用审批演示',
  });
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        code: 200,
        data: init?.method === 'DELETE' ? null : preference,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    await loadResourceListPreference('openxiangda-v2:resource:expense-requests');
    await saveResourceListPreference(
      'openxiangda-v2:resource:expense-requests',
      preference,
    );
    await resetResourceListPreference('openxiangda-v2:resource:expense-requests');

    const path =
      '/service/openxiangda-api/v2/applications/expense-demo/native/admin-list/preferences/' +
      'openxiangda-v2%3Aresource%3Aexpense-requests';
    assert.deepEqual(requests.map(request => request.url), [path, path, path]);
    assert.equal(requests[0]?.init?.credentials, 'include');
    assert.equal(requests[1]?.init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), preference);
    assert.equal(requests[2]?.init?.method, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
