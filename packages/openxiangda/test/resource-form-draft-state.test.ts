import assert from 'node:assert/strict';
import test from 'node:test';
import { configureApplicationIdentity } from '../src/core';
import { createResourceFormDraftClient } from '../src/browser/platform-client';

test('authenticated form drafts keep business values and workspace state separate', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  configureApplicationIdentity({ appCode: 'draft-demo', appName: '草稿验证' });
  const meta: Record<string, string> = {
    'openxiangda-runtime-base': '/runtime/draft-demo',
    'openxiangda-app-code': 'draft-demo',
    'openxiangda-environment': 'preproduction',
  };
  globalThis.document = {
    querySelector: (selector: string) => ({
      content: meta[selector.match(/name="([^"]+)"/)?.[1] || ''] || '',
    }),
  } as any;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response(
      JSON.stringify({
        code: 200,
        data: init?.method === 'POST'
          ? {
              id: body.id,
              revision: 1,
              mode: body.mode,
              values: body.values,
              state: body.state,
              stateSchemaVersion: 7,
              stateSchemaDigest: 'a'.repeat(64),
              updatedAt: '2026-09-21T00:00:00.000Z',
              expiresAt: '2026-12-20T00:00:00.000Z',
            }
          : {
              items: [],
              limit: 20,
              retentionDays: 90,
              stateSchema: {
                schemaVersion: 'openxiangda.form-draft-state-schema/v2',
                version: 7,
                digest: 'a'.repeat(64),
                maxBytes: 4096,
                fields: { mode: { type: 'string', maxLength: 32 } },
              },
            },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
  try {
    const client = createResourceFormDraftClient('contracts', 'create', undefined, 'drafting');
    const listed = await client.list();
    const saved = await client.save({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expectedRevision: 0,
      values: { title: 'A' },
      state: { mode: 'custom' },
    });
    assert.equal(listed.stateSchema?.version, 7);
    assert.deepEqual(saved.values, { title: 'A' });
    assert.deepEqual(saved.state, { mode: 'custom' });
    assert.equal(saved.stateSchemaDigest, 'a'.repeat(64));
    assert.equal(requests[0]?.url, '/service/openxiangda-api/v2/applications/draft-demo/native/form-drafts/contracts/?environmentKey=preproduction&mode=create&viewCode=drafting');
    const body = JSON.parse(String(requests[1]?.init?.body));
    assert.deepEqual(body.values, { title: 'A' });
    assert.deepEqual(body.state, { mode: 'custom' });
    assert.equal('contractText' in body.values, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete (globalThis as any).document;
    else globalThis.document = originalDocument;
  }
});

test('named workflow drafts pin environment and workflow scope without a Native submit client', async () => {
  const { createWorkflowFormDraftClient } = await import('../src/browser/platform-client');
  const oldFetch = globalThis.fetch;
  const oldDocument = globalThis.document;
  const requests: Array<{ url: string; body: any }> = [];
  configureApplicationIdentity({ appCode: 'draft-demo', appName: '草稿验证' });
  const meta: Record<string, string> = {
    'openxiangda-runtime-base': '/runtime/draft-demo',
    'openxiangda-app-code': 'draft-demo',
    'openxiangda-environment': 'preproduction',
  };
  globalThis.document = { querySelector: (selector: string) => ({ content: meta[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ code: 200, data: { items: [], id: 'draft', revision: 1 } }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const client = createWorkflowFormDraftClient('contracts', { workflowCode: 'contract-approval', operationCode: 'submit-contract-approval' });
    assert.equal('submit' in client, false);
    await client.list();
    const query = new URL(requests[0].url, 'http://localhost').searchParams;
    assert.equal(query.get('workflowCode'), 'contract-approval');
    assert.equal(query.get('operationCode'), 'submit-contract-approval');
    assert.equal(query.get('environmentKey'), 'preproduction');
    await client.save({ id: 'draft', expectedRevision: 0, values: { title: 'draft' }, state: { editor: 'content' }, mode: 'update', workflowCode: 'wrong' } as any);
    assert.equal(requests[1].body.workflowCode, 'contract-approval');
    assert.equal(requests[1].body.mode, 'create');
    assert.deepEqual(requests[1].body.state, { editor: 'content' });
    await client.remove({ id: 'draft', revision: 1 });
    assert.equal(requests[2].body.operationCode, 'submit-contract-approval');
    assert.equal(requests[2].body.expectedRevision, 1);
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.document = oldDocument;
  }
});
