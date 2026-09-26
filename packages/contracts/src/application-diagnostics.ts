export const APPLICATION_DIAGNOSTICS_SCHEMA = 'openxiangda.application-diagnostics/v2' as const;
export type ApplicationDiagnosticLocator = 'requestId' | 'commandId' | 'deploymentRunId' | 'fileId';
export interface ApplicationDiagnosticQuery {
  environmentKey: 'preproduction' | 'production';
  kind: ApplicationDiagnosticLocator;
  id: string;
  from?: string;
  to?: string;
}
export interface ApplicationDiagnosticFact {
  kind: string;
  id: string;
  occurredAt: string;
  status: string;
  resourceCode?: string;
  recordId?: string;
  revision?: number;
  operationCode?: string;
  eventId?: string;
  workflowInstanceId?: string;
  versionId?: string;
  attempt?: number;
  errorCode?: string;
  stage?: string;
  candidateState?: string;
  recoveryAction?: string;
}
export interface ApplicationDiagnosticResult {
  schemaVersion: typeof APPLICATION_DIAGNOSTICS_SCHEMA;
  observedAt: string;
  scope: { appCode: string; environmentKey: ApplicationDiagnosticQuery['environmentKey']; environmentId: string | null };
  locator: { kind: ApplicationDiagnosticLocator; id: string };
  window: { from: string; to: string } | null;
  state: 'observed' | 'not_observed' | 'unavailable';
  reason: string | null;
  truncated: boolean;
  facts: ApplicationDiagnosticFact[];
  nextActions: Array<{ code: string; message: string }>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const code = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const kinds: ApplicationDiagnosticLocator[] = ['requestId', 'commandId', 'deploymentRunId', 'fileId'];
function fail(kind: 'QUERY' | 'RESPONSE'): never {
  const code = `OPENXIANGDA_DIAGNOSTIC_${kind}_INVALID`;
  throw Object.assign(new Error(code), { code });
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}
/** Produces a bounded exact query; never discovers another environment or retries a write. */
export function parseApplicationDiagnosticQuery(value: unknown): ApplicationDiagnosticQuery {
  if (!record(value) || Object.keys(value).some(key => !['environmentKey', 'kind', 'id', 'from', 'to'].includes(key))
    || !['preproduction', 'production'].includes(String(value.environmentKey))
    || !kinds.includes(value.kind as ApplicationDiagnosticLocator) || typeof value.id !== 'string'
    || !(value.kind === 'requestId' ? identifier : uuid).test(value.id)) return fail('QUERY');
  const query: ApplicationDiagnosticQuery = { environmentKey: value.environmentKey as ApplicationDiagnosticQuery['environmentKey'], kind: value.kind as ApplicationDiagnosticLocator, id: value.id };
  if (value.kind === 'requestId') {
    if (!timestamp(value.from) || !timestamp(value.to)) return fail('QUERY');
    const duration = Date.parse(value.to) - Date.parse(value.from);
    if (duration <= 0 || duration > 86400000) return fail('QUERY');
    query.from = new Date(value.from).toISOString();
    query.to = new Date(value.to).toISOString();
  } else if (value.from !== undefined || value.to !== undefined) return fail('QUERY');
  return query;
}

/** Whitelist metadata instead of spreading the response: optional server additions remain compatible and private payloads stay out of CLI output. */
export function parseApplicationDiagnosticResult(value: unknown, expected: ApplicationDiagnosticQuery & { appCode: string }): ApplicationDiagnosticResult {
  const query = parseApplicationDiagnosticQuery({ environmentKey: expected.environmentKey, kind: expected.kind, id: expected.id, ...(expected.from === undefined ? {} : { from: expected.from, to: expected.to }) });
  if (!record(value) || value.schemaVersion !== APPLICATION_DIAGNOSTICS_SCHEMA || !timestamp(value.observedAt)
    || !record(value.scope) || value.scope.appCode !== expected.appCode || value.scope.environmentKey !== query.environmentKey
    || !(value.scope.environmentId === null || typeof value.scope.environmentId === 'string' && uuid.test(value.scope.environmentId))
    || !record(value.locator) || value.locator.kind !== query.kind || value.locator.id !== query.id
    || !['observed', 'not_observed', 'unavailable'].includes(String(value.state)) || typeof value.truncated !== 'boolean'
    || !(value.reason === null || typeof value.reason === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value.reason))
    || !Array.isArray(value.facts) || value.facts.length > 50 || !Array.isArray(value.nextActions) || value.nextActions.length > 8) return fail('RESPONSE');
  if (query.kind === 'requestId') {
    if (!record(value.window) || value.window.from !== query.from || value.window.to !== query.to) return fail('RESPONSE');
  } else if (value.window !== null) return fail('RESPONSE');
  if ((value.state === 'observed') !== (value.facts.length > 0) || value.state === 'unavailable' && value.reason === null) return fail('RESPONSE');
  const facts = value.facts.map((item: unknown): ApplicationDiagnosticFact => {
    if (!record(item) || typeof item.kind !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(item.kind)
      || typeof item.id !== 'string' || !uuid.test(item.id) || !timestamp(item.occurredAt)
      || typeof item.status !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(item.status)) return fail('RESPONSE');
    const fact: ApplicationDiagnosticFact = { kind: item.kind, id: item.id, occurredAt: item.occurredAt, status: item.status };
    for (const key of ['resourceCode', 'operationCode', 'stage', 'candidateState', 'recoveryAction'] as const) {
      if (item[key] === undefined) continue;
      if (typeof item[key] !== 'string' || !code.test(item[key])) return fail('RESPONSE');
      fact[key] = item[key];
    }
    for (const key of ['recordId', 'eventId', 'workflowInstanceId', 'versionId'] as const) {
      if (item[key] === undefined) continue;
      if (typeof item[key] !== 'string' || !uuid.test(item[key])) return fail('RESPONSE');
      fact[key] = item[key];
    }
    for (const key of ['revision', 'attempt'] as const) {
      if (item[key] === undefined) continue;
      if (!Number.isSafeInteger(item[key]) || (item[key] as number) < 0) return fail('RESPONSE');
      fact[key] = item[key] as number;
    }
    if (item.errorCode !== undefined) {
      if (typeof item.errorCode !== 'string' || !/^(OPENXIANGDA_|EVENT_|WORKFLOW_|HTTP_)[A-Z0-9_]{1,112}$/.test(item.errorCode)) return fail('RESPONSE');
      fact.errorCode = item.errorCode;
    }
    return fact;
  });
  const nextActions = value.nextActions.map((item: unknown) => {
    if (!record(item) || typeof item.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(item.code)
      || typeof item.message !== 'string' || item.message.length > 300 || /[\u0000-\u001f\u007f]/.test(item.message)) return fail('RESPONSE');
    return { code: item.code, message: item.message };
  });
  return {
    schemaVersion: APPLICATION_DIAGNOSTICS_SCHEMA, observedAt: value.observedAt,
    scope: { appCode: expected.appCode, environmentKey: query.environmentKey, environmentId: value.scope.environmentId as string | null },
    locator: { kind: query.kind, id: query.id }, window: query.kind === 'requestId' ? { from: query.from!, to: query.to! } : null,
    state: value.state as ApplicationDiagnosticResult['state'], reason: value.reason as string | null,
    truncated: value.truncated, facts, nextActions,
  };
}
