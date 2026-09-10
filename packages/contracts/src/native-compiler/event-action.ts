import { sha256Digest } from '../canonical.js';
import type { NativeEventActionPlan } from '../native.js';
import type { EventSubscriptionPayload } from '../types.js';

export class NativeEventActionContractError extends Error {
  readonly code = 'NATIVE_EVENT_ACTION_INVALID';
  constructor(readonly pointer: string, message: string) { super(message); }
}

/** The shared compiler owns action authority and capture dependencies. */
export function compileNativeEventAction(
  subscription: Record<string, any>,
  resources: readonly Record<string, any>[],
  pointer = '/events/subscriptions'
): { execution: NativeEventActionPlan; payload: EventSubscriptionPayload } | undefined {
  if (subscription.execution === undefined) return;
  const fail = (path: string, message: string): never => {
    throw new NativeEventActionContractError(`${pointer}${path}`, message);
  };
  const object = (value: any, path: string, keys: string[]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) fail(path, 'Invalid action object or unsupported property');
    return value as Record<string, any>;
  };
  const execution = object(subscription.execution, '/execution', ['kind', 'version', 'operations']);
  if (execution.kind !== 'native-data' || execution.version !== 1) fail('/execution', 'Expected native-data version 1');
  if (subscription.platformAccess) fail('/platformAccess', 'Native actions do not use application runtime capabilities');
  if (!Array.isArray(subscription.eventTypes) || !subscription.eventTypes.length || subscription.eventTypes.some((type: string) =>
    !/^openxiangda\.data\.record\.(created|updated|deleted)\.v2$/.test(type)))
    fail('/eventTypes', 'Native data actions require declared data events');
  const sourceCodes = subscription.filter?.resourceCodes;
  if (!Array.isArray(sourceCodes) || !sourceCodes.length || sourceCodes.length > 20)
    fail('/filter/resourceCodes', 'Native actions require explicit source resources');
  const byCode = new Map(resources.map(resource => [resource.code, resource]));
  const sources = sourceCodes.map((code: string) => {
    const resource = byCode.get(code);
    if (!resource) fail('/filter/resourceCodes', 'Unknown source resource');
    return new Set<string>((resource!.schema?.fields || []).map((field: any) => field.code));
  });
  const fields = new Set<string>(subscription.payload?.fields || []);
  let includeChanges = subscription.payload?.includeChanges === true;
  const binding = (raw: any, path: string) => {
    const value = object(raw, path, ['source', 'path', 'value']);
    if (value.source === 'literal') {
      if (!Object.hasOwn(value, 'value') || Object.hasOwn(value, 'path')) fail(path, 'Literal binding requires only value');
      let serialized: string | undefined;
      try { serialized = JSON.stringify(value.value); } catch { fail(path, 'Literal must be JSON'); }
      if (serialized === undefined || Buffer.byteLength(serialized) > 65536) fail(path, 'Literal is too large or not JSON');
      return { source: 'literal' as const, value: JSON.parse(serialized!) };
    }
    if (value.source !== 'event' || typeof value.path !== 'string' || Object.hasOwn(value, 'value'))
      fail(path, 'Expected a literal or event binding');
    const parts = value.path.split('.');
    if (parts.length > 8 || parts.some((part: string) => !/^[A-Za-z0-9_-]+$/.test(part) ||
      ['__proto__', 'prototype', 'constructor'].includes(part))) fail(path, 'Invalid event path');
    const projection = /^data\.projection\.([A-Za-z][A-Za-z0-9_]{0,62})$/.exec(value.path);
    const change = /^data\.changes\.([A-Za-z][A-Za-z0-9_]{0,62})\.(before|after)$/.exec(value.path);
    if (projection || change) {
      const field = (projection || change)![1]!;
      if (sources.some((source: Set<string>) => !source.has(field))) fail(path, 'Source field must exist on every filtered resource');
      fields.add(field);
      if (change) includeChanges = true;
    } else if (!['id', 'time', 'type', 'subject', 'data.recordId', 'data.revision', 'data.operation', 'data.resourceCode'].includes(value.path)) {
      fail(path, 'Event path is not part of the data event contract');
    }
    return { source: 'event' as const, path: value.path as string };
  };
  if (!Array.isArray(execution.operations) || execution.operations.length < 1 || execution.operations.length > 16)
    fail('/execution/operations', 'Expected 1 to 16 operations');
  const resourceDigests: Record<string, string> = {};
  const operations = execution.operations.map((raw: any, index: number) => {
    const path = `/execution/operations/${index}`;
    const action = object(raw, path, ['operation', 'resourceCode', 'data', 'id', 'expectedRevision']);
    if (!['create', 'update', 'delete'].includes(action.operation)) fail(path, 'Unsupported Native operation');
    const resource = byCode.get(action.resourceCode);
    if (!resource) fail(path, 'Unknown action target resource');
    const resourceFields = new Map<string, any>((resource!.schema?.fields || []).map((field: any) => [field.code, field]));
    const data = action.data === undefined ? {} : object(action.data, `${path}/data`, [...resourceFields.keys()]);
    if (Object.keys(data).length > 32) fail(path, 'Maximum 32 mapped fields per operation');
    if (action.operation === 'create' && (action.id !== undefined || action.expectedRevision !== undefined))
      fail(path, 'Create does not accept id or expectedRevision');
    if (action.operation === 'delete' && action.data !== undefined) fail(path, 'Delete does not accept data');
    if (Object.keys(data).some(field => resourceFields.get(field)?.type === 'serial-number'))
      fail(path, 'Generated fields cannot be assigned');
    resourceDigests[action.resourceCode] = sha256Digest(resource);
    return {
      operation: action.operation,
      resourceCode: action.resourceCode,
      ...(action.operation === 'create' ? {} : {
        id: binding(action.id, `${path}/id`), expectedRevision: binding(action.expectedRevision, `${path}/expectedRevision`),
      }),
      ...(action.operation === 'delete' ? {} : {
        data: Object.fromEntries(Object.entries(data).map(([field, value]) => [field, binding(value, `${path}/data/${field}`)])),
      }),
    };
  });
  if (fields.size > 32 || [...fields].some(field => sources.some((source: Set<string>) => !source.has(field))))
    fail('/payload/fields', 'Payload must contain at most 32 declared source fields');
  const plan = { kind: 'native-data' as const, version: 1 as const, operations, resourceDigests };
  if (Buffer.byteLength(JSON.stringify(plan)) > 65536) fail('/execution', 'Action plan exceeds 64 KiB');
  return { execution: { ...plan, digest: sha256Digest(plan) }, payload: { includeChanges, fields: [...fields].sort() } };
}
