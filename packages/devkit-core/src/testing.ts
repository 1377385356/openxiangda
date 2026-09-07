export interface CurrentUserFixtureOptions {
  userId?: string;
  appCode?: string;
  environmentKey?: "preproduction" | "production";
  roleCodes?: string[];
  capabilityCodes?: string[];
  isAppSuperAdmin?: boolean;
}

export interface CurrentUserFixture {
  userId: string;
  appCode: string;
  environmentKey: "preproduction" | "production";
  roleCodes: string[];
  capabilityCodes: string[];
  isAppSuperAdmin: boolean;
}

export interface PermissionMatrixCase<TData = Record<string, unknown>> {
  name: string;
  currentUser: CurrentUserFixture;
  operation: "list" | "read" | "create" | "update" | "delete";
  data?: TData;
  expected: "allow" | "deny";
}

export interface PermissionMatrixResult {
  name: string;
  expected: "allow" | "deny";
  actual: "allow" | "deny";
  passed: boolean;
}

export interface DataRecordEventFixtureOptions {
  eventId?: string;
  eventType?: DataEventTypeV2;
  tenantId?: string;
  appCode?: string;
  environmentKey?: "preproduction" | "production";
  resourceCode?: string;
  recordId?: string;
  revision?: number;
  changedFields?: string[];
  changes?: DataRecordEventData["changes"];
  projection?: DataRecordEventData["projection"];
  time?: string;
}

export interface EventSimulationResult {
  matched: boolean;
  event: CloudEvent<DataRecordEventData> | null;
}

export interface SignedEventDeliveryFixture {
  rawBody: string;
  headers: Record<string, string>;
  handlerManifestDigest: string;
}

export type PermissionAuthorizer<TData = Record<string, unknown>> = (
  testCase: PermissionMatrixCase<TData>
) => Promise<boolean> | boolean;

export class PermissionMatrixError extends Error {
  constructor(readonly results: PermissionMatrixResult[]) {
    super(
      `权限矩阵失败: ${results
        .filter(result => !result.passed)
        .map(
          result =>
            `${result.name} expected=${result.expected} actual=${result.actual}`
        )
        .join(", ")}`
    );
    this.name = "PermissionMatrixError";
  }
}

export function currentUserFixture(
  options: CurrentUserFixtureOptions = {}
): CurrentUserFixture {
  return {
    userId: options.userId || "user-test",
    appCode: options.appCode || "reference-app",
    environmentKey: options.environmentKey || "preproduction",
    roleCodes: normalized(options.roleCodes || ["instrument_admin"]),
    capabilityCodes: normalized(options.capabilityCodes || []),
    isAppSuperAdmin: options.isAppSuperAdmin === true,
  };
}

export function dataRecordEventFixture(
  options: DataRecordEventFixtureOptions = {}
): CloudEvent<DataRecordEventData> {
  const eventType =
    options.eventType || "openxiangda.data.record.updated.v2";
  const operation = eventType.endsWith(".created.v2")
    ? "created"
    : eventType.endsWith(".deleted.v2")
      ? "deleted"
      : "updated";
  const resourceCode = options.resourceCode || "instruments";
  const recordId = options.recordId || "00000000-0000-4000-8000-000000000001";
  const changedFields = normalized(options.changedFields || ["status"]);
  return {
    specversion: "1.0",
    id: options.eventId || "00000000-0000-4000-8000-000000000010",
    type: eventType,
    source: `/applications/${options.appCode || "reference-app"}/data-resources/${resourceCode}`,
    subject: `/records/${recordId}`,
    time: options.time || "2026-08-24T00:00:00.000Z",
    datacontenttype: "application/json",
    dataschema: `openxiangda://events/openxiangda.data.record/${eventType.split(".").at(-1)}`,
    tenantid: options.tenantId || "tenant-test",
    appcode: options.appCode || "reference-app",
    environment: options.environmentKey || "preproduction",
    traceid: "trace-test",
    schemaversion: "2.0.0",
    data: {
      resourceCode,
      recordId,
      operation,
      revision: options.revision ?? 2,
      changedFields,
      changes:
        options.changes ||
        Object.fromEntries(
          changedFields.map(field => [field, { before: "before", after: "after" }])
        ),
      projection: options.projection || {},
      actor: { principalType: "user_union", subjectId: "user-test" },
      cause: { eventId: null, subscriptionCode: null, depth: 0 },
    },
  };
}

export function signedEventDeliveryFixture(input: {
  event: CloudEvent;
  subscriptionCode: string;
  deliveryId: string;
  signingSecret: string;
  signingKeyVersion?: number;
  handlerManifest: EventHandlerManifest;
  timestamp?: number;
}): SignedEventDeliveryFixture {
  const rawBody = JSON.stringify(input.event);
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const signingKeyVersion = String(input.signingKeyVersion ?? 1);
  const handlerManifestDigest = sha256Digest(input.handlerManifest);
  const signature = createHmac('sha256', input.signingSecret)
    .update(
      eventDeliverySignatureContentV2({
        timestamp,
        signingKeyVersion,
        deliveryId: input.deliveryId,
        eventId: input.event.id,
        subscriptionCode: input.subscriptionCode,
        handlerManifestDigest,
        rawBody,
      })
    )
    .digest('hex');
  return {
    rawBody,
    handlerManifestDigest,
    headers: {
      'content-type': 'application/cloudevents+json; charset=utf-8',
      'x-openxiangda-event-id': input.event.id,
      'x-openxiangda-delivery-id': input.deliveryId,
      'x-openxiangda-subscription-code': input.subscriptionCode,
      'x-openxiangda-timestamp': timestamp,
      'x-openxiangda-signing-key-version': signingKeyVersion,
      'x-openxiangda-handler-manifest-digest': handlerManifestDigest,
      'x-openxiangda-signature': `v2=${signature}`,
    },
  };
}

export function eventMatchesSubscription(
  event: CloudEvent<DataRecordEventData>,
  filter: EventSubscriptionFilter = {}
) {
  if (
    filter.resourceCodes?.length &&
    !filter.resourceCodes.includes(event.data.resourceCode)
  ) {
    return false;
  }
  if (
    filter.subject?.equals !== undefined &&
    event.subject !== filter.subject.equals
  ) {
    return false;
  }
  if (
    filter.subject?.prefix !== undefined &&
    !String(event.subject || "").startsWith(filter.subject.prefix)
  ) {
    return false;
  }
  const changed = new Set(event.data.changedFields);
  if (
    filter.changedFields?.anyOf?.length &&
    !filter.changedFields.anyOf.some(field => changed.has(field))
  ) {
    return false;
  }
  if (
    filter.changedFields?.allOf?.length &&
    !filter.changedFields.allOf.every(field => changed.has(field))
  ) {
    return false;
  }
  if (
    filter.changedFields?.noneOf?.some(field => changed.has(field))
  ) {
    return false;
  }
  if (
    filter.changes?.some(
      change => !eventChangeMatches(event.data, change)
    )
  ) {
    return false;
  }
  return filter.where ? eventConditionMatches(event.data, filter.where) : true;
}

export function simulateEventSubscription(
  event: CloudEvent<DataRecordEventData>,
  input: { filter?: EventSubscriptionFilter; payload?: Partial<EventSubscriptionPayload> }
): EventSimulationResult {
  if (!eventMatchesSubscription(event, input.filter || {})) {
    return { matched: false, event: null };
  }
  const fields = input.payload?.fields || [];
  const projection = Object.fromEntries(
    fields
      .filter(field => Object.prototype.hasOwnProperty.call(event.data.projection, field))
      .map(field => [field, event.data.projection[field]])
  );
  return {
    matched: true,
    event: {
      ...event,
      data: {
        ...event.data,
        changes: input.payload?.includeChanges === false ? {} : event.data.changes,
        projection,
      },
    },
  };
}

export async function runPermissionMatrix<TData>(
  cases: PermissionMatrixCase<TData>[],
  authorize: PermissionAuthorizer<TData>
): Promise<PermissionMatrixResult[]> {
  const results: PermissionMatrixResult[] = [];
  for (const testCase of cases) {
    const actual = (await authorize(testCase)) ? "allow" : "deny";
    results.push({
      name: testCase.name,
      expected: testCase.expected,
      actual,
      passed: actual === testCase.expected,
    });
  }
  return results;
}

export async function assertPermissionMatrix<TData>(
  cases: PermissionMatrixCase<TData>[],
  authorize: PermissionAuthorizer<TData>
) {
  const results = await runPermissionMatrix(cases, authorize);
  if (results.some(result => !result.passed)) {
    throw new PermissionMatrixError(results);
  }
  return results;
}

function normalized(values: string[]) {
  return [...new Set(values.map(String).map(value => value.trim()).filter(Boolean))]
    .sort();
}

function eventConditionMatches(
  data: DataRecordEventData,
  condition: EventFilterCondition
): boolean {
  if ("change" in condition) return eventChangeMatches(data, condition.change);
  if ("all" in condition) {
    return condition.all.every(item => eventConditionMatches(data, item));
  }
  if ("any" in condition) {
    return condition.any.some(item => eventConditionMatches(data, item));
  }
  return !eventConditionMatches(data, condition.not);
}

function eventChangeMatches(
  data: DataRecordEventData,
  filter: EventChangeFilter
) {
  const change = data.changes[filter.field];
  if (!change) return false;
  return (
    (!filter.before || eventPredicateMatches(change.before, filter.before)) &&
    (!filter.after || eventPredicateMatches(change.after, filter.after))
  );
}

function eventPredicateMatches(value: unknown, predicate: EventValuePredicate) {
  if ("exists" in predicate) return predicate.exists === (value !== undefined);
  if ("eq" in predicate) return canonicalEqual(value, predicate.eq);
  if ("ne" in predicate) return !canonicalEqual(value, predicate.ne);
  if ("in" in predicate) {
    return (predicate.in || []).some(item => canonicalEqual(value, item));
  }
  return !(predicate.notIn || []).some(item => canonicalEqual(value, item));
}

function canonicalEqual(left: unknown, right: unknown) {
  return canonicalJsonValue(left) === canonicalJsonValue(right);
}

function canonicalJsonValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJsonValue(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
import {
  eventDeliverySignatureContentV2,
  sha256Digest,
  type CloudEvent,
  type DataEventTypeV2,
  type DataRecordEventData,
  type EventChangeFilter,
  type EventFilterCondition,
  type EventSubscriptionFilter,
  type EventSubscriptionPayload,
  type EventValuePredicate,
  type EventHandlerManifest,
} from "openxiangda-contracts";
import { createHmac } from 'node:crypto';
