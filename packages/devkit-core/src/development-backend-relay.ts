import { request as httpRequest } from 'node:http';
import {
  DEVELOPMENT_BACKEND_SCHEMA, DEVELOPMENT_BACKEND_MAX_INFLIGHT,
  DEVELOPMENT_BACKEND_MAX_REQUEST_BYTES, DEVELOPMENT_BACKEND_MAX_RESPONSE_BYTES,
  DEVELOPMENT_BACKEND_ENDPOINT_PATTERN,
  DEVELOPMENT_BACKEND_INVOCATION_SCHEMA, DEVELOPMENT_BACKEND_INVOCATION_MAX_RESPONSE_BYTES,
  developmentBackendInvocationRequestValid, developmentBackendInvocationHeadersValid,
  type DevelopmentBackendBootstrap, type DevelopmentBackendRequest, type DevelopmentBackendResponse,
} from 'openxiangda-contracts';

export interface DevelopmentBackendRelayApi {
  bootstrap(token: string): Promise<DevelopmentBackendBootstrap>;
  next(token: string, signal?: AbortSignal): Promise<DevelopmentBackendRequest | null>;
  respond(token: string, response: DevelopmentBackendResponse, signal?: AbortSignal): Promise<void>;
  close(token: string, signal?: AbortSignal): Promise<void>;
}

export function assertDevelopmentBackendBootstrap(
  bootstrap: DevelopmentBackendBootstrap,
  expected: { sessionId: string; environmentId: string; appVersionId: string; headRevision: number }
): void {
  if (!bootstrap || bootstrap.schemaVersion !== DEVELOPMENT_BACKEND_SCHEMA ||
    (bootstrap.invocationContract !== undefined && bootstrap.invocationContract !== DEVELOPMENT_BACKEND_INVOCATION_SCHEMA) ||
    Object.entries(expected).some(([key, value]) => bootstrap[key as keyof typeof expected] !== value) ||
    !bootstrap.secretEnvironment || typeof bootstrap.secretEnvironment !== 'object' || Array.isArray(bootstrap.secretEnvironment) ||
    Object.entries(bootstrap.secretEnvironment).some(([key, value]) =>
      !/^OPENXIANGDA_(?:OAUTH_(?:CLIENT_ID|CLIENT_SECRET|SCOPES)|EVENT_SECRET_[A-Z0-9_]+|WORKFLOW_PROVIDER_SECRET_[A-Z0-9_]+)$/.test(key) ||
      typeof value !== 'string' || !value || value.length > 16_384) ||
    !bootstrap.secretEnvironment.OPENXIANGDA_OAUTH_CLIENT_ID || !bootstrap.secretEnvironment.OPENXIANGDA_OAUTH_CLIENT_SECRET)
    throw new Error('OPENXIANGDA_CONNECTED_DEV_BACKEND_BOOTSTRAP_INVALID');
}

/** The CLI owns a bounded transport, never event decisions or business receipts. */
export function startDevelopmentBackendRelay(input: {
  api: DevelopmentBackendRelayApi;
  token: () => string;
  bootstrap: DevelopmentBackendBootstrap;
  localAppBaseUrl: string;
  onError: (error: Error) => void;
  onConnectionStatus?: (status: 'reconnecting' | 'recovered') => void;
  /** May shorten the bounded recovery window for a caller that needs faster failure. */
  recoveryTimeoutMs?: number;
}): { stop(): Promise<void> } {
  const abort = new AbortController();
  const inflight = new Set<Promise<void>>();
  const recoveryTimeoutMs = Math.min(20_000, Math.max(1, input.recoveryTimeoutMs ?? 20_000));
  let reconnecting = false;
  async function recover<T>(operation: (signal: AbortSignal) => Promise<T>, signal: AbortSignal,
    expiresAt = Infinity): Promise<T | undefined> {
    const deadline = Math.min(Date.now() + recoveryTimeoutMs, expiresAt);
    while (!signal.aborted && Date.now() < deadline) {
      try {
        const value = await operation(AbortSignal.any([signal,
          AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now())))]));
        if (reconnecting && !signal.aborted) {
          reconnecting = false;
          if (!abort.signal.aborted) input.onConnectionStatus?.('recovered');
        }
        return value;
      } catch (error) {
        if (signal.aborted) return;
        if (!isTemporaryTransportFailure(error)) throw error;
        if (!reconnecting) {
          reconnecting = true;
          if (!abort.signal.aborted) input.onConnectionStatus?.('reconnecting');
        }
        await delay(Math.min(1000, Math.max(1, deadline - Date.now())), signal);
      }
    }
    if (!signal.aborted && expiresAt > Date.now())
      throw new Error('OPENXIANGDA_CONNECTED_DEV_BACKEND_RECOVERY_TIMEOUT');
  }
  const poll = (async () => {
    while (!abort.signal.aborted) {
      if (inflight.size < DEVELOPMENT_BACKEND_MAX_INFLIGHT) {
        const request = await recover(signal => input.api.next(input.token(), signal), abort.signal);
        if (request) {
          assertRequest(request, input.bootstrap);
          const delivery = (async () => {
            let response: DevelopmentBackendResponse;
            try {
              response = await forwardDevelopmentBackendRequest(input.localAppBaseUrl, request, abort.signal);
            } catch (error) {
              if (abort.signal.aborted) return;
              // Never expose a local exception, response content or credentials.
              response = { requestId: request.requestId, status: 502,
                body: JSON.stringify({ code: 'OPENXIANGDA_CONNECTED_DEV_BACKEND_HANDLER_UNAVAILABLE' }) };
              if (request.schemaVersion === DEVELOPMENT_BACKEND_INVOCATION_SCHEMA) {
                const failure = String((error as Error)?.message || '');
                const code = /^OPENXIANGDA_CONNECTED_DEV_BACKEND_(?:STREAM_UNSUPPORTED|RESPONSE_TOO_LARGE)$/.test(failure)
                  ? failure : 'OPENXIANGDA_CONNECTED_DEV_BACKEND_HANDLER_UNAVAILABLE';
                response = { requestId: request.requestId, status: 502, schemaVersion: DEVELOPMENT_BACKEND_INVOCATION_SCHEMA,
                  headers: { 'content-type': 'application/json; charset=utf-8' }, body: Buffer.from(JSON.stringify({ code })).toString('base64') };
              }
            }
            if (!abort.signal.aborted) await recover(
              signal => input.api.respond(input.token(), response, signal), abort.signal, Date.parse(request.expiresAt));
          })();
          inflight.add(delivery);
          void delivery.catch(fail).finally(() => inflight.delete(delivery));
        }
      }
      await delay(1000, abort.signal);
    }
  })();
  void poll.catch(fail);
  let stopped: Promise<void> | undefined;
  function fail(error: unknown) {
    if (abort.signal.aborted) return;
    abort.abort();
    // Only a small allowlist of stable codes is observable; never remote messages/data.
    const code = safeFailureCode(error);
    input.onError(new Error(`OPENXIANGDA_CONNECTED_DEV_BACKEND_TRANSPORT_FAILED: 本地后台连接已停止（${code}），请重新运行 dev`));
  }
  return { stop() {
    stopped ||= (async () => {
      abort.abort();
      await Promise.allSettled([poll, ...inflight]);
      const closeAbort = AbortSignal.timeout(recoveryTimeoutMs);
      await recover(signal => input.api.close(input.token(), signal), closeAbort).catch(() => undefined);
    })();
    return stopped;
  } };
}

function isTemporaryTransportFailure(error: unknown): boolean {
  const value = error as { status?: number; code?: string; remote?: { retryable?: boolean } };
  if (typeof value?.code === 'string' && value.code.startsWith('OPENXIANGDA_CONNECTED_DEV_')) return false;
  return [408, 429, 500, 502, 503, 504].includes(Number(value?.status)) && value?.remote?.retryable !== false;
}

function safeFailureCode(error: unknown): string {
  const code = String((error as { code?: unknown })?.code || (error as Error)?.message || '');
  return /^(?:OPENXIANGDA_CONNECTED_DEV_(?:BACKEND_(?:HEAD_CHANGED|SESSION_REQUIRED|DEVELOPMENT_HEAD_REQUIRED|CONNECTION_EXPIRED|CONNECTION_BUSY|RESPONSE_BINDING_INVALID|RESPONSE_CONFLICT|REQUEST_INVALID|TRANSPORT_STATE_INVALID|RECOVERY_TIMEOUT))|OPENXIANGDA_PLATFORM_(?:TRANSPORT_FAILED|REQUEST_TIMEOUT))$/.test(code)
    ? code : 'TRANSPORT_REJECTED';
}

function assertRequest(request: DevelopmentBackendRequest, bootstrap: DevelopmentBackendBootstrap) {
  const invocation = request.schemaVersion === DEVELOPMENT_BACKEND_INVOCATION_SCHEMA;
  if ((invocation ? bootstrap.invocationContract !== DEVELOPMENT_BACKEND_INVOCATION_SCHEMA || !developmentBackendInvocationRequestValid(request)
    : request.schemaVersion !== DEVELOPMENT_BACKEND_SCHEMA || !DEVELOPMENT_BACKEND_ENDPOINT_PATTERN.test(request.endpointPath) ||
      typeof request.body !== 'string' || Buffer.byteLength(request.body) > DEVELOPMENT_BACKEND_MAX_REQUEST_BYTES ||
      !request.headers || Object.keys(request.headers).length > 24 ||
      Object.entries(request.headers).some(([key, value]) =>
        !/^(?:content-type|x-openxiangda-[a-z-]+)$/i.test(key) || typeof value !== 'string' || value.length > 8192 || /[\r\n]/.test(value))) ||
    request.sessionId !== bootstrap.sessionId ||
    request.appVersionId !== bootstrap.appVersionId || request.headRevision !== bootstrap.headRevision ||
    !/^[a-f0-9-]{36}$/.test(request.requestId) ||
    !Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 1 || request.timeoutMs > (invocation ? 30_000 : 60_000) ||
    !Number.isFinite(Date.parse(request.expiresAt)) || Date.parse(request.expiresAt) <= Date.now())
    throw new Error('OPENXIANGDA_CONNECTED_DEV_BACKEND_REQUEST_INVALID');
}

export async function forwardDevelopmentBackendRequest(
  localAppBaseUrl: string, request: DevelopmentBackendRequest, signal?: AbortSignal
): Promise<DevelopmentBackendResponse> {
  const base = new URL(localAppBaseUrl);
  const invocation = request.schemaVersion === DEVELOPMENT_BACKEND_INVOCATION_SCHEMA;
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port ||
    base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    (invocation ? !developmentBackendInvocationRequestValid(request) : !DEVELOPMENT_BACKEND_ENDPOINT_PATTERN.test(request.endpointPath)))
    throw new Error('OPENXIANGDA_CONNECTED_DEV_BACKEND_TARGET_INVALID');
  const timeoutMs = Math.min(request.timeoutMs, Date.parse(request.expiresAt) - Date.now());
  if (timeoutMs <= 0) throw new Error('OPENXIANGDA_CONNECTED_DEV_BACKEND_REQUEST_EXPIRED');
  return await new Promise((resolve, reject) => {
    const path = `${request.endpointPath}${invocation && request.canonicalQuery ? `?${request.canonicalQuery}` : ''}`;
    const outgoing = httpRequest(new URL(path, base), {
      method: invocation ? request.method : 'POST', headers: request.headers,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    }, incoming => {
      // Node's HTTP client does not follow redirects.
      if (invocation && /^text\/event-stream(?:\s*;|$)/i.test(String(incoming.headers['content-type'] || ''))) {
        outgoing.destroy(new Error('OPENXIANGDA_CONNECTED_DEV_BACKEND_STREAM_UNSUPPORTED'));
        incoming.destroy(); return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      incoming.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > (invocation ? DEVELOPMENT_BACKEND_INVOCATION_MAX_RESPONSE_BYTES : DEVELOPMENT_BACKEND_MAX_RESPONSE_BYTES)) {
          outgoing.destroy(new Error('OPENXIANGDA_CONNECTED_DEV_BACKEND_RESPONSE_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      incoming.once('error', reject);
      incoming.once('aborted', () => reject(new Error('OPENXIANGDA_CONNECTED_DEV_BACKEND_RESPONSE_ABORTED')));
      incoming.once('end', () => {
        const headers = Object.fromEntries(Object.entries(incoming.headers).filter(([key, value]) =>
          developmentBackendInvocationHeadersValid({ [key]: value }, true)));
        resolve({ requestId: request.requestId, status: incoming.statusCode || 502,
          body: Buffer.concat(chunks).toString(invocation ? 'base64' : 'utf8'),
          ...(invocation ? { schemaVersion: DEVELOPMENT_BACKEND_INVOCATION_SCHEMA, headers: headers as Record<string, string> } : {}) });
      });
    });
    outgoing.once('error', reject);
    outgoing.end(invocation ? Buffer.from(request.body, 'base64') : request.body);
  });
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}
