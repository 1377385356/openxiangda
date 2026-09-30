import type { ManagedReadRecoveryOptions } from './managed-command';

const MAX_BUDGET_MS = 120_000;
const MAX_ATTEMPTS = 12;
const BUSY_CODES = new Set([
  'CONCURRENCY_API_BUSY',
  'CONCURRENCY_RESULT_BUSY',
  'CONCURRENCY_RATE_LIMITED',
  'CONCURRENCY_SOURCE_BUSY',
]);
const LEGACY_BUSY_CODES = new Set(['CONCURRENCY_API_BUSY', 'CONCURRENCY_RESULT_BUSY']);

export function isManagedReadBusy(error: unknown) {
  const value = error as { status?: number; code?: string; retryable?: boolean };
  if (value?.retryable === false) return false;
  return value?.status === 429 ? BUSY_CODES.has(value.code || '')
    : value?.status === 503 && LEGACY_BUSY_CODES.has(value.code || '');
}

const exhausted = () => Object.assign(new Error('读取等待时间已结束，请稍后重新查询'), {
  code: 'CONCURRENCY_READ_RECOVERY_EXHAUSTED', status: 504, retryable: true,
});
const abortReason = (signal: AbortSignal) => signal.reason || new DOMException('Aborted', 'AbortError');
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(abortReason(signal));
  const abort = () => { clearTimeout(timer); reject(abortReason(signal)); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  signal.addEventListener('abort', abort, { once: true });
});

/** Only explicitly read-only calls use this helper. It never retries dependencies or authorization. */
export async function recoverManagedRead<T>(
  read: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  options: ManagedReadRecoveryOptions = {},
  dependencies = { now: () => performance.now(), random: Math.random, sleep },
): Promise<T> {
  if (options.budgetMs !== undefined && (!Number.isFinite(options.budgetMs) || options.budgetMs < 0))
    throw Object.assign(new Error('读取恢复时间设置无效'), { code: 'CONCURRENCY_READ_RECOVERY_BUDGET_INVALID', status: 400 });
  if (signal?.aborted) throw abortReason(signal);
  const budget = Math.min(MAX_BUDGET_MS, options.budgetMs ?? MAX_BUDGET_MS);
  if (budget < 1) throw exhausted();
  const deadline = dependencies.now() + budget;
  const controller = new AbortController();
  const abort = () => controller.abort(signal && abortReason(signal));
  signal?.addEventListener('abort', abort, { once: true });
  let lastBusy: unknown;
  // A pending transport exceeding the hard deadline is not a known busy
  // response. Do not disguise it using an earlier budget rejection.
  const timer = setTimeout(() => controller.abort(exhausted()), budget);
  let onAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortReason(controller.signal));
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (controller.signal.aborted) throw abortReason(controller.signal);
      if (dependencies.now() >= deadline) throw lastBusy || exhausted();
      try {
        const value = await Promise.race([read(controller.signal), aborted]);
        if (controller.signal.aborted) throw abortReason(controller.signal);
        if (dependencies.now() >= deadline) throw exhausted();
        return value;
      } catch (error) {
        if (controller.signal.aborted) throw abortReason(controller.signal);
        if (!isManagedReadBusy(error)) throw error;
        lastBusy = error;
        if (attempt + 1 >= MAX_ATTEMPTS) throw error;
        const hint = Number((error as any).retryAfterMs ?? (error as any).data?.retryAfterMs);
        const suggested = Number.isFinite(hint) && hint >= 0 ? hint : 0;
        const jitter = Math.min(1, Math.max(0, dependencies.random()));
        const wait = Math.max(suggested, Math.min(30_000, 2000 * 2 ** Math.min(attempt, 4))) * (1 + jitter * .25);
        // Never poll early or begin another call outside the original budget.
        if (wait >= deadline - dependencies.now()) throw error;
        await Promise.race([dependencies.sleep(wait, controller.signal), aborted]);
      }
    }
    throw lastBusy || exhausted();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
