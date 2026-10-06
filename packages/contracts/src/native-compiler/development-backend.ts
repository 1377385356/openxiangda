/** Transport only: business execution/receipts remain owned by platform events. */
export const DEVELOPMENT_BACKEND_FEATURE = 'application.development-backend-events';
export const DEVELOPMENT_BACKEND_SCHEMA = 'openxiangda.development-backend/v1';
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
  /** Private CLI -> local Nest environment, never browser or status output. */
  secretEnvironment: Record<string, string>;
}
export interface DevelopmentBackendRequest {
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
export interface DevelopmentBackendResponse {
  requestId: string;
  status: number;
  body: string;
}
