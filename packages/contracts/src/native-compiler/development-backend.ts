/** Transport only: identity, business execution and receipts remain platform-owned. */
export const DEVELOPMENT_BACKEND_FEATURE = 'application.development-backend-events';
export const DEVELOPMENT_BACKEND_SCHEMA = 'openxiangda.development-backend/v1';
export const DEVELOPMENT_BACKEND_INVOCATION_FEATURE = 'application.development-backend-invocations';
export const DEVELOPMENT_BACKEND_INVOCATION_SCHEMA = 'openxiangda.development-backend-invocation/v1';
export const DEVELOPMENT_BACKEND_INVOCATION_MAX_REQUEST_BYTES = 256 * 1024;
export const DEVELOPMENT_BACKEND_INVOCATION_MAX_RESPONSE_BYTES = 1024 * 1024;
export const DEVELOPMENT_BACKEND_MAX_RESPONSE_BYTES = 128 * 1024;
export const DEVELOPMENT_BACKEND_MAX_REQUEST_BYTES = 128 * 1024;
export const DEVELOPMENT_BACKEND_MAX_INFLIGHT = 8;
export const DEVELOPMENT_BACKEND_CONNECTION_TTL_SECONDS = 45;
export const DEVELOPMENT_BACKEND_ENDPOINT_PATTERN = /^\/__platform\/events\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Derived only from a compiler-validated config bundle, never a client flag. */
export function requiresDevelopmentBackendCredential(configuration: {
  backend?: { operations?: unknown[] };
  workflows?: { providers?: unknown[] };
  events?: { subscriptions?: Array<{ execution?: { kind?: string } }> };
}): boolean {
  return (configuration.backend?.operations?.length || 0) > 0 ||
    (configuration.workflows?.providers?.length || 0) > 0 ||
    (configuration.events?.subscriptions || []).some(subscription => subscription.execution?.kind !== 'native-data');
}

export interface DevelopmentBackendBootstrap {
  schemaVersion: typeof DEVELOPMENT_BACKEND_SCHEMA;
  sessionId: string;
  environmentId: string;
  appVersionId: string;
  headRevision: number;
  /** Explicit CLI/platform negotiation; absent for an event-only connection. */
  invocationContract?: typeof DEVELOPMENT_BACKEND_INVOCATION_SCHEMA;
  /** Private CLI -> local Nest environment, never browser or status output. */
  secretEnvironment: Record<string, string>;
}
export interface DevelopmentBackendEventRequest {
  schemaVersion: typeof DEVELOPMENT_BACKEND_SCHEMA;
  requestId: string;
  sessionId: string;
  appVersionId: string;
  headRevision: number;
  endpointPath: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  expiresAt: string;
}
export interface DevelopmentBackendInvocationRequest extends Omit<DevelopmentBackendEventRequest, 'schemaVersion'> {
  schemaVersion: typeof DEVELOPMENT_BACKEND_INVOCATION_SCHEMA;
  method: string;
  canonicalQuery: string;
  /** The unique operation selected from the current sealed configuration. */
  operation: { code: string; method: string; path: string };
  /** Canonical base64 of the exact signed body, including the empty body. */
  body: string;
}
export type DevelopmentBackendRequest = DevelopmentBackendEventRequest | DevelopmentBackendInvocationRequest;
export interface DevelopmentBackendResponse {
  requestId: string;
  status: number;
  body: string;
  /** Invocation replies use canonical base64; old event replies remain UTF-8. */
  schemaVersion?: typeof DEVELOPMENT_BACKEND_INVOCATION_SCHEMA;
  headers?: Record<string, string>;
}

export function developmentBackendInvocationRevision(sessionId: string): string {
  return `connected-development:${sessionId}`;
}

/** Invalid encodings are rejected before allocation. No binary/text round-trip. */
export function developmentBackendBase64Bytes(value: unknown): number | null {
  if (typeof value !== 'string' || value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  if (padding && alphabet.indexOf(value[value.length - padding - 1]!) % (padding === 2 ? 16 : 4) !== 0) return null;
  return value.length / 4 * 3 - padding;
}

export function developmentBackendOperationMatches(method: string, path: string,
  operation: { method: string; path: string }): boolean {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method) || operation.method !== method ||
    typeof path !== 'string' || path.length > 2048 || !path.startsWith('/') || path.startsWith('//') ||
    path.startsWith('/__platform') || /[\\?#\s\u0000-\u001f\u007f]/.test(path)) return false;
  const parts = path.split('/'), declared = String(operation.path || '').split('/');
  if (parts.length !== declared.length) return false;
  return parts.every((part, index) => {
    if (index === 0) return declared[index] === '';
    let decoded: string;
    try { decoded = decodeURIComponent(part); } catch { return false; }
    if (!decoded || ['.', '..'].includes(decoded) || /[\/\\\s\u0000-\u001f\u007f]/.test(decoded)) return false;
    return /^:[A-Za-z][A-Za-z0-9_]*$/.test(declared[index] || '') || part === declared[index];
  });
}

const requestHeader = /^(?:authorization|content-type|content-length|accept|if-match|idempotency-key|x-request-id|x-openxiangda-(?:gateway-assertion|forwarded-by|perspective|csrf-token|mcp-bus-token|dev-selection))$/i;
const responseHeader = /^(?:content-type|content-disposition|cache-control|etag|last-modified|retry-after)$/i;
export function developmentBackendInvocationHeadersValid(value: unknown, response = false): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value), names = entries.map(([key]) => key.toLowerCase());
  return entries.length <= 24 && new Set(names).size === names.length && entries.every(([key, item]) =>
    (response ? responseHeader : requestHeader).test(key) && typeof item === 'string' &&
    item.length <= 8192 && !/[\r\n\u0000]/.test(item));
}

/** Both sides enforce the same bounded invocation envelope before local dispatch. */
export function developmentBackendInvocationRequestValid(input: DevelopmentBackendInvocationRequest): boolean {
  const bytes = developmentBackendBase64Bytes(input.body);
  return input.schemaVersion === DEVELOPMENT_BACKEND_INVOCATION_SCHEMA &&
    !!input.operation && typeof input.operation.code === 'string' && input.operation.code.length <= 128 &&
    input.operation.code.length > 0 && developmentBackendOperationMatches(input.method, input.endpointPath, input.operation) &&
    typeof input.canonicalQuery === 'string' && input.canonicalQuery.length <= 8192 && !/[\s#\u0000-\u001f\u007f]/.test(input.canonicalQuery) &&
    bytes !== null && bytes <= DEVELOPMENT_BACKEND_INVOCATION_MAX_REQUEST_BYTES &&
    developmentBackendInvocationHeadersValid(input.headers) &&
    Object.entries(input.headers).some(([key, value]) => key.toLowerCase() === 'authorization' && /^Bearer \S+$/.test(value)) &&
    Object.entries(input.headers).some(([key, value]) => key.toLowerCase() === 'x-openxiangda-gateway-assertion' && !!value);
}
