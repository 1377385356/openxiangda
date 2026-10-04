import type { CommandReceipt } from 'openxiangda-contracts/browser';
import type { ManagedConcurrencyClient, ManagedReadRecoveryOptions } from './managed-command';
import { isManagedReadBusy } from './managed-read-recovery';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Intent {
    version: 1;
    requestKey: string;
    input: Record<string, unknown> | null;
    firstSubmittedAt?: number;
    receipt?: CommandReceipt;
}
export interface DurableCommandSnapshot {
    state: 'idle' | 'recovering' | 'error' | CommandReceipt['state'];
    initialized: boolean;
    isObserving: boolean;
    /** A scoped durable receipt has been confirmed; an unknown intake is not safe to promise as accepted. */
    acceptanceConfirmed: boolean;
    input?: Readonly<Record<string, unknown>>;
    requestKey?: string;
    receipt?: CommandReceipt;
    errorCode?: string;
}
export interface DurableCommandOptions {
    client: ManagedConcurrencyClient;
    command: string;
    resourceKey: string;
    storageKey?: string;
    storage: StorageLike;
    /** Total automatic intake recovery budget from the original explicit submit. */
    acceptanceRecoveryMs?: number;
    /** Total read-only discovery budget per refresh; default 120s, explicitly at most 30min. Never renews the original intent. */
    discoveryRecoveryMs?: number;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    random?: () => number;
}
const terminal = (r?: CommandReceipt) => !!r && ['succeeded', 'rejected', 'expired', 'cancelled'].includes(r.state);
const code = (e: unknown) => String((e as any)?.code || (/^CONCURRENCY_[A-Z_]+$/.test((e as Error)?.message) ? (e as Error).message : 'CONCURRENCY_REQUEST_FAILED'));
const retryable = (e: unknown) => e instanceof TypeError || Number((e as any)?.status) === 429 || Number((e as any)?.status) >= 500;
const absent = (e: unknown) => Number((e as any)?.status) === 404 && code(e) === 'CONCURRENCY_COMMAND_NOT_FOUND';
// A single bounded read expiring is not the original receipt's observation
// deadline. This classification is deliberately confined to accepted results;
// it does not imply busy, acceptance, or permission to enqueue again.
const resultReadExhausted = (e: unknown) => (e as any)?.status === 504 &&
    (e as any)?.retryable === true && code(e) === 'CONCURRENCY_READ_RECOVERY_EXHAUSTED';
const canonical = (input: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))));
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted)
        return reject(new DOMException('Aborted', 'AbortError'));
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
});
/** Mount only reads mine/original receipt. Enqueue always requires explicit submit. */
export class DurableCommandController {
    private value: DurableCommandSnapshot = { state: 'idle', initialized: false, isObserving: false, acceptanceConfirmed: false };
    private listeners = new Set<() => void>();
    private intent?: Intent;
    private generation = 0;
    private abort?: AbortController;
    private submitting?: Promise<void>;
    private refreshing?: Promise<void>;
    private readonly storageKey: string;
    constructor(private readonly options: DurableCommandOptions) {
        if (options.acceptanceRecoveryMs !== undefined && (!Number.isFinite(options.acceptanceRecoveryMs) || options.acceptanceRecoveryMs < 120000 || options.acceptanceRecoveryMs > 1800000))
            throw new Error('CONCURRENCY_RECOVERY_BUDGET_INVALID');
        if (options.discoveryRecoveryMs !== undefined && (!Number.isFinite(options.discoveryRecoveryMs) || options.discoveryRecoveryMs < 1 || options.discoveryRecoveryMs > 1800000))
            throw new Error('CONCURRENCY_DISCOVERY_BUDGET_INVALID');
        this.storageKey = `openxiangda:durable-command:${JSON.stringify([options.client.scope, options.command, options.resourceKey, options.storageKey || ''])}`;
    }
    snapshot = () => this.value;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private update(next: Partial<DurableCommandSnapshot>) { this.value = Object.freeze({ ...this.value, ...next }); for (const listener of this.listeners)
        listener(); }
    private remainingRecoveryMs() {
        const started = this.intent?.firstSubmittedAt;
        if (started === undefined) return undefined;
        const now = Date.now();
        return now < started ? 0 : Math.max(0, started + (this.options.acceptanceRecoveryMs ?? 120000) - now);
    }
    private remainingObservationMs() {
        const started = this.intent?.firstSubmittedAt ?? Date.parse(this.intent?.receipt?.acceptedAt || '');
        if (!Number.isFinite(started)) return 0;
        const now = Date.now();
        return now < started ? 0 : Math.max(0, started + 1800000 - now);
    }
    private readRecovery(allowLateQuery = false): ManagedReadRecoveryOptions | undefined {
        const remaining = this.intent?.receipt ? this.remainingObservationMs() : this.remainingRecoveryMs();
        // An explicit post-deadline query can find a late terminal receipt. It
        // never renews the original intent or restarts automatic observation.
        // The controller owns its original outer window. An inner read retains
        // its existing two-minute budget, even when that outer window is longer.
        return remaining === undefined || (allowLateQuery && remaining === 0) ? undefined : { budgetMs: Math.min(120000, remaining) };
    }
    private persist() { this.options.storage.setItem(this.storageKey, JSON.stringify(this.intent)); }
    private intentSnapshot(): Partial<DurableCommandSnapshot> {
        return { requestKey: this.intent?.requestKey, receipt: this.intent?.receipt,
            input: this.intent?.input ? Object.freeze({ ...this.intent.input }) : undefined,
            acceptanceConfirmed: !!this.intent?.receipt };
    }
    private restore() {
        if (this.intent)
            return;
        const raw = this.options.storage.getItem(this.storageKey);
        if (!raw)
            return;
        let saved: Intent;
        try {
            if (raw.length > 100000)
                throw new Error();
            saved = JSON.parse(raw);
        }
        catch {
            throw new Error('CONCURRENCY_RECOVERY_INVALID');
        }
        if (saved.version !== 1 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(saved.requestKey))
            throw new Error('CONCURRENCY_RECOVERY_INVALID');
        if (saved.firstSubmittedAt !== undefined && (!Number.isFinite(saved.firstSubmittedAt) || saved.firstSubmittedAt < 0))
            throw new Error('CONCURRENCY_RECOVERY_INVALID');
        if (saved.receipt)
            this.assertReceipt(saved.receipt, saved.requestKey);
        this.intent = saved;
    }
    private assertReceipt(receipt: CommandReceipt, requestKey?: string, operationId?: string) {
        if (receipt.command !== this.options.command || receipt.resourceKey !== this.options.resourceKey ||
            (requestKey !== undefined && receipt.requestKey !== requestKey) ||
            (operationId !== undefined && receipt.operationId !== operationId))
            throw new Error('CONCURRENCY_RECEIPT_SCOPE_INVALID');
    }
    private remember(receipt: CommandReceipt) {
        this.assertReceipt(receipt);
        if (!this.intent || this.intent.requestKey !== receipt.requestKey)
            this.intent = { version: 1, requestKey: receipt.requestKey, input: null };
        this.intent.receipt = receipt;
        this.persist();
    }
    private accept(receipt: CommandReceipt) {
        this.remember(receipt);
        this.update({ ...this.intentSnapshot(), state: receipt.state, errorCode: receipt.errorCode, initialized: true });
    }
    stop() { this.generation++; this.abort?.abort(); this.abort = undefined; this.refreshing = undefined; this.update({ isObserving: false }); }
    refresh(): Promise<void> {
        if (this.submitting)
            return this.submitting;
        if (this.refreshing)
            return this.refreshing;
        const task = this.discover().finally(() => { if (this.refreshing === task) this.refreshing = undefined; });
        this.refreshing = task;
        return task;
    }
    private async discover(): Promise<void> {
        this.stop();
        const generation = this.generation;
        const abort = new AbortController();
        this.abort = abort;
        const active = () => !abort.signal.aborted && generation === this.generation;
        this.update({ state: 'recovering', isObserving: true, errorCode: undefined });
        try {
            this.restore();
            this.update(this.intentSnapshot());
            const originalRemaining = this.intent?.receipt ? this.remainingObservationMs() : this.remainingRecoveryMs();
            const budget = this.options.discoveryRecoveryMs ?? 120000;
            // A late explicit query may recover a fact but never renews intake or observation.
            const deadline = performance.now() + (originalRemaining === undefined || originalRemaining === 0 ? budget : Math.min(budget, originalRemaining));
            const originalDeadline = originalRemaining === undefined || originalRemaining === 0 ? undefined : Date.now() + originalRemaining;
            const recovery = () => ({ budgetMs: Math.max(0, Math.min(deadline - performance.now(), originalDeadline === undefined ? Infinity : originalDeadline - Date.now())) });
            let receipt: CommandReceipt | undefined;
            if (this.intent) {
                try {
                    receipt = await this.options.client.result({ command: this.options.command, requestKey: this.intent.requestKey }, abort.signal, recovery());
                    if (!active()) return;
                    this.assertReceipt(receipt, this.intent.requestKey);
                    this.remember(receipt);
                    // Keep the discovery state until a historical result has been checked for a newer cycle.
                    this.update(this.intentSnapshot());
                }
                catch (error) {
                    if (!absent(error))
                        throw error;
                }
            }
            if (!active())
                return;
            // A historical local success cannot hide a newer pending cycle on another device.
            if (!receipt || terminal(receipt)) {
                const page = await this.options.client.mine(this.options.command, { resourceKey: this.options.resourceKey, limit: 20 }, abort.signal, recovery());
                if (!active())
                    return;
                for (const item of page.items) this.assertReceipt(item);
                const original = this.intent && page.items.find(r => r.requestKey === this.intent!.requestKey);
                const pending = page.items.find(r => !terminal(r));
                if (this.intent && !terminal(this.intent.receipt)) {
                    receipt = original;
                    if (!receipt && pending) {
                        this.update({ ...this.intentSnapshot(), state: 'recovering', errorCode: 'CONCURRENCY_ORIGINAL_REQUEST_REQUIRED', initialized: true, isObserving: false });
                        return;
                    }
                } else receipt = pending || original || receipt || (!this.intent ? page.items[0] : undefined);
            }
            if (receipt) {
                this.accept(receipt);
                this.observe(receipt, generation, abort);
            }
            else
                this.update({ ...this.intentSnapshot(), state: this.intent ? 'recovering' : 'idle', errorCode: this.intent ? (this.intent.receipt ? 'CONCURRENCY_ORIGINAL_RESULT_MISSING' : 'CONCURRENCY_ACCEPTANCE_UNCONFIRMED') : undefined, initialized: true, isObserving: false });
        }
        catch (error) {
            if (active())
                this.update({ ...this.intentSnapshot(), state: isManagedReadBusy(error) ? 'recovering' : 'error', initialized: true, isObserving: false, errorCode: code(error) });
        }
    }
    /** Explicit user action: retry the frozen local intent, never today's edited form. */
    async resume(): Promise<void> {
        if (this.submitting)
            return this.submitting;
        this.restore();
        if (!this.intent || terminal(this.intent.receipt) || !this.intent.input)
            return this.refresh();
        return this.submit(this.intent.input);
    }
    /** A known terminal result permits a new explicitly requested business cycle. */
    submit(input: Record<string, unknown>): Promise<void> {
        if (this.submitting)
            return this.submitting;
        this.submitting = this.enqueue(input).finally(() => { this.submitting = undefined; });
        return this.submitting;
    }
    private async enqueue(input: Record<string, unknown>) {
        this.stop();
        const generation = this.generation;
        const abort = new AbortController();
        this.abort = abort;
        const active = () => !abort.signal.aborted && generation === this.generation;
        let enqueueAttempted = false;
        try {
            this.restore();
            const serialized = canonical(input);
            if (new TextEncoder().encode(serialized).length > 8192 || Object.keys(input).length > 8 || Object.values(input).some(v => !['string', 'boolean', 'number'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v))))
                throw new Error('CONCURRENCY_INPUT_INVALID');
            if (this.intent && !terminal(this.intent.receipt)) {
                // Resolve original acceptance before retrying. Never replace an unknown key.
                try {
                    const found = await this.options.client.result({ command: this.options.command, requestKey: this.intent.requestKey }, abort.signal, this.readRecovery(true));
                    if (!active())
                        return;
                    this.assertReceipt(found, this.intent.requestKey);
                    this.accept(found);
                    this.observe(found, generation, abort);
                    return;
                }
                catch (error) {
                    if (!absent(error))
                        throw error;
                }
                if (!this.intent.input || canonical(this.intent.input) !== serialized)
                    throw new Error('CONCURRENCY_ORIGINAL_REQUEST_REQUIRED');
            }
            else
                this.intent = { version: 1, input: JSON.parse(serialized), requestKey: crypto.randomUUID(), firstSubmittedAt: Date.now() };
            // Old intents cannot establish a historical start; begin at this explicit recovery.
            this.intent.firstSubmittedAt ??= Date.now();
            this.persist();
            this.update({ state: 'recovering', requestKey: this.intent.requestKey, input: Object.freeze({ ...this.intent.input! }), receipt: undefined, acceptanceConfirmed: false, errorCode: undefined, initialized: true, isObserving: true });
            enqueueAttempted = true;
            const receipt = await this.enqueueWithRecovery(this.intent, abort, active);
            if (!receipt) return;
            if (!active())
                return;
            this.assertReceipt(receipt, this.intent.requestKey);
            this.accept(receipt);
            this.observe(receipt, generation, abort);
        }
        catch (error) {
            // The server guarantees these exact 400 errors occur before acceptance.
            // Existing-key malformed input is 409, never one of these correction errors.
            if (active() && enqueueAttempted && Number((error as {status?:number})?.status) === 400 && ['CONCURRENCY_REQUEST_KEY_REQUIRED','CONCURRENCY_INPUT_INVALID','CONCURRENCY_RESOURCE_KEY_INVALID','CONCURRENCY_DURABLE_COMMAND_REQUIRED'].includes(code(error))) {
                this.options.storage.removeItem(this.storageKey);
                this.intent = undefined;
            }
            if (active())
                this.update({ ...this.intentSnapshot(), state: retryable(error) ? 'recovering' : 'error', errorCode: code(error), initialized: true, isObserving: false });
            throw error;
        }
    }
    private async enqueueWithRecovery(intent: Intent, abort: AbortController, active:()=>boolean): Promise<CommandReceipt|undefined> {
        const budget=this.options.acceptanceRecoveryMs ?? 120000;
        const deadline=intent.firstSubmittedAt!+budget;
        const remaining=deadline-Date.now();
        const unconfirmed=()=>Object.assign(new Error('受理结果尚未确认，请核对原申请'),{code:'CONCURRENCY_ACCEPTANCE_UNCONFIRMED',status:504});
        if(remaining<=0 || Date.now()<intent.firstSubmittedAt!)throw unconfirmed();
        let lastError:unknown, timedOut=false;
        const timer=setTimeout(()=>{timedOut=true;abort.abort();},remaining);
        try {
            for(let attempt=0; attempt<(budget>120000?120:6) && active(); attempt++) {
                let readingOriginal = false;
                try {
                    if(Date.now()>=deadline || Date.now()<intent.firstSubmittedAt!)throw unconfirmed();
                    if(attempt>0) {
                        const suggested=Number((lastError as any)?.retryAfterMs ?? (lastError as any)?.data?.retryAfterMs)||0;
                        const wait=Math.max(suggested,Math.min(30000,5000*2**Math.min(attempt-1,5)))*(1+(this.options.random||Math.random)()*.25);
                        if(wait>=deadline-Date.now()) throw unconfirmed();
                        await (this.options.sleep||sleep)(wait,abort.signal);
                        if(!active())return undefined;
                        if(Date.now()>=deadline || Date.now()<intent.firstSubmittedAt!)throw unconfirmed();
                        // A lost acknowledgement may already be committed; never re-enqueue before checking.
                        readingOriginal = true;
                        try {return await this.options.client.result({command:this.options.command,requestKey:intent.requestKey},abort.signal,{budgetMs:Math.min(120000,deadline-Date.now())});}
                        catch(error) {if(!absent(error))throw error;}
                        readingOriginal = false;
                    }
                    if(Date.now()>=deadline || Date.now()<intent.firstSubmittedAt!)throw unconfirmed();
                    return await this.options.client.enqueue(this.options.command,intent.input!,intent.requestKey,abort.signal);
                } catch(error) {
                    if(!active())break;
                    if(code(error)==='CONCURRENCY_ACCEPTANCE_UNCONFIRMED')throw error;
                    // Read-only dependency failures cannot be hidden by another
                    // intake attempt. Only a known exhausted busy response may wait.
                    if(readingOriginal && !isManagedReadBusy(error))throw error;
                    if(!retryable(error))throw error;
                    lastError=error;
                    this.update({state:'recovering',receipt:undefined,errorCode:code(error),isObserving:true});
                }
            }
            if(timedOut) {
                if(this.abort===abort)this.update({state:'recovering',isObserving:false,errorCode:'CONCURRENCY_ACCEPTANCE_UNCONFIRMED'});
                throw unconfirmed();
            }
            if(!active())return undefined;
            throw lastError;
        } finally {clearTimeout(timer);}
    }
    private observe(receipt: CommandReceipt, generation: number, abort: AbortController) {
        if (terminal(receipt)) {
            this.update({ isObserving: false });
            return;
        }
        if (this.remainingObservationMs() === 0) {
            this.update({ state: 'recovering', isObserving: false, errorCode: 'CONCURRENCY_RESULT_OBSERVATION_EXHAUSTED' });
            return;
        }
        this.update({ isObserving: true });
        void this.poll(receipt, generation, abort);
    }
    private async poll(receipt: CommandReceipt, generation: number, abort: AbortController) {
        let current = receipt, failures = 0;
        const active = () => !abort.signal.aborted && generation === this.generation;
        while (active()) {
            try {
                // Never poll faster than the server recommendation; default is deliberately >=5s.
                const requested = Math.max(5000, Number(current.retryAfterMs) || 0, failures ? Math.min(120000, 5000 * 2 ** Math.min(failures, 5)) : 0);
                const wait = requested * (1 + (this.options.random || Math.random)() * .25);
                const remaining = this.remainingObservationMs();
                if (wait >= remaining) {
                    this.update({ state: 'recovering', isObserving: false, errorCode: 'CONCURRENCY_RESULT_OBSERVATION_EXHAUSTED' });
                    return;
                }
                await (this.options.sleep || sleep)(wait, abort.signal);
                if (!active())
                    return;
                if (this.remainingObservationMs() === 0) {
                    this.update({ state: 'recovering', isObserving: false, errorCode: 'CONCURRENCY_RESULT_OBSERVATION_EXHAUSTED' });
                    return;
                }
                const next = await this.options.client.result({ operationId: current.operationId }, abort.signal, this.readRecovery());
                if (!active())
                    return;
                this.assertReceipt(next, current.requestKey, current.operationId);
                this.accept(next);
                current = next;
                failures = 0;
                if (terminal(next)) {
                    this.update({ isObserving: false });
                    return;
                }
            }
            catch (error) {
                if (!active())
                    return;
                if (!isManagedReadBusy(error) && !resultReadExhausted(error)) {
                    this.update({ state: 'error', errorCode: code(error), isObserving: false });
                    return;
                }
                failures++;
                this.update({ state: 'recovering', errorCode: code(error) });
            }
        }
    }
}
