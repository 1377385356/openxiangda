import { createBrowserUuid } from './uuid';
import { consumeAgentStream } from './agent-stream';
import type {
  AgentConversation, AgentConversationPage, AgentConversationSnapshot, AgentInteractionAcceptance,
  AgentReconciliation, AgentRun, AgentUpdatedEvent, ApplicationAgentTransport,
} from './agent-protocol';

export type AgentMutationKind = 'create' | 'send' | 'submit' | 'confirm' | 'cancel-run' | 'cancel-interaction' | 'reconcile' | 'resolve-manually';
export interface AgentPendingMutation {
  kind: AgentMutationKind;
  requestId: string;
  targetId?: string;
  revision?: number;
  state: 'pending' | 'unknown';
}
export interface AgentConversationState {
  phase: 'idle' | 'loading' | 'ready' | 'error' | 'disposed';
  stream: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'disconnected';
  persistence: 'session' | 'memory';
  snapshot?: AgentConversationSnapshot;
  pending?: AgentPendingMutation;
  /** Acknowledged is admission, never business success. Closed does not attribute the change to this request. */
  lastResolution?: { requestId: string; disposition: 'acknowledged' | 'closed' };
  error?: Error;
}
type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS: AgentMutationKind[] = ['create', 'send', 'submit', 'confirm', 'cancel-run', 'cancel-interaction', 'reconcile', 'resolve-manually'];
const asError = (value: unknown): Error => value instanceof Error ? value : new Error('AGENT_REQUEST_FAILED');
const uuid = (value: string) => { if (!UUID.test(value)) throw new Error('AGENT_ID_INVALID'); return value; };
const ambiguous = (error: unknown) => {
  const value = error as { status?: number; code?: string };
  return value.code === 'AGENT_IDENTITY_CHANGED' || !value.status || value.status === 408 || value.status >= 500;
};
export const INITIAL_AGENT_CONVERSATION_STATE: AgentConversationState = Object.freeze({ phase: 'idle', stream: 'idle', persistence: 'memory' });

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason || new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}

function replace<T extends { id: string }>(items: T[], value: T): T[] {
  const index = items.findIndex(item => item.id === value.id);
  if (index < 0) return [...items, value];
  return items.map((item, i) => i === index ? value : item);
}

/** One UI observer and mutation gate. The server still owns every durable state. */
export class AgentConversationController {
  private value: AgentConversationState;
  private readonly listeners = new Set<() => void>();
  private readonly lifetime = new AbortController();
  private streamAbort?: AbortController;
  private conversationId?: string;
  private writing = false;
  private initialized = false;
  private resumePromise?: Promise<void>;
  private readonly storageKey: string;

  constructor(private readonly transport: ApplicationAgentTransport, readonly agentCode: string,
    private readonly storage?: RecoveryStorage) {
    if (!/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/.test(agentCode)) throw new Error('AGENT_CODE_INVALID');
    this.storageKey = `openxiangda:agent:v1:${JSON.stringify([transport.scope, agentCode])}`;
    this.value = { ...INITIAL_AGENT_CONVERSATION_STATE, persistence: storage ? 'session' : 'memory' };
  }
  snapshot = (): AgentConversationState => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<AgentConversationState>): void {
    if (this.lifetime.signal.aborted && patch.phase !== 'disposed') return;
    this.value = Object.freeze({ ...this.value, ...patch });
    this.listeners.forEach(listener => listener());
  }
  private assertLive(): void { if (this.lifetime.signal.aborted) throw new Error('AGENT_OBSERVER_DISPOSED'); }
  private persist(): void {
    if (!this.storage) return;
    try {
      // Never store utterances, typed inputs, tokens, model settings or receipts.
      this.storage.setItem(this.storageKey, JSON.stringify({ version: 1, conversationId: this.conversationId || null, pending: this.value.pending || null }));
    } catch { this.update({ persistence: 'memory' }); }
  }

  /** Mount/reload only reads. It never creates a conversation or replays a write. */
  resume(): Promise<void> {
    this.assertLive();
    if (this.initialized) return this.recover();
    if (!this.resumePromise) this.resumePromise = this.restoreAndRead().then(() => {
      this.initialized = true;
    }).finally(() => { this.resumePromise = undefined; });
    return this.resumePromise;
  }
  private async restoreAndRead(): Promise<void> {
    this.assertLive();
    if (this.storage) {
      try {
        const raw = this.storage.getItem(this.storageKey);
        if (raw) {
          if (raw.length > 4096) throw new Error('AGENT_RECOVERY_INVALID');
          const saved = JSON.parse(raw) as { version?: number; conversationId?: unknown; pending?: AgentPendingMutation };
          if (saved.version !== 1 || (saved.conversationId !== null && (typeof saved.conversationId !== 'string' || !UUID.test(saved.conversationId))))
            throw new Error('AGENT_RECOVERY_INVALID');
          this.conversationId = typeof saved.conversationId === 'string' ? saved.conversationId : undefined;
          if (saved.pending) {
            const pending = saved.pending;
            if (!KINDS.includes(pending.kind) || !UUID.test(pending.requestId) ||
              (pending.targetId !== undefined && !UUID.test(pending.targetId)) ||
              (pending.revision !== undefined && (!Number.isSafeInteger(pending.revision) || pending.revision < 1)))
              throw new Error('AGENT_RECOVERY_INVALID');
            this.update({ pending: { kind: pending.kind, requestId: pending.requestId, targetId: pending.targetId, revision: pending.revision, state: 'unknown' } });
          }
        }
      } catch (error) {
        if ((error as Error)?.message === 'AGENT_RECOVERY_INVALID' || error instanceof SyntaxError) {
          this.update({ phase: 'error', error: asError(error) }); throw error;
        }
        this.update({ persistence: 'memory' }); // Storage can be unavailable; in-memory operation is still possible.
      }
    }
    await this.recover();
  }

  /** Explicit history selection is scoped again by the platform, never trusted from storage. */
  async open(id: string): Promise<void> {
    this.assertLive();
    if (!this.initialized) await this.resume();
    if (this.writing || this.value.pending) throw new Error('AGENT_ORIGINAL_RESULT_REQUIRED');
    this.streamAbort?.abort();
    this.conversationId = uuid(id);
    this.update({ snapshot: undefined, phase: 'loading', error: undefined });
    await this.refresh();
  }

  async newConversation(): Promise<AgentConversation> {
    const conversation = await this.mutate<AgentConversation>('create', '/conversations', { agentCode: this.agentCode });
    uuid(conversation.id);
    this.streamAbort?.abort(); this.conversationId = conversation.id;
    this.update({ snapshot: undefined, lastResolution: undefined }); this.persist();
    await this.refresh().catch(() => {});
    return conversation;
  }

  async send(text: string): Promise<AgentRun> {
    if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw new Error('AGENT_TEXT_INVALID');
    if (!this.initialized) await this.resume();
    if (!this.conversationId) await this.newConversation();
    const result = await this.mutate<AgentRun>('send', `/conversations/${uuid(this.conversationId!)}/runs`, { text }, this.conversationId);
    await this.refresh().catch(() => {}); return result;
  }
  async cancel(runId: string): Promise<AgentRun> {
    const result = await this.mutate<AgentRun>('cancel-run', `/runs/${uuid(runId)}/cancel`, {}, runId, undefined, false);
    await this.refresh().catch(() => {}); return result;
  }
  async submitInteraction(id: string, revision: number, input: Record<string, unknown>): Promise<AgentInteractionAcceptance> {
    if (!Number.isSafeInteger(revision) || revision < 1 || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('AGENT_INPUT_INVALID');
    // Untouched fields stay absent; null is an explicit clear. Do not merge partialInput.
    const result = await this.mutate<AgentInteractionAcceptance>('submit', `/interactions/${uuid(id)}/submit`, { revision, input }, id, revision);
    await this.refresh().catch(() => {}); return result;
  }
  async confirm(id: string, revision: number): Promise<AgentInteractionAcceptance> {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('AGENT_INPUT_INVALID');
    const result = await this.mutate<AgentInteractionAcceptance>('confirm', `/interactions/${uuid(id)}/confirm`, { revision }, id, revision);
    await this.refresh().catch(() => {}); return result;
  }
  async cancelInteraction(id: string): Promise<AgentInteractionAcceptance> {
    const result = await this.mutate<AgentInteractionAcceptance>('cancel-interaction', `/interactions/${uuid(id)}/cancel`, {}, id, undefined, false);
    await this.refresh().catch(() => {}); return result;
  }
  async reconcile(id: string): Promise<AgentReconciliation> {
    const result = await this.mutate<AgentReconciliation>('reconcile', `/tools/${uuid(id)}/reconcile`, {}, id, undefined, false);
    await this.refresh().catch(() => {}); return result;
  }
  async resolveManually(id: string, outcome: 'executed' | 'not_executed', note: string): Promise<AgentReconciliation> {
    if (!['executed', 'not_executed'].includes(outcome) || typeof note !== 'string' || !note.trim() || note.length > 1000) throw new Error('AGENT_INPUT_INVALID');
    const result = await this.mutate<AgentReconciliation>('resolve-manually', `/tools/${uuid(id)}/resolve-manually`, { outcome, note }, id, undefined, false);
    await this.refresh().catch(() => {}); return result;
  }

  private async mutate<T>(kind: AgentMutationKind, path: string, body: Record<string, unknown>, targetId?: string, revision?: number, sendRequestId = true): Promise<T> {
    this.assertLive();
    if (!this.initialized) await this.resume();
    if (this.writing || this.value.pending) throw new Error('AGENT_ORIGINAL_RESULT_REQUIRED');
    if (this.value.error?.message === 'AGENT_RECOVERY_INVALID') throw this.value.error;
    const requestId = createBrowserUuid();
    // Freeze before dispatch, including deep typed values. App mutation of an object cannot change this intent.
    const frozen = JSON.stringify({ ...body, ...(sendRequestId ? { requestId } : {}) });
    this.writing = true;
    this.update({ pending: { kind, requestId, targetId, revision, state: 'pending' }, error: undefined, lastResolution: undefined });
    this.persist();
    try {
      const result = await this.transport.json<T>(path, { method: 'POST', body: frozen, signal: this.lifetime.signal });
      this.assertLive();
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('AGENT_RESPONSE_INVALID');
      const record = result as Record<string, unknown>;
      if (kind === 'create' && (typeof record.id !== 'string' || !UUID.test(record.id) || record.agentCode !== this.agentCode) ||
          ['send', 'cancel-run'].includes(kind) && (typeof record.id !== 'string' || !UUID.test(record.id) || typeof record.state !== 'string') ||
          !['create', 'send', 'cancel-run'].includes(kind) && typeof record.state !== 'string') throw new Error('AGENT_RESPONSE_INVALID');
      this.update({ pending: undefined, lastResolution: { requestId, disposition: 'acknowledged' } });
      this.persist(); return result;
    } catch (error) {
      if (ambiguous(error)) {
        this.update({ pending: { kind, requestId, targetId, revision, state: 'unknown' }, error: asError(error) });
      } else { this.update({ pending: undefined, error: asError(error) }); }
      this.persist(); throw error;
    } finally { this.writing = false; this.resolvePending(); }
  }

  /** Read original correlation first. An absent result remains unknown, not permission to resubmit. */
  async recover(): Promise<void> {
    try { await this.recoverOriginal(); }
    catch (error) { this.update({ phase: 'error', error: asError(error) }); throw error; }
  }
  private async recoverOriginal(): Promise<void> {
    this.assertLive();
    const pending = this.value.pending;
    if (pending?.kind === 'create') {
      const query = new URLSearchParams({ agentCode: this.agentCode, requestId: pending.requestId });
      const page = await this.transport.json<AgentConversationPage>(`/conversations?${query}`, { signal: this.lifetime.signal });
      this.assertLive();
      const found = page.items.find(item => item.requestId === pending.requestId && item.agentCode === this.agentCode);
      if (!found) return;
      this.conversationId = uuid(found.id);
      this.update({ pending: undefined, snapshot: undefined, lastResolution: { requestId: pending.requestId, disposition: 'acknowledged' } });
      this.persist();
    }
    if (this.conversationId) await this.refresh();
  }

  async refresh(): Promise<void> {
    this.assertLive();
    if (!this.conversationId) return;
    try {
      await this.readSnapshot();
      this.startStream();
    } catch (error) {
      this.update({ phase: 'error', error: asError(error) }); throw error;
    }
  }
  private async readSnapshot(): Promise<void> {
    const id = this.conversationId!;
    const snapshot = await this.transport.json<AgentConversationSnapshot>(`/conversations/${uuid(id)}`, { signal: this.lifetime.signal });
    this.assertLive();
    if (this.conversationId !== id) return;
    if (!snapshot || snapshot.conversation?.id !== id || snapshot.conversation.agentCode !== this.agentCode ||
      !Number.isSafeInteger(snapshot.cursor) || snapshot.cursor < 0 ||
      ![snapshot.messages, snapshot.runs, snapshot.tools, snapshot.interactions].every(Array.isArray)) throw new Error('AGENT_SNAPSHOT_INVALID');
    if (this.value.snapshot && snapshot.cursor < this.value.snapshot.cursor) return;
    this.update({ snapshot, phase: 'ready', error: undefined }); this.resolvePending(); this.persist();
  }

  private resolvePending(): void {
    if (this.writing) return; // Never let SSE release the gate while its POST is still in flight.
    const pending = this.value.pending, snapshot = this.value.snapshot;
    if (!pending || !snapshot) return;
    let disposition: 'acknowledged' | 'closed' | undefined;
    if (pending.kind === 'send' && snapshot.messages.some(item => item.requestId === pending.requestId && item.role === 'user')) disposition = 'acknowledged';
    if (pending.kind === 'submit' || pending.kind === 'confirm' || pending.kind === 'cancel-interaction') {
      const card = snapshot.interactions.find(item => item.id === pending.targetId);
      if (card?.requestId === pending.requestId) disposition = 'acknowledged';
      else if (card && ((pending.revision !== undefined && card.revision > pending.revision) || card.state !== 'waiting_input')) disposition = 'closed';
    }
    if (pending.kind === 'cancel-run') {
      const run = snapshot.runs.find(item => item.id === pending.targetId);
      if (run && ['stopping', 'cancelled', 'completed', 'failed', 'superseded'].includes(run.state)) disposition = 'closed';
    }
    if (pending.kind === 'reconcile' || pending.kind === 'resolve-manually') {
      const result = snapshot.tools.find(item => item.id === pending.targetId)?.reconciliation;
      if (result && !['unknown', 'still_unknown', 'pending'].includes(result.state)) disposition = 'closed';
    }
    if (disposition) { this.update({ pending: undefined, lastResolution: { requestId: pending.requestId, disposition } }); this.persist(); }
  }

  private event(event: AgentUpdatedEvent): void {
    const previous = this.value.snapshot;
    if (!previous) throw new Error('AGENT_SNAPSHOT_REQUIRED');
    let snapshot = { ...previous, cursor: event.seq };
    switch (event.type) {
      case 'conversation.updated':
        if (event.data.id !== previous.conversation.id) throw new Error('AGENT_STREAM_SCOPE_INVALID');
        snapshot.conversation = { ...previous.conversation, ...event.data }; break;
      case 'message.updated': snapshot.messages = replace(previous.messages, event.data); break;
      case 'run.updated': snapshot.runs = replace(previous.runs, event.data); break;
      case 'tool.updated': snapshot.tools = replace(previous.tools, event.data); break;
      case 'interaction.updated': snapshot.interactions = replace(previous.interactions, event.data); break;
    }
    this.update({ snapshot, stream: 'live' }); this.resolvePending();
  }
  private startStream(): void {
    this.streamAbort?.abort();
    const abort = new AbortController(); this.streamAbort = abort;
    void this.observe(abort.signal).catch(error => {
      if (!abort.signal.aborted) this.update({ stream: 'disconnected', error: asError(error) });
    });
  }
  private async observe(signal: AbortSignal): Promise<void> {
    for (let attempt = 0; attempt <= 3 && !signal.aborted; attempt++) {
      const id = this.conversationId!, after = this.value.snapshot!.cursor;
      this.update({ stream: attempt ? 'reconnecting' : 'connecting' });
      try {
        const response = await this.transport.stream(`/conversations/${uuid(id)}/events?after=${after}`, signal);
        if (signal.aborted) return;
        const result = await consumeAgentStream(response, after, event => { if (!signal.aborted) this.event(event); }, signal);
        if (signal.aborted) return;
        if (result.idle) { this.update({ stream: 'idle' }); return; }
        throw new Error('AGENT_STREAM_INTERRUPTED');
      } catch (error) {
        if (signal.aborted || this.lifetime.signal.aborted) return;
        const status = (error as { status?: number }).status;
        if (attempt === 3 || status === 401 || status === 403 || status === 404 || status === 429) throw error;
        await pause([250, 750, 1500][attempt]!, signal);
        // Only reads recover. Snapshot is cursor-consistent and may contain events received before disconnect.
        await this.readSnapshot();
      }
    }
  }
  dispose(): void {
    if (this.lifetime.signal.aborted) return;
    this.streamAbort?.abort(); this.lifetime.abort();
    this.update({ phase: 'disposed', stream: 'idle', snapshot: undefined }); this.listeners.clear();
  }
}
