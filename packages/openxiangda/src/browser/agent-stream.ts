import type { AgentUpdatedEvent } from './agent-protocol';

const EVENT_TYPES = new Set([
  'conversation.updated', 'run.updated', 'message.updated', 'tool.updated', 'interaction.updated',
]);
const MAX_FRAME_BYTES = 2 * 1024 * 1024;

const fail = () => new Error('AGENT_STREAM_PROTOCOL_INVALID');
function cursor(value: unknown): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) throw fail();
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw fail();
  return result;
}

/** Complete message projections replace by id; they are never token deltas. */
export async function consumeAgentStream(
  response: Response,
  after: number,
  onEvent: (event: AgentUpdatedEvent) => void,
  signal: AbortSignal,
): Promise<{ cursor: number; idle: boolean }> {
  cursor(after);
  if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) throw fail();
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', seq = after, idle = false;
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', onAbort, { once: true });
  const dispatch = (frame: string) => {
    if (new TextEncoder().encode(frame).byteLength > MAX_FRAME_BYTES) throw new Error('AGENT_STREAM_FRAME_LIMIT');
    const lines = frame.split(/\r?\n/);
    const values = (name: string) => lines.filter(line => line.startsWith(name + ':')).map(line => line.slice(name.length + 1).replace(/^ /, ''));
    const dataLines = values('data');
    if (!dataLines.length) return; // SSE comments/keepalive.
    const types = values('event'), ids = values('id');
    if (types.length !== 1 || ids.length > 1) throw fail();
    const type = types[0]!;
    const data: unknown = JSON.parse(dataLines.join('\n'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail();
    if (['stream.ready', 'stream.heartbeat', 'stream.idle'].includes(type)) {
      if (ids.length || cursor((data as { cursor?: unknown }).cursor) !== seq) throw fail();
      idle = type === 'stream.idle';
      return;
    }
    if (idle || !EVENT_TYPES.has(type) || ids.length !== 1) throw fail();
    const next = cursor(ids[0]);
    if (next <= seq) return; // reconnect duplicates never change the current projection.
    if (next !== seq + 1 || typeof (data as { id?: unknown }).id !== 'string') throw fail();
    onEvent({ seq: next, type, data } as AgentUpdatedEvent);
    seq = next; // only advance once the consumer has applied the complete projection.
  };
  try {
    while (!signal.aborted) {
      const part = await reader.read();
      if (signal.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
      buffer += decoder.decode(part.value, { stream: !part.done });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        dispatch(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
      if (new TextEncoder().encode(buffer).byteLength > MAX_FRAME_BYTES) throw new Error('AGENT_STREAM_FRAME_LIMIT');
      if (part.done || idle) break;
    }
    if (signal.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
    if (buffer.trim()) throw fail();
    return { cursor: seq, idle };
  } finally {
    signal.removeEventListener('abort', onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
