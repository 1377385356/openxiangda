import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { consumeAgentStream } from '../src/browser/agent-stream';
import { AgentConversationController } from '../src/browser/agent-conversation';
import type { AgentConversationSnapshot, AgentUpdatedEvent, ApplicationAgentTransport } from '../src/browser/agent-protocol';

const id = randomUUID(), run = randomUUID(), card = randomUUID(), tool = randomUUID();
function snapshot(): AgentConversationSnapshot {
  return { conversation: { id, agentCode: 'assistant', title: '测试', activeRunId: null, createdAt: '', updatedAt: '' },
    messages: [], runs: [], tools: [], interactions: [], cursor: 0 };
}
const frame = (seq: number, type: string, data: unknown) => `id: ${seq}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
const control = (type: string, cursor: number | string) => `event: stream.${type}\ndata: ${JSON.stringify({ cursor })}\n\n`;
function stream(text: string, split = 0) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    for (let i = 0; i < bytes.length; i += split || bytes.length) controller.enqueue(bytes.slice(i, i + (split || bytes.length)));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}
function storage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
function fixture() {
  let value = snapshot();
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  let write: (path: string, init: RequestInit) => Promise<unknown> = async () => ({ id: run, state: 'queued' });
  let events: string | undefined;
  const transport: ApplicationAgentTransport = {
    scope: 'app:alice:preproduction',
    json: async <T>(path: string, init?: RequestInit) => {
      requests.push({ path, init });
      if (init?.method === 'POST') return await write(path, init) as T;
      if (path.startsWith('/conversations?')) return { items: [], nextCursor: null } as T;
      return structuredClone(value) as T;
    },
    stream: async () => stream(events || control('ready', value.cursor) + control('idle', value.cursor)),
    onDispose: () => () => {}, dispose() {},
  };
  const saved = storage();
  const controller = new AgentConversationController(transport, 'assistant', saved);
  return { controller, transport, requests, saved, get value() { return value; }, set value(next) { value = next; },
    set write(next: typeof write) { write = next; }, set events(next: string) { events = next; } };
}

test('neutral SSE survives byte-split UTF8 and CRLF; duplicate seq is discarded', async () => {
  const events: AgentUpdatedEvent[] = [];
  const text = (control('ready', 0) + frame(1, 'message.updated', { id: 'm', content: '访客已到' }) +
    frame(1, 'message.updated', { id: 'm', content: '重复不覆盖' }) + frame(2, 'run.updated', { id: 'r', state: 'completed' }) + control('idle', 2)).replace(/\n/g, '\r\n');
  const result = await consumeAgentStream(stream(text, 1), 0, event => events.push(event), new AbortController().signal);
  assert.deepEqual(result, { cursor: 2, idle: true }); assert.equal(events.length, 2);
  assert.equal((events[0]!.data as { content: string }).content, '访客已到');
});

test('all five updates are accepted, but future engine vocabulary, gaps and fractional ids are refused', async () => {
  const events: AgentUpdatedEvent[] = [];
  const types = ['conversation.updated', 'run.updated', 'message.updated', 'tool.updated', 'interaction.updated'];
  await consumeAgentStream(stream(control('ready', 0) + types.map((type, i) => frame(i + 1, type, { id: type })).join('') + control('idle', 5)),
    0, event => events.push(event), new AbortController().signal);
  assert.equal(events.length, 5);
  for (const text of [frame(1, 'internal.engine', { id: 'private' }), frame(2, 'run.updated', { id: 'r' }),
    'id: 1.2\nevent: message.updated\ndata: {"id":"m"}\n\n', control('idle', 10)])
    await assert.rejects(consumeAgentStream(stream(text), 0, () => {}, new AbortController().signal), /AGENT_STREAM_PROTOCOL_INVALID/);
});

test('SSE leftover/frame budget, invalid UTF8 and truncated frame fail closed', async () => {
  await assert.rejects(consumeAgentStream(stream('data: ' + 'x'.repeat(2 * 1024 * 1024 + 1)), 0, () => {}, new AbortController().signal), /FRAME_LIMIT/);
  await assert.rejects(consumeAgentStream(stream(frame(1, 'message.updated', { id: 'm', content: 'x'.repeat(2 * 1024 * 1024) })), 0, () => {}, new AbortController().signal), /FRAME_LIMIT/);
  await assert.rejects(consumeAgentStream(stream('id: 1\nevent: message.updated\ndata: {}'), 0, () => {}, new AbortController().signal), /PROTOCOL_INVALID/);
  await assert.rejects(consumeAgentStream(new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'text/event-stream' } }), 0, () => {}, new AbortController().signal));
});

test('EOF/idle do not invent business success; abort releases a pending reader', async () => {
  const result = await consumeAgentStream(stream(control('ready', 4)), 4, () => {}, new AbortController().signal);
  assert.deepEqual(result, { cursor: 4, idle: false });
  let cancelled = false;
  const abort = new AbortController();
  const reading = consumeAgentStream(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } }), 0, () => {}, abort.signal);
  abort.abort(); await assert.rejects(reading); assert.equal(cancelled, true);
});

test('mount without a saved pointer performs no reads or writes', async () => {
  const f = fixture(); await f.controller.resume(); assert.equal(f.requests.length, 0); f.controller.dispose();
});

test('complete message updates replace by id, not append tokens', async () => {
  const f = fixture(); f.events = control('ready', 0) + frame(1, 'message.updated', { id: 'm', content: '访客' }) +
    frame(2, 'message.updated', { id: 'm', content: '访客已邀请' }) + control('idle', 2);
  await f.controller.open(id); await setImmediate();
  assert.equal(f.controller.snapshot().snapshot!.messages.length, 1);
  assert.equal(f.controller.snapshot().snapshot!.messages[0]!.content, '访客已邀请'); f.controller.dispose();
});

test('lost send response stays unknown, survives reload with ids only, and recovers by original request', async () => {
  const f = fixture(); await f.controller.open(id);
  f.write = async () => { throw Object.assign(new Error('lost'), { status: 503 }); };
  await assert.rejects(f.controller.send('秘密业务内容')); const pending = f.controller.snapshot().pending!;
  assert.equal(pending.state, 'unknown'); assert.match(pending.requestId, /^[0-9a-f-]{36}$/);
  await assert.rejects(f.controller.send('另一条内容'), /ORIGINAL_RESULT_REQUIRED/);
  assert.equal(f.requests.filter(request => request.init?.method === 'POST').length, 1);
  assert.doesNotMatch([...f.saved.data.values()].join(''), /秘密|另一条|csrf|cookie|provider/);
  f.controller.dispose();
  const restored = new AgentConversationController(f.transport, 'assistant', f.saved);
  await restored.resume(); assert.equal(restored.snapshot().pending?.requestId, pending.requestId);
  f.value.messages.push({ id: 'm', runId: run, requestId: pending.requestId, role: 'user', content: '秘密业务内容', createdAt: '' });
  await restored.recover(); assert.equal(restored.snapshot().pending, undefined);
  assert.equal(restored.snapshot().lastResolution?.disposition, 'acknowledged');
  assert.equal(f.requests.filter(request => request.init?.method === 'POST').length, 1); restored.dispose();
});

test('lost creation recovers the exact original request without creating a replacement', async () => {
  const f = fixture(); f.write = async () => { throw new TypeError('offline'); };
  await assert.rejects(f.controller.newConversation()); const pending = f.controller.snapshot().pending!;
  const original = f.transport.json;
  f.transport.json = async <T>(path: string, init?: RequestInit) => path.startsWith('/conversations?')
    ? { items: [{ ...f.value.conversation, requestId: pending.requestId }], nextCursor: null } as T : original<T>(path, init);
  await f.controller.recover(); assert.equal(f.controller.snapshot().snapshot?.conversation.id, id);
  assert.equal(f.controller.snapshot().pending, undefined);
  assert.equal(f.requests.filter(request => request.init?.method === 'POST').length, 1); f.controller.dispose();
});

test('typed submission freezes null/false/number/reference and never merges old partialInput', async () => {
  const f = fixture(); f.value.interactions = [{ id: card, kind: 'input', summary: null, conversationId: id, originRunId: run,
    inputCard: {}, partialInput: { untouched: 'old-value' }, state: 'waiting_input', revision: 7, expiresAt: '', createdAt: '' }];
  await f.controller.open(id);
  const input = { name: null, count: 12, enabled: false, ref: { resource: 'areas', recordId: 'A' } };
  f.write = async (_path, init) => {
    input.ref.recordId = 'changed-after-dispatch';
    const sent = JSON.parse(String(init.body));
    assert.deepEqual(sent.input, { name: null, count: 12, enabled: false, ref: { resource: 'areas', recordId: 'A' } });
    assert.equal('untouched' in sent.input, false); throw Object.assign(new Error('lost'), { status: 503 });
  };
  await assert.rejects(f.controller.submitInteraction(card, 7, input));
  const pending = f.controller.snapshot().pending!;
  assert.doesNotMatch([...f.saved.data.values()].join(''), /old-value|recordId|changed-after/);
  f.value.interactions[0]!.requestId = pending.requestId; f.value.interactions[0]!.state = 'submitted';
  await f.controller.recover(); assert.equal(f.controller.snapshot().pending, undefined);
  assert.equal(f.controller.snapshot().lastResolution?.disposition, 'acknowledged'); f.controller.dispose();
});

test('another submission closes an old intent without attributing it to this request', async () => {
  const f = fixture(); f.value.interactions = [{ id: card, kind: 'input', summary: null, conversationId: id, originRunId: run,
    inputCard: {}, partialInput: {}, state: 'waiting_input', revision: 1, expiresAt: '', createdAt: '' }];
  await f.controller.open(id); f.write = async () => { throw new TypeError('offline'); };
  await assert.rejects(f.controller.confirm(card, 1));
  f.value.interactions[0]!.requestId = randomUUID(); f.value.interactions[0]!.state = 'submitted';
  await f.controller.recover(); assert.equal(f.controller.snapshot().lastResolution?.disposition, 'closed'); f.controller.dispose();
});

test('double click is refused throughout an in-flight POST even if SSE already observed it', async () => {
  const f = fixture(); await f.controller.open(id);
  let resolve!: (result: unknown) => void;
  f.write = async () => new Promise(done => { resolve = done; });
  const sending = f.controller.send('邀请'); await setImmediate();
  const pending = f.controller.snapshot().pending!;
  f.value.messages.push({ id: 'm', runId: run, role: 'user', requestId: pending.requestId, content: '邀请', createdAt: '' });
  await f.controller.refresh();
  assert.equal(f.controller.snapshot().pending?.state, 'pending');
  await assert.rejects(f.controller.send('邀请'), /ORIGINAL_RESULT_REQUIRED/);
  resolve({ id: run, state: 'queued' }); await sending;
  assert.equal(f.requests.filter(request => request.init?.method === 'POST').length, 1); f.controller.dispose();
});

test('known refusal permits a new intent; timeout does not', async () => {
  const f = fixture(); await f.controller.open(id);
  f.write = async () => { throw Object.assign(new Error('denied'), { status: 403 }); };
  await assert.rejects(f.controller.send('邀请')); assert.equal(f.controller.snapshot().pending, undefined);
  f.write = async () => { throw Object.assign(new Error('timeout'), { status: 408 }); };
  await assert.rejects(f.controller.send('邀请')); assert.equal(f.controller.snapshot().pending?.state, 'unknown'); f.controller.dispose();
});

test('still_unknown reconciliation is not a receipt; manual outcome uses the existing server vocabulary', async () => {
  const f = fixture(); f.value.tools.push({ id: tool, runId: run, state: 'outcome_unknown', summary: '', presentation: null,
    reconciliation: { state: 'still_unknown' }, createdAt: '' });
  await f.controller.open(id); f.write = async () => { throw new TypeError('lost'); };
  await assert.rejects(f.controller.reconcile(tool)); await f.controller.recover();
  assert.equal(f.controller.snapshot().pending?.state, 'unknown');
  f.value.tools[0]!.reconciliation = { state: 'manually_resolved', outcome: 'not_executed', source: 'operator' };
  await f.controller.recover(); assert.equal(f.controller.snapshot().lastResolution?.disposition, 'closed'); f.controller.dispose();
});

test('dispose aborts observation and never displays a late POST/read from the old identity', async () => {
  const f = fixture(); await f.controller.open(id);
  let resolve!: (result: unknown) => void;
  f.write = async () => new Promise(done => { resolve = done; });
  const sending = f.controller.send('原账号'); await setImmediate(); f.controller.dispose();
  resolve({ id: run }); await assert.rejects(sending, /DISPOSED/);
  assert.equal(f.controller.snapshot().phase, 'disposed'); assert.equal(f.controller.snapshot().snapshot, undefined);
  assert.doesNotMatch([...f.saved.data.values()].join(''), /原账号/);
});

test('different agent snapshot and corrupted recovery pointers fail closed', async () => {
  const f = fixture(); f.value.conversation.agentCode = 'other';
  await assert.rejects(f.controller.open(id), /SNAPSHOT_INVALID/); assert.equal(f.controller.snapshot().snapshot, undefined); f.controller.dispose();
  const other = fixture(); other.saved.data.set(`openxiangda:agent:v1:${JSON.stringify([other.transport.scope, 'assistant'])}`, JSON.stringify({ version: 1, conversationId: 'bad' }));
  await assert.rejects(other.controller.resume(), /RECOVERY_INVALID/);
  await assert.rejects(other.controller.send('不能覆盖原状态'), /RECOVERY_INVALID/); assert.equal(other.requests.length, 0); other.controller.dispose();
});

test('disconnect resumes from the last applied durable seq, not from a control frame', async () => {
  const f = fixture(), attempts: string[] = [];
  f.transport.stream = async path => {
    attempts.push(path);
    return attempts.length === 1 ? stream(control('ready', 0) + frame(1, 'message.updated', { id: 'm', content: '第一段' }))
      : stream(control('ready', 1) + frame(2, 'message.updated', { id: 'm', content: '完整投影' }) + control('idle', 2));
  };
  await f.controller.open(id); await new Promise(resolve => setTimeout(resolve, 350));
  assert.deepEqual(attempts.map(path => new URL(path, 'http://fixture').searchParams.get('after')), ['0', '1']);
  assert.equal(f.controller.snapshot().snapshot!.messages[0]!.content, '完整投影'); f.controller.dispose();
});

test('readonly reconnects stop after three retries; refresh is an explicit new observer', async () => {
  const f = fixture(); let attempts = 0;
  f.transport.stream = async () => { attempts++; throw Object.assign(new Error('offline'), { status: 503 }); };
  await f.controller.open(id); await new Promise(resolve => setTimeout(resolve, 2850));
  assert.equal(attempts, 4); assert.equal(f.controller.snapshot().stream, 'disconnected');
  assert.equal(f.requests.filter(request => request.init?.method === 'POST').length, 0); f.controller.dispose();
});

test('raw client lazy writes restore a saved unknown intent before generating any new request', async () => {
  const f = fixture(); await f.controller.open(id); f.write = async () => { throw new TypeError('lost'); };
  await assert.rejects(f.controller.send('原意图')); f.controller.dispose();
  const restored = new AgentConversationController(f.transport, 'assistant', f.saved);
  await assert.rejects(restored.send('新键不能绕过原未知请求'), /ORIGINAL_RESULT_REQUIRED/);
  assert.equal(f.requests.filter(request => request.init?.method === 'POST').length, 1); restored.dispose();
});

test('malformed successful HTTP mutation body remains unknown instead of clearing its request key', async () => {
  const f = fixture(); await f.controller.open(id); f.write = async () => ({ id: 'invalid', state: 'queued' });
  await assert.rejects(f.controller.send('请求'), /RESPONSE_INVALID/);
  assert.equal(f.controller.snapshot().pending?.state, 'unknown'); f.controller.dispose();
});
