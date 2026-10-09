import { DATA_QUERY_OPERATORS } from './data-query-operators.js';
import { sha256Digest } from '../canonical.js';
import type { DataQuery, DataTransactionGuard, DataTransactionOperation, DataTransactionResult } from '../types.js';

export interface EventWorkerResourceGrant {
  resourceCode: string;
  readFields: string[];
  writeOperations: Array<'create' | 'update'>;
  writeFields: string[];
}
export interface EventWorkerEffectDeclaration {
  kind: 'worker-effect';
  version: 1;
  resources: EventWorkerResourceGrant[];
  emitEventTypes: string[];
  maxOperations: number;
  maxGuards: number;
  maxQueryRecords: number;
  maxIntentsPerEvent: number;
}
export interface EventWorkerEffectPlan extends EventWorkerEffectDeclaration {
  resourceDigests: Record<string, string>;
  digest: string;
}
export interface EventWorkerMutationPlan {
  operations: DataTransactionOperation[];
  guards: DataTransactionGuard[];
}
export interface EventWorkerEffectScope {
  tenantId: string; appCode: string; environmentKey: string; subscriptionCode: string;
  eventId: string; deliveryId: string; claimToken: string;
}
export type EventWorkerEffectCommand = EventWorkerEffectScope & {
  schemaVersion: 'openxiangda.event-worker-effect-command/v1';
} & (
  | { action: 'query'; resourceCode: string; query: DataQuery }
  | { action: 'prepare'; intentKey: string; plan: EventWorkerMutationPlan }
  | { action: 'commit'; intentKey: string; planDigest: string }
  | { action: 'resolve'; intentKey: string }
);
export interface EventWorkerEffectReceipt {
  schemaVersion: 'openxiangda.event-worker-effect-receipt/v1';
  intentKey: string; planDigest: string; eventId: string; deliveryId: string;
  status: 'prepared' | 'succeeded' | 'rejected'; replayed: boolean;
  errorCode?: string;
  appVersionId: string; headRevision: number;
  result: DataTransactionResult | null;
}
export class EventWorkerEffectContractError extends Error {
  constructor(readonly code: string, readonly pointer: string) { super(code); }
}
const fail = (pointer: string, code = 'EVENT_WORKER_EFFECT_INVALID'): never => { throw new EventWorkerEffectContractError(code, pointer); };
const object = (value: unknown, keys: string[], pointer: string): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(pointer);
  return value as Record<string, any>;
};
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const integer = (value: unknown, min: number, max: number, pointer: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail(pointer); return value as number;
};
const strings = (value: unknown, max: number, pointer: string): string[] => {
  if (!Array.isArray(value) || value.length > max || value.some(item => typeof item !== 'string' || !item || item.length > 255) || new Set(value).size !== value.length) fail(pointer);
  return [...(value as string[])].sort();
};
const bounded = (value: unknown, max: number, pointer: string) => { if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value) fail(pointer); };
const jsonBytes = (value: unknown, pointer: string) => {
  let serialized: string | undefined; try { serialized = JSON.stringify(value); } catch { fail(pointer); }
  if (!serialized || Buffer.byteLength(serialized) > 65536) fail(pointer, 'EVENT_WORKER_EFFECT_SIZE_EXCEEDED');
};

/** Single compiler/SDK/platform authority validator; no application-defined identities. */
export function compileEventWorkerEffect(raw: unknown, resources: readonly Record<string, any>[], emitTypes: readonly string[], workflowResources: readonly string[] = [], pointer = '/execution'): EventWorkerEffectPlan {
  const value = object(raw, ['kind','version','resources','emitEventTypes','maxOperations','maxGuards','maxQueryRecords','maxIntentsPerEvent'], pointer);
  if (value.kind !== 'worker-effect' || value.version !== 1 || !Array.isArray(value.resources) || !value.resources.length || value.resources.length > 16) fail(pointer);
  const byCode = new Map(resources.map(resource => [resource.code, resource]));
  const used = new Set<string>(); const resourceDigests: Record<string, string> = {};
  const grants = value.resources.map((entry: unknown, index: number): EventWorkerResourceGrant => {
    const p = `${pointer}/resources/${index}`, grant = object(entry, ['resourceCode','readFields','writeOperations','writeFields'], p);
    const resource = byCode.get(grant.resourceCode);
    if (!resource || used.has(grant.resourceCode)) fail(p, 'EVENT_WORKER_EFFECT_RESOURCE_INVALID');
    used.add(grant.resourceCode);
    const fields = new Map<string, any>((resource!.schema?.fields || []).map((field: any) => [field.code, field]));
    const readFields = strings(grant.readFields, 64, `${p}/readFields`), writeFields = strings(grant.writeFields, 64, `${p}/writeFields`);
    const writeOperations = strings(grant.writeOperations, 2, `${p}/writeOperations`);
    if (writeOperations.some(operation => !['create','update'].includes(operation)) || Boolean(writeOperations.length) !== Boolean(writeFields.length)) fail(p);
    if (!readFields.length || readFields.some(field => !['id','revision'].includes(field) && !fields.has(field))) fail(`${p}/readFields`, 'EVENT_WORKER_EFFECT_FIELD_INVALID');
    if (writeFields.some(field => !fields.has(field) || fields.get(field).type === 'serial-number' || ['id','revision','tenant_id','app_code','environment_key','created_at','created_by','updated_at','updated_by'].includes(field))) fail(`${p}/writeFields`, 'EVENT_WORKER_EFFECT_FIELD_INVALID');
    if (writeOperations.length && workflowResources.includes(grant.resourceCode)) fail(p, 'EVENT_WORKER_EFFECT_WORKFLOW_RESOURCE_FORBIDDEN');
    resourceDigests[grant.resourceCode] = sha256Digest(resource!);
    return { resourceCode: grant.resourceCode, readFields, writeFields, writeOperations: writeOperations as EventWorkerResourceGrant['writeOperations'] };
  }).sort((a: EventWorkerResourceGrant, b: EventWorkerResourceGrant) => a.resourceCode.localeCompare(b.resourceCode));
  const eventTypes = strings(value.emitEventTypes, 16, `${pointer}/emitEventTypes`);
  if (eventTypes.some(type => !emitTypes.includes(type) || type.startsWith('openxiangda.'))) fail(`${pointer}/emitEventTypes`, 'EVENT_WORKER_EFFECT_EVENT_INVALID');
  const plan: Omit<EventWorkerEffectPlan,'digest'> = { kind:'worker-effect', version:1, resources:grants, emitEventTypes:eventTypes, resourceDigests,
    maxOperations:integer(value.maxOperations,1,8,`${pointer}/maxOperations`), maxGuards:integer(value.maxGuards,1,24,`${pointer}/maxGuards`),
    maxQueryRecords:integer(value.maxQueryRecords,1,500,`${pointer}/maxQueryRecords`), maxIntentsPerEvent:integer(value.maxIntentsPerEvent,1,100,`${pointer}/maxIntentsPerEvent`) };
  jsonBytes(plan,pointer); return {...plan,digest:sha256Digest(plan)};
}

function grantFor(plan: EventWorkerEffectPlan, code: unknown, pointer: string) {
  const grant = plan.resources.find(resource => resource.resourceCode === code);
  if (!grant) fail(pointer,'EVENT_WORKER_EFFECT_RESOURCE_FORBIDDEN'); return grant!;
}
function whereFields(value: unknown, allowed: readonly string[], pointer: string, depth = 0): void {
  if (depth > 12) fail(pointer);
  const where = object(value,['field','operator','value','path','and','or','not'],pointer);
  if (where.field !== undefined) {
    if (!DATA_QUERY_OPERATORS.has(where.operator) || (where.path !== undefined && (typeof where.path !== 'string' || !/^(value|label|snapshot\.[A-Za-z][A-Za-z0-9_]{0,62}|[A-Za-z][A-Za-z0-9_]{0,62})$/.test(where.path)))) fail(pointer);
    if (!allowed.includes(where.field)) fail(pointer,'EVENT_WORKER_EFFECT_FIELD_FORBIDDEN');
    if (where.and !== undefined || where.or !== undefined || where.not !== undefined) fail(pointer);
    return;
  }
  const keys = Object.keys(where);
  if (keys.length !== 1) fail(pointer);
  if (where.not !== undefined) return whereFields(where.not,allowed,`${pointer}/not`,depth+1);
  const kind = where.and !== undefined ? 'and' : 'or', items = where[kind];
  if (!Array.isArray(items) || !items.length || items.length > 100) fail(pointer);
  items.forEach((item: unknown,index: number) => whereFields(item,allowed,`${pointer}/${kind}/${index}`,depth+1));
}
export function validateEventWorkerQuery(plan: EventWorkerEffectPlan, resourceCode: string, input: DataQuery): DataQuery {
  const value = object(input,['schemaVersion','select','where','order','limit','offset'],'/query');
  if (value.schemaVersion !== 'openxiangda.data-query/v2') fail('/query');
  const grant = grantFor(plan,resourceCode,'/resourceCode'), selected = strings(value.select,64,'/query/select');
  if (!selected.length || selected.some(field => !grant.readFields.includes(field))) fail('/query/select','EVENT_WORKER_EFFECT_FIELD_FORBIDDEN');
  integer(value.limit,1,plan.maxQueryRecords,'/query/limit'); integer(value.offset ?? 0,0,10000,'/query/offset');
  if (value.where !== undefined) whereFields(value.where,grant.readFields,'/query/where');
  if (value.order !== undefined) {
    if (!Array.isArray(value.order) || value.order.length > 8) fail('/query/order');
    value.order.forEach((entry: unknown,index: number) => { const order = object(entry,['field','direction'],`/query/order/${index}`);
      if (!grant.readFields.includes(order.field) || !['asc','desc'].includes(order.direction)) fail('/query/order','EVENT_WORKER_EFFECT_FIELD_FORBIDDEN'); });
  }
  jsonBytes(input,'/query'); return input;
}
export function validateEventWorkerMutationPlan(plan: EventWorkerEffectPlan, raw: EventWorkerMutationPlan): EventWorkerMutationPlan {
  const input = object(raw,['guards','operations'],'/plan'); jsonBytes(input,'/plan');
  if (!Array.isArray(input.operations) || !input.operations.length || input.operations.length > plan.maxOperations || !Array.isArray(input.guards) || !input.guards.length || input.guards.length > plan.maxGuards) fail('/plan');
  input.operations.forEach((entry: unknown,index: number) => {
    const p = `/plan/operations/${index}`, operation = object(entry,['operation','resourceCode','id','expectedRevision','data','eventType','subject'],p);
    if (operation.operation === 'emitEvent') {
      if (operation.resourceCode !== undefined || operation.id !== undefined || operation.expectedRevision !== undefined || !plan.emitEventTypes.includes(operation.eventType)) fail(p,'EVENT_WORKER_EFFECT_EVENT_INVALID');
      if (operation.subject !== undefined) bounded(operation.subject,255,`${p}/subject`);
      object(operation.data,Object.keys(operation.data || {}),`${p}/data`); return;
    }
    if (!['create','update'].includes(operation.operation) || operation.eventType !== undefined || operation.subject !== undefined) fail(p);
    const grant = grantFor(plan,operation.resourceCode,p);
    if (!grant.writeOperations.includes(operation.operation)) fail(p,'EVENT_WORKER_EFFECT_OPERATION_FORBIDDEN');
    const data = object(operation.data,grant.writeFields,`${p}/data`);
    if (!Object.keys(data).length) fail(`${p}/data`);
    if (operation.operation === 'update') { if (!uuid(operation.id)) fail(`${p}/id`); integer(operation.expectedRevision,1,Number.MAX_SAFE_INTEGER,`${p}/expectedRevision`); }
    else if (operation.id !== undefined || operation.expectedRevision !== undefined) fail(p);
  });
  input.guards.forEach((entry: unknown,index: number) => {
    const p = `/plan/guards/${index}`, rawGuard = entry as any, keys = rawGuard?.kind === 'record-set-match' ? ['kind','resourceCode','errorCode','records','where'] : ['kind','resourceCode','errorCode','id','assertions','lockKey','where'];
    const guard = object(entry,keys,p);
    if (!['query-empty','record-match','record-assert','record-exists','record-set-match'].includes(guard.kind)) fail(p,'EVENT_WORKER_EFFECT_GUARD_FORBIDDEN');
    const grant = grantFor(plan,guard.resourceCode,p); bounded(guard.errorCode,128,`${p}/errorCode`);
    if (guard.kind === 'record-set-match') {
      if (!Array.isArray(guard.records) || guard.records.length > 500 || new Set(guard.records.map((row: any)=>row?.id)).size !== guard.records.length) fail(p);
      guard.records.forEach((raw: unknown) => { const row = object(raw,['id','expectedRevision'],p); if (!uuid(row.id)) fail(p); integer(row.expectedRevision,1,Number.MAX_SAFE_INTEGER,p); });
      if (guard.where !== undefined) whereFields(guard.where,grant.readFields,`${p}/where`); return;
    }
    bounded(guard.lockKey,255,`${p}/lockKey`);
    if (guard.kind === 'query-empty') { if (guard.id !== undefined || guard.assertions !== undefined) fail(p); whereFields(guard.where,grant.readFields,`${p}/where`); return; }
    if (!uuid(guard.id) || guard.where !== undefined) fail(p);
    if (guard.kind === 'record-exists') { if (guard.assertions !== undefined) fail(p); return; }
    if (!Array.isArray(guard.assertions) || !guard.assertions.length || guard.assertions.length > 32) fail(p);
    guard.assertions.forEach((raw: unknown) => { const assertion = object(raw,['kind','field','operator','value','path','leftField','rightField'],p);
      if (!['value','field','database-now'].includes(assertion.kind)) fail(p);
      const fields = assertion.kind === 'field' ? [assertion.leftField,assertion.rightField] : [assertion.field];
      if (fields.some(field => !grant.readFields.includes(field))) fail(p,'EVENT_WORKER_EFFECT_FIELD_FORBIDDEN'); });
  });
  return raw;
}
export function eventWorkerEffectSignatureContent(command: EventWorkerEffectCommand, timestamp: string): string {
  return [command.schemaVersion,timestamp,sha256Digest(command)].join('\n');
}
