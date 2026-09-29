import type { CommandReceipt } from 'openxiangda-contracts/browser';
import type { ManagedConcurrencyClient } from './managed-command';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Intent {
    version: 1;
    requestKey: string;
    input: Record<string, unknown> | null;
    receipt?: CommandReceipt;
}
export interface DurableCommandSnapshot {
    state: 'idle' | 'recovering' | 'error' | CommandReceipt['state'];
    initialized: boolean;
    isObserving: boolean;
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
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    random?: () => number;
}
const terminal = (r?: CommandReceipt) => !!r && ['succeeded', 'rejected', 'expired', 'cancelled'].includes(r.state);
const code = (e: unknown) => String((e as any)?.code || (/^CONCURRENCY_[A-Z_]+$/.test((e as Error)?.message) ? (e as Error).message : 'CONCURRENCY_REQUEST_FAILED'));
const retryable = (e: unknown) => e instanceof TypeError || Number((e as any)?.status) === 429 || Number((e as any)?.status) >= 500;
const absent = (e: unknown) => Number((e as any)?.status) === 404 && code(e) === 'CONCURRENCY_COMMAND_NOT_FOUND';
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
    private value: DurableCommandSnapshot = { state: 'idle', initialized: false, isObserving: false };
    private listeners = new Set<() => void>();
    private intent?: Intent;
    private generation = 0;
    private abort?: AbortController;
    private submitting?: Promise<void>;
    private readonly storageKey: string;
    constructor(private readonly options: DurableCommandOptions) {
        this.storageKey = `openxiangda:durable-command:${JSON.stringify([options.client.scope, options.command, options.resourceKey, options.storageKey || ''])}`;
    }
    snapshot = () => this.value;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private update(next: Partial<DurableCommandSnapshot>) { this.value = Object.freeze({ ...this.value, ...next }); for (const listener of this.listeners)
        listener(); }
    private persist() { this.options.storage.setItem(this.storageKey, JSON.stringify(this.intent)); }
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
        this.intent = saved;
    }
    private accept(receipt: CommandReceipt) {
        if (receipt.command !== this.options.command || receipt.resourceKey !== this.options.resourceKey)
            throw new Error('CONCURRENCY_RECEIPT_SCOPE_INVALID');
        if (!this.intent || this.intent.requestKey !== receipt.requestKey)
            this.intent = { version: 1, requestKey: receipt.requestKey, input: null };
        this.intent.receipt = receipt;
        this.persist();
        this.update({ state: receipt.state, receipt, requestKey: receipt.requestKey, errorCode: receipt.errorCode, input: this.intent.input ? Object.freeze({ ...this.intent.input }) : undefined, initialized: true });
    }
    stop() { this.generation++; this.abort?.abort(); this.abort = undefined; this.update({ isObserving: false }); }
    async refresh(): Promise<void> {
        if (this.submitting)
            return this.submitting;
        this.stop();
        const generation = this.generation;
        const abort = new AbortController();
        this.abort = abort;
        const active = () => !abort.signal.aborted && generation === this.generation;
        this.update({ state: 'recovering', isObserving: true, errorCode: undefined });
        try {
            this.restore();
            let receipt: CommandReceipt | undefined;
            if (this.intent) {
                try {
                    receipt = await this.options.client.result({ command: this.options.command, requestKey: this.intent.requestKey }, abort.signal);
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
                const page = await this.options.client.mine(this.options.command, { resourceKey: this.options.resourceKey, limit: 20 }, abort.signal);
                if (!active())
                    return;
                receipt = page.items.find(r => !terminal(r)) || receipt || (!this.intent ? page.items[0] : undefined);
            }
            if (receipt) {
                this.accept(receipt);
                this.observe(receipt, generation, abort);
            }
            else
                this.update({ state: this.intent ? 'recovering' : 'idle', requestKey: this.intent?.requestKey, input: this.intent?.input ? Object.freeze({ ...this.intent.input }) : undefined, initialized: true, isObserving: false });
        }
        catch (error) {
            if (active())
                this.update({ state: 'error', initialized: true, isObserving: false, errorCode: code(error) });
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
                    const found = await this.options.client.result({ command: this.options.command, requestKey: this.intent.requestKey }, abort.signal);
                    if (!active())
                        return;
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
                this.intent = { version: 1, input: JSON.parse(serialized), requestKey: crypto.randomUUID() };
            this.persist();
            this.update({ state: 'recovering', requestKey: this.intent.requestKey, input: Object.freeze({ ...this.intent.input! }), receipt: undefined, errorCode: undefined, initialized: true, isObserving: true });
            enqueueAttempted = true;
            const receipt = await this.enqueueWithRecovery(this.intent, abort, active);
            if (!receipt) return;
            if (!active())
                return;
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
                this.update({ state: retryable(error) ? 'recovering' : 'error', errorCode: code(error), requestKey: this.intent?.requestKey, input: this.intent?.input ? Object.freeze({ ...this.intent.input }) : undefined, initialized: true, isObserving: false });
            throw error;
        }
    }
    private async enqueueWithRecovery(intent: Intent, abort: AbortController, active:()=>boolean): Promise<CommandReceipt|undefined> {
        const deadline=Date.now()+120000;
        let lastError:unknown, timedOut=false;
        const timer=setTimeout(()=>{timedOut=true;abort.abort();},120000);
        try {
            for(let attempt=0; attempt<6 && active(); attempt++) {
                try {
                    if(attempt>0) {
                        const suggested=Number((lastError as any)?.retryAfterMs ?? (lastError as any)?.data?.retryAfterMs)||0;
                        const wait=Math.max(suggested,Math.min(30000,5000*2**(attempt-1)))*(1+(this.options.random||Math.random)()*.25);
                        if(wait>=deadline-Date.now()) throw lastError;
                        await (this.options.sleep||sleep)(wait,abort.signal);
                        if(!active())return undefined;
                        // A lost acknowledgement may already be committed; never re-enqueue before checking.
                        try {return await this.options.client.result({command:this.options.command,requestKey:intent.requestKey},abort.signal);}
                        catch(error) {if(!absent(error))throw error;}
                    }
                    return await this.options.client.enqueue(this.options.command,intent.input!,intent.requestKey,abort.signal);
                } catch(error) {
                    if(!active())break;
                    if(!retryable(error))throw error;
                    lastError=error;
                    this.update({state:'recovering',receipt:undefined,errorCode:code(error),isObserving:true});
                }
            }
            if(timedOut) {
                if(this.abort===abort)this.update({state:'recovering',isObserving:false,errorCode:'CONCURRENCY_ACCEPTANCE_UNCONFIRMED'});
                throw Object.assign(new Error('受理结果尚未确认，请恢复原申请'),{code:'CONCURRENCY_ACCEPTANCE_UNCONFIRMED',status:504});
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
                await (this.options.sleep || sleep)(requested * (1 + (this.options.random || Math.random)() * .25), abort.signal);
                if (!active())
                    return;
                const next = await this.options.client.result({ operationId: current.operationId }, abort.signal);
                if (!active())
                    return;
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
                if (!retryable(error)) {
                    this.update({ state: 'error', errorCode: code(error), isObserving: false });
                    return;
                }
                failures++;
                this.update({ state: 'recovering', errorCode: code(error) });
            }
        }
    }
}
