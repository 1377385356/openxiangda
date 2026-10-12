import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts/browser';
import { configureApplicationIdentity } from '../src/browser/runtime-meta';
import { createApplicationAgentClient, useAgents, useAgentConversation } from '../src/agent';
import { createApplicationAgentTransport, loadRuntimeAuthorization } from '../src/browser/platform-client';

test('public client uses only runtime app/environment/actor and the existing cookie, CSRF and login invalidation owner', async () => {
  const savedFetch = globalThis.fetch, savedDocument = globalThis.document;
  const metadata: Record<string, string> = {
    'openxiangda-runtime-base': '/runtime/agent-client-test/preproduction',
    'openxiangda-app-code': 'agent-client-test', 'openxiangda-environment': 'preproduction',
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector(selector: string) {
    const key = /meta\[name="([^"]+)"\]/.exec(selector)?.[1]; return key && metadata[key] ? { content: metadata[key] } : null;
  } } });
  configureApplicationIdentity({ appCode: 'agent-client-test', appName: '测试助手' });
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const conversationId = randomUUID();
  let user = 'alice', unauthorized = false;
  const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({ code: status, data }), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, init) => {
    const path = String(url); requests.push({ url: path, init });
    if (path.includes('/native/authz/current')) return envelope({ schemaVersion: SCHEMA_VERSIONS.runtimeAuthorization,
      state: 'active', environment: { id: 'test-environment', key: 'preproduction' },
      principal: { type: 'user_union', userId: user, roleCodes: ['employee'], capabilityCodes: [], isAppSuperAdmin: false, identityScope: `scope:${user}` },
      subjectProfile: {}, roles: [] });
    if (path.includes('/auth/surface')) return envelope({ csrfToken: 'fixture-csrf' });
    if (path === '/service/api/auth/refresh') return envelope(null, 401);
    if (unauthorized) return envelope(null, 401);
    if (path.includes('/agent/conversations/') && !path.includes('/events')) return envelope({
      conversation: { id: conversationId, agentCode: 'assistant', title: '历史', activeRunId: null }, messages: [], runs: [], tools: [], interactions: [], cursor: 0 });
    if (path.includes('/events')) return new Response('event: stream.ready\ndata: {"cursor":0}\n\nevent: stream.idle\ndata: {"cursor":0}\n\n', { headers: { 'content-type': 'text/event-stream' } });
    return envelope({ items: [], nextCursor: null });
  };
  let client: ReturnType<typeof createApplicationAgentClient> | undefined;
  try {
    assert.equal(typeof useAgents, 'function'); assert.equal(typeof useAgentConversation, 'function');
    await loadRuntimeAuthorization({ refresh: true });
    client = createApplicationAgentClient();
    await client.agents(); await client.conversations('assistant', { search: '访客', limit: 20 });
    const history = client.conversation('assistant'); await history.open(conversationId);
    assert.equal(history.snapshot().snapshot?.conversation.id, conversationId);
    const transport = createApplicationAgentTransport();
    await transport.json(`/interactions/${randomUUID()}/submit`, { method: 'POST', body: JSON.stringify({ requestId: randomUUID(), revision: 1, input: { name: null } }) });
    const writes = requests.filter(request => request.url.includes('/agent/') && request.init?.method === 'POST');
    assert.equal(writes.length, 1); assert.equal(new Headers(writes[0]!.init!.headers).get('x-openxiangda-csrf-token'), 'fixture-csrf');
    assert.equal(writes[0]!.init!.credentials, 'include');
    assert.equal(new URL(writes[0]!.url, 'http://fixture').searchParams.get('environmentKey'), 'preproduction');
    for (const path of ['//evil.test/agents', '/agents?environmentKey=production', '/agents?appCode=other', '/conversations/../agents', '/agents#other'])
      await assert.rejects(transport.json(path), /AGENT_ENDPOINT_INVALID/);
    transport.dispose();

    user = 'bob'; await loadRuntimeAuthorization({ refresh: true });
    const before = requests.length;
    await assert.rejects(client.agents(), /用户或应用环境已变化/);
    assert.equal(requests.length, before); assert.equal(history.snapshot().phase, 'disposed'); assert.equal(history.snapshot().snapshot, undefined);
    client.dispose(); client = createApplicationAgentClient();
    const bob = client.conversation('assistant'); await bob.open(conversationId);
    unauthorized = true;
    await assert.rejects(client.agents());
    assert.equal(bob.snapshot().phase, 'disposed'); assert.equal(bob.snapshot().snapshot, undefined);
    assert.throws(() => createApplicationAgentClient(), /CURRENT_USER_REQUIRED/);
  } finally {
    client?.dispose(); globalThis.fetch = savedFetch;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: savedDocument });
  }
});
