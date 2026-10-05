const BUDGET_MS = 300_000;
const MAX_ATTEMPTS = 120;
const ENTRY_BUDGET_MS = 1_800_000;
const ENTRY_MAX_ATTEMPTS = 900;
const READ_TIMEOUT_MS = 10_000;
const PROJECTION_DELAYS = [250, 750, 1500];
const BUSY_CODES = new Set(['CONCURRENCY_BOOTSTRAP_BUSY', 'CONCURRENCY_API_BUSY']);

interface ReadFailure {
  status?: number;
  code?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  data?: { retryAfterMs?: number; remainingMs?: number; recoveryBudgetMs?: number; state?: string } | null;
  name?: string;
}

const abortReason = (signal: AbortSignal) => signal.reason || new DOMException('读取已取消', 'AbortError');
const exhausted = () => Object.assign(new Error('连接等待时间已结束，请稍后重试；原有申请无需重复提交'), {
  code: 'OPENXIANGDA_RUNTIME_AUTHORIZATION_RECOVERY_EXHAUSTED', status: 504, retryable: true,
});
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(abortReason(signal));
  const abort = () => { clearTimeout(timer); reject(abortReason(signal)); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  signal.addEventListener('abort', abort, { once: true });
});

async function boundedRead<T>(read: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, budgetMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort(abortReason(signal));
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('读取超时', 'TimeoutError')), budgetMs);
  let onAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortReason(controller.signal));
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    if (controller.signal.aborted) throw abortReason(controller.signal);
    const value = await Promise.race([read(controller.signal), aborted]);
    if (controller.signal.aborted) throw abortReason(controller.signal);
    return value;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

/** Only the existing runtime current read uses this recovery; it never replays a write. */
export async function recoverRuntimeAuthorizationRead<T>(
  read: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  dependencies = { now: () => performance.now(), random: Math.random, sleep },
): Promise<T> {
  if (signal?.aborted) throw abortReason(signal);
  const started = dependencies.now();
  let deadline = started + BUDGET_MS;
  let entryDeadline: number | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort(signal && abortReason(signal));
  signal?.addEventListener('abort', abort, { once: true });
  let timer = setTimeout(() => controller.abort(exhausted()), BUDGET_MS);
  let projectionRetries = 0, projectionDeadline = 0, transportFailures = 0, backoff = 0;
  let lastError: unknown;
  try {
    for (let attempt = 0; attempt < (entryDeadline === undefined ? MAX_ATTEMPTS : ENTRY_MAX_ATTEMPTS); attempt++) {
      if (controller.signal.aborted) throw abortReason(controller.signal);
      if (dependencies.now() >= deadline) throw exhausted();
      if (projectionRetries === 0) projectionDeadline = dependencies.now() + READ_TIMEOUT_MS;
      try {
        const remaining = Math.min(READ_TIMEOUT_MS, deadline - dependencies.now(), projectionDeadline - dependencies.now());
        if (remaining <= 0) throw new DOMException('读取超时', 'TimeoutError');
        const value = await boundedRead(read, controller.signal, remaining);
        if (dependencies.now() >= deadline) throw exhausted();
        return value;
      } catch (error) {
        if (controller.signal.aborted) throw abortReason(controller.signal);
        lastError = error;
        const failure = error as ReadFailure;
        if (failure?.status === 503 && failure.code === 'OPENXIANGDA_AUTHORIZATION_PROJECTION_NOT_READY') {
          const delay = PROJECTION_DELAYS[projectionRetries];
          if (delay === undefined || delay >= projectionDeadline - dependencies.now()) throw error;
          projectionRetries++;
          await dependencies.sleep(delay, controller.signal);
          continue;
        }
        // Preserve the original ten-second projection chain instead of granting
        // a fresh transport recovery budget when that chain times out.
        if (projectionRetries > 0 && failure?.name === 'TimeoutError') throw error;
        projectionRetries = 0;
        const busy = failure?.status === 429 && BUSY_CODES.has(failure.code || '') && failure.retryable !== false;
        const remaining = failure?.data?.remainingMs;
        const entryWait = busy && failure.code === 'CONCURRENCY_BOOTSTRAP_BUSY'
          && ['waiting', 'ready', 'active'].includes(failure.data?.state || '')
          && typeof remaining === 'number' && Number.isFinite(remaining) && remaining > 0;
        const recoveryBudget = failure?.data?.recoveryBudgetMs;
        const unavailableWait = busy && failure.code === 'CONCURRENCY_BOOTSTRAP_BUSY'
          && failure.data?.state === 'unavailable'
          && typeof recoveryBudget === 'number' && Number.isFinite(recoveryBudget) && recoveryBudget > 0;
        if (entryWait || unavailableWait) {
          // Receipt time is authoritative for this wait. Later responses may
          // shorten, never refresh, the original bounded entrance deadline.
          const receiptDeadline = entryWait
            ? Math.min(started + ENTRY_BUDGET_MS, dependencies.now() + remaining!)
            : started + Math.min(ENTRY_BUDGET_MS, recoveryBudget!);
          entryDeadline = entryDeadline === undefined ? receiptDeadline : Math.min(entryDeadline, receiptDeadline);
          deadline = entryDeadline;
          clearTimeout(timer);
          timer = setTimeout(() => controller.abort(exhausted()), Math.max(0, deadline - dependencies.now()));
        }
        if (attempt + 1 >= (entryDeadline === undefined ? MAX_ATTEMPTS : ENTRY_MAX_ATTEMPTS)) throw error;
        const transport = failure?.retryable !== false &&
          (failure?.status === 503 && failure.code === 'PLATFORM_TRANSPORT_UNAVAILABLE' ||
            failure?.status === undefined && failure?.name === 'TimeoutError');
        if (!busy && !transport) throw error;
        if (transport && ++transportFailures >= 3) throw error;
        const hint = Number(failure.retryAfterMs ?? failure.data?.retryAfterMs);
        const suggested = Number.isFinite(hint) && hint >= 0 ? hint : 0;
        const jitter = Math.min(1, Math.max(0, dependencies.random()));
        const delay = entryDeadline !== undefined
          ? Math.min(15_000, Math.max(2000, suggested)) * (1 + jitter * .2)
          : Math.max(suggested, Math.min(30_000, 2000 * 2 ** Math.min(backoff++, 4))) * (1 + jitter * .25);
        if (delay >= deadline - dependencies.now()) throw error;
        await dependencies.sleep(delay, controller.signal);
      }
    }
    throw lastError || exhausted();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
