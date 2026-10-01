import type { CommandReceipt, ManagedReadResult, WaitingReceipt, ManagedCommandMinePage } from 'openxiangda-contracts/browser';

export interface ManagedReadRecoveryOptions {
  /**
   * 含请求与繁忙退避的本调用总预算，默认 120 秒 / 12 次请求。
   * 显式超过 120 秒时最多 30 分钟 / 120 次请求，超过上限按 30 分钟处理。
   * 仅恢复已知只读繁忙；不会延长已提交申请的受理或观察期限。
   */
  budgetMs?: number;
}

export interface ManagedConcurrencyClient {
  /** Bound to the current application, environment and trusted user. */
  readonly scope: string;
  read<T = Record<string, unknown>>(code: string, input: Record<string, unknown>, signal?: AbortSignal, recovery?: ManagedReadRecoveryOptions): Promise<ManagedReadResult<T>>;
  enqueue(command: string, input: Record<string,unknown>, requestKey: string, signal?: AbortSignal): Promise<CommandReceipt>;
  mine(command: string, input: {resourceKey:string;cursor?:string;limit?:number}, signal?: AbortSignal, recovery?: ManagedReadRecoveryOptions): Promise<ManagedCommandMinePage>;
  join(command: string, input: Record<string, unknown>, requestKey: string, signal?: AbortSignal): Promise<WaitingReceipt>;
  poll(ticket: string, signal?: AbortSignal): Promise<WaitingReceipt>;
  leave(ticket: string, signal?: AbortSignal): Promise<{ state: 'cancelled' | 'accepted'; requestKey: string }>;
  accept(permit: string, signal?: AbortSignal): Promise<CommandReceipt>;
  result(input: { operationId: string } | { command: string; requestKey: string }, signal?: AbortSignal, recovery?: ManagedReadRecoveryOptions): Promise<CommandReceipt>;
  cancel(operationId: string, signal?: AbortSignal): Promise<CommandReceipt>;
  allocation(allocationId: string, signal?: AbortSignal, recovery?: ManagedReadRecoveryOptions): Promise<NonNullable<NonNullable<CommandReceipt['result']>['allocation']>>;
}

export interface ManagedCommandSnapshot {
  state: 'idle' | 'waiting' | 'admitted' | 'recovering' | 'error' | CommandReceipt['state'];
  requestKey?: string;
  waiting?: WaitingReceipt;
  receipt?: CommandReceipt;
  errorCode?: string;
}

interface Recovery {
  version: 1;
  input: string;
  requestKey: string;
  attempted: boolean;
  waiting?: WaitingReceipt;
  receipt?: CommandReceipt;
}

const terminal = (receipt?: CommandReceipt) => Boolean(receipt && ['succeeded', 'rejected', 'expired', 'cancelled'].includes(receipt.state));
const canonical = (input: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))));
const errorCode = (error: unknown) => String((error as { code?: string })?.code || (/^CONCURRENCY_[A-Z_]+$/.test((error as Error)?.message) ? (error as Error).message : 'CONCURRENCY_REQUEST_FAILED'));
const retryable = (error: unknown) => {
  const status = Number((error as { status?: number })?.status);
  return status === 429 || status >= 500 || error instanceof TypeError;
};
const delay = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
  const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Aborted', 'AbortError')); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  signal.addEventListener('abort', abort, { once: true });
});

/** One durable request key per UI intent. Stopping the observer never cancels an accepted command. */
export class ManagedCommandController {
  private value: ManagedCommandSnapshot = { state: 'idle' };
  private readonly listeners = new Set<() => void>();
  private recovery?: Recovery;
  private abort?: AbortController;
  private running?: Promise<void>;
  private cancelling?: Promise<void>;
  private submitRequested = false;
  private generation = 0;
  private readonly key: string;
  private readonly input: string;

  constructor(private readonly options: {
    client: ManagedConcurrencyClient;
    command: string;
    input: Record<string, unknown>;
    /** Stable name for this screen's operation, e.g. the selected resource ID. */
    storageKey: string;
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    autoAccept?: boolean;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    random?: () => number;
  }) {
    this.key = `openxiangda:managed-command:${JSON.stringify([options.client.scope, options.command, options.storageKey])}`;
    this.input = canonical(options.input);
  }

  snapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  private update(value: ManagedCommandSnapshot) {
    this.value = Object.freeze({ ...value });
    for (const listener of this.listeners) listener();
  }
  private persist() {
    // Persist before attempting acceptance; an unavailable store fails before the write.
    this.options.storage.setItem(this.key, JSON.stringify(this.recovery));
  }
  private restore() {
    if (this.recovery) return;
    const raw = this.options.storage.getItem(this.key);
    if (!raw) return;
    if(raw.length>65536) throw new Error('CONCURRENCY_RECOVERY_INVALID');
    let saved: Recovery;
    try { saved = JSON.parse(raw) as Recovery; } catch { throw new Error('CONCURRENCY_RECOVERY_INVALID'); }
    if (saved.version !== 1 || saved.input !== this.input || typeof saved.attempted !== 'boolean' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(saved.requestKey)) throw new Error('CONCURRENCY_RECOVERY_INPUT_CONFLICT');
    this.recovery = saved;
  }

  /** Resume an existing intent without starting a new one on page mount. */
  async resume(): Promise<void> {
    if (this.cancelling) return this.cancelling;
    try {this.restore();}
    catch(error) {this.update({state:'error',errorCode:errorCode(error)});throw error;}
    if (this.recovery) await this.run();
  }
  async start(requestKey?: string): Promise<void> {
    if (this.cancelling) throw new Error('CONCURRENCY_CANCELLATION_PENDING');
    try {
      this.restore();
      if (!this.recovery) {
        const key = requestKey || crypto.randomUUID();
        if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(key)) throw new Error('CONCURRENCY_REQUEST_KEY_INVALID');
        this.recovery = { version: 1, input: this.input, requestKey: key, attempted: false };
        this.persist();
      } else if (requestKey && requestKey !== this.recovery.requestKey) throw new Error('CONCURRENCY_ORIGINAL_REQUEST_REQUIRED');
      await this.run();
    } catch (error) {
      this.update({ state: 'error', requestKey: this.recovery?.requestKey, errorCode: errorCode(error) });
      throw error;
    }
  }
  async submit(): Promise<void> {
    if (this.cancelling) throw new Error('CONCURRENCY_CANCELLATION_PENDING');
    if (!this.recovery) throw new Error('CONCURRENCY_WAITING_REQUIRED');
    this.submitRequested = true;
    await this.run();
  }
  stop() { this.generation++; this.abort?.abort(); this.abort = undefined; this.running = undefined; }

  /** Explicitly begin a different intent only after a known terminal receipt. */
  clear() {
    if (this.cancelling) throw new Error('CONCURRENCY_CANCELLATION_PENDING');
    if (this.recovery && !terminal(this.recovery.receipt) && this.value.state !== 'cancelled' && this.value.state !== 'expired')
      throw new Error('CONCURRENCY_ORIGINAL_RESULT_REQUIRED');
    this.stop(); this.options.storage.removeItem(this.key); this.recovery = undefined; this.submitRequested = false; this.update({ state: 'idle' });
  }

  cancel(): Promise<void> {
    if (this.cancelling) return this.cancelling;
    this.cancelling = this.cancelOriginal().finally(() => { this.cancelling = undefined; });
    return this.cancelling;
  }

  private async cancelOriginal(): Promise<void> {
    this.stop(); this.restore();
    const saved = this.recovery;
    if (!saved) return;
    let receipt = saved.receipt;
    if (!receipt && saved.attempted) receipt = await this.findOriginal();
    if (receipt) {
      saved.receipt = terminal(receipt) ? receipt : await this.options.client.cancel(receipt.operationId);
      this.persist(); this.update({ state: saved.receipt.state, requestKey: saved.requestKey, receipt: saved.receipt });
    } else if (saved.waiting) {
      const result = await this.options.client.leave(saved.waiting.ticket);
      if (result.state === 'cancelled') {
        this.options.storage.removeItem(this.key); this.recovery = undefined;
        this.update({ state: 'cancelled', requestKey: saved.requestKey });
      } else await this.run(); // Acceptance may still be committing. Resolve the original operation.
    } else {
      this.options.storage.removeItem(this.key); this.recovery = undefined;
      this.update({ state: 'cancelled', requestKey: saved.requestKey });
    }
  }

  private async findOriginal(signal?: AbortSignal) {
    try { return await this.options.client.result({ command: this.options.command, requestKey: this.recovery!.requestKey }, signal); }
    catch (error) { if (Number((error as any)?.status) === 404 && errorCode(error) === 'CONCURRENCY_COMMAND_NOT_FOUND') return undefined; throw error; }
  }

  private run(): Promise<void> {
    if (this.running) return this.running;
    const generation = ++this.generation;
    const abort = new AbortController(); this.abort = abort;
    const task = this.observe(abort.signal, generation).finally(() => {
      if (this.generation === generation) { this.running = undefined; this.abort = undefined; }
    });
    this.running = task;
    return task;
  }
  private async observe(signal: AbortSignal, generation: number) {
    const saved = this.recovery!;
    const active = () => !signal.aborted && generation === this.generation;
    let failures = 0;
    let pollDelay = 0;
    let resolveOriginal = true;
    while (active()) {
      try {
        if (pollDelay) await (this.options.sleep || delay)(pollDelay, signal);
        if (!active()) return;
        // Always resolve the original key first, including after a lost acceptance response.
        const receipt = resolveOriginal || saved.attempted || saved.receipt ? await this.findOriginal(signal) : undefined;
        resolveOriginal = false;
        if (!active()) return;
        if (receipt) {
          saved.receipt = receipt; this.persist();
          this.update({ state: receipt.state, requestKey: saved.requestKey, receipt });
          if (terminal(receipt)) return;
          failures = 0; pollDelay = this.pollDelay(receipt.retryAfterMs); continue;
        }
        if (saved.receipt) throw new Error('CONCURRENCY_ORIGINAL_RESULT_MISSING');
        if (!saved.waiting || Date.parse(saved.waiting.expiresAt) <= Date.now()) {
          const next = await this.options.client.join(this.options.command, this.options.input, saved.requestKey, signal);
          if (!active()) return;
          saved.waiting = next;
        } else if (saved.waiting.state === 'waiting') {
          const next = await this.options.client.poll(saved.waiting.ticket, signal);
          if (!active()) return;
          saved.waiting = next;
        }
        if (!active()) return;
        const waiting = saved.waiting;
        saved.requestKey = waiting.requestKey; this.persist();
        if (waiting.state === 'expired' && saved.attempted) {
          saved.waiting = undefined; this.persist();this.update({state:'recovering',requestKey:saved.requestKey});pollDelay=this.pollDelay(2000);continue;
        }
        this.update({ state: waiting.state, requestKey: saved.requestKey, waiting });
        if (waiting.state === 'expired') { saved.waiting = undefined; this.persist(); return; }
        if (waiting.state === 'waiting') { failures = 0; pollDelay = this.pollDelay(waiting.retryAfterMs); continue; }
        if (this.options.autoAccept === false && !this.submitRequested) return;
        if (!waiting.permit) throw new Error('CONCURRENCY_PERMIT_MISSING');
        saved.attempted = true; this.persist();
        const accepted = await this.options.client.accept(waiting.permit, signal);
        if (!active()) return;
        saved.receipt = accepted;
        this.persist(); this.update({ state: saved.receipt.state, requestKey: saved.requestKey, receipt: saved.receipt });
        if (terminal(saved.receipt)) return;
        failures = 0; pollDelay = this.pollDelay(saved.receipt.retryAfterMs);
      } catch (error) {
        if (!active()) return;
        const code = errorCode(error);
        if (['CONCURRENCY_PERMIT_EXPIRED', 'CONCURRENCY_ADMISSION_EPOCH_CHANGED', 'CONCURRENCY_TICKET_EXPIRED', 'CONCURRENCY_HEAD_CHANGED', 'CONCURRENCY_POLICY_CHANGED'].includes(code)) {
          saved.waiting = undefined; this.persist();
        } else if (!retryable(error)) {
          this.update({ state: 'error', requestKey: saved.requestKey, errorCode: code }); return;
        }
        failures++;
        this.update({ state: 'recovering', requestKey: saved.requestKey, receipt: saved.receipt, errorCode: code });
        pollDelay = this.pollDelay(Math.min(30000, 1000 * 2 ** Math.min(failures, 5)));
      }
    }
  }
  private pollDelay(suggested: number) { return Math.min(30000, Math.max(1000, suggested || 2000)) * (1 + (this.options.random || Math.random)() * 0.25); }
}
