import type { DataFieldType, WorkflowSurface } from './types.js';
import { normalizeWorkflowBusinessDetail } from './workflow-detail.js';

/** Maximum number of business fields carried by a workflow summary. */
export const WORKFLOW_SUMMARY_MAX_FIELDS = 16 as const;
/** UTF-8 byte limit for a long-text field in a workflow summary. */
export const WORKFLOW_SUMMARY_TEXT_LONG_MAX_BYTES = 2048 as const;
/** UTF-8 byte limit for the complete workflow businessData envelope. */
export const WORKFLOW_SUMMARY_ENVELOPE_MAX_BYTES = 8192 as const;

/** Field types that can be projected without expanding a related record. */
export const WORKFLOW_SUMMARY_ALLOWED_FIELD_TYPES = [
  'text.short',
  'text.long',
  'number.integer',
  'number.decimal',
  'boolean',
  'date',
  'time',
  'datetime',
  'option.single',
  'option.multiple',
  'cascade.single',
  'cascade.multiple',
  'user.single',
  'user.multiple',
  'department.single',
  'department.multiple',
  'resource-ref.single',
  'resource-ref.multiple',
  'uuid',
  'serial-number',
] as const satisfies readonly DataFieldType[];

export type WorkflowSummaryAllowedFieldType =
  (typeof WORKFLOW_SUMMARY_ALLOWED_FIELD_TYPES)[number];

export function isWorkflowSummaryFieldType(
  type: unknown,
): type is WorkflowSummaryAllowedFieldType {
  return (
    typeof type === 'string' &&
    (WORKFLOW_SUMMARY_ALLOWED_FIELD_TYPES as readonly string[]).includes(type)
  );
}

export type WorkflowBusinessDataStatus =
  | 'none'
  | 'fresh'
  | 'stale'
  | 'missing'
  | 'unavailable';

const WORKFLOW_SUMMARY_RESOURCE_CODE_PATTERN =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const WORKFLOW_SUMMARY_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const WORKFLOW_BUSINESS_DATA_KEYS = [
  'status',
  'resourceCode',
  'recordId',
  'requestedRevision',
  'sourceRevision',
  'fields',
  'projectionDigest',
] as const;
const WORKFLOW_BUSINESS_DATA_SORTED_KEYS = [
  ...WORKFLOW_BUSINESS_DATA_KEYS,
].sort();

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    const valid = value.every(item => isJsonValue(item, seen));
    seen.delete(value);
    return valid;
  }
  const prototype = Object.getPrototypeOf(value);
  const valid =
    (prototype === Object.prototype || prototype === null) &&
    Object.values(value).every(item => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

/** The only business projection exposed on a task/instance workflow Surface. */
export interface WorkflowBusinessData {
  status: WorkflowBusinessDataStatus;
  resourceCode: string | null;
  recordId: string | null;
  requestedRevision: number | null;
  sourceRevision: number | null;
  fields: Record<string, unknown>;
  projectionDigest: string | null;
}

export function workflowBusinessDataNone(): WorkflowBusinessData {
  return {
    status: 'none',
    resourceCode: null,
    recordId: null,
    requestedRevision: null,
    sourceRevision: null,
    fields: {},
    projectionDigest: null,
  };
}

export function workflowBusinessDataUnavailable(): WorkflowBusinessData {
  return { ...workflowBusinessDataNone(), status: 'unavailable' };
}

export function workflowSummaryUtf8ByteLength(value: unknown): number {
  let encoded: string;
  try {
    encoded = JSON.stringify(value) || '';
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  return new TextEncoder().encode(encoded).byteLength;
}

export function isWorkflowBusinessDataWithinLimit(value: unknown): boolean {
  return (
    workflowSummaryUtf8ByteLength(value) <= WORKFLOW_SUMMARY_ENVELOPE_MAX_BYTES
  );
}

/** Shared type guard for typed Surface consumers. */
export function isWorkflowBusinessData(
  value: unknown,
): value is WorkflowBusinessData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<WorkflowBusinessData>;
  const keys = Object.keys(candidate).sort();
  return (
    keys.length === WORKFLOW_BUSINESS_DATA_KEYS.length &&
    keys.every(
      (key, index) => key === WORKFLOW_BUSINESS_DATA_SORTED_KEYS[index],
    ) &&
    ['none', 'fresh', 'stale', 'missing', 'unavailable'].includes(
      candidate.status || '',
    ) &&
    (candidate.resourceCode === null ||
      (typeof candidate.resourceCode === 'string' &&
        WORKFLOW_SUMMARY_RESOURCE_CODE_PATTERN.test(candidate.resourceCode))) &&
    (candidate.recordId === null ||
      (typeof candidate.recordId === 'string' && candidate.recordId.length > 0)) &&
    (candidate.requestedRevision === null ||
      (typeof candidate.requestedRevision === 'number' &&
        Number.isSafeInteger(candidate.requestedRevision) &&
        candidate.requestedRevision >= 1)) &&
    (candidate.sourceRevision === null ||
      (typeof candidate.sourceRevision === 'number' &&
        Number.isSafeInteger(candidate.sourceRevision) &&
        candidate.sourceRevision >= 1)) &&
    !!candidate.fields &&
    typeof candidate.fields === 'object' &&
    !Array.isArray(candidate.fields) &&
    Object.keys(candidate.fields).length <= WORKFLOW_SUMMARY_MAX_FIELDS &&
    Object.values(candidate.fields).every(fieldValue => isJsonValue(fieldValue)) &&
    (candidate.projectionDigest === null ||
      (typeof candidate.projectionDigest === 'string' &&
        WORKFLOW_SUMMARY_DIGEST_PATTERN.test(candidate.projectionDigest)))
  );
}

/** Normalize older surfaces and fail closed for malformed/oversized envelopes. */
export function normalizeWorkflowBusinessData(
  value: unknown,
): WorkflowBusinessData {
  if (value === undefined) return workflowBusinessDataNone();
  if (!isWorkflowBusinessData(value) || !isWorkflowBusinessDataWithinLimit(value)) {
    return workflowBusinessDataUnavailable();
  }
  return {
    ...value,
    fields: { ...value.fields },
  };
}

/** Add the explicit empty envelope to older task/instance Surface payloads. */
export function normalizeWorkflowSurface(surface: WorkflowSurface): WorkflowSurface {
  if (!surface || typeof surface !== 'object') return surface;
  const rawPresentation = surface.presentation;
  const presentation =
    rawPresentation && typeof rawPresentation === 'object'
      ? rawPresentation
      : {};
  return {
    ...surface,
    presentation: {
      ...presentation,
      businessData: normalizeWorkflowBusinessData(
        (presentation as { businessData?: unknown }).businessData,
      ),
      businessDetail: normalizeWorkflowBusinessDetail(
        (presentation as { businessDetail?: unknown }).businessDetail,
      ),
      summary:
        (presentation as { summary?: WorkflowSurface['presentation']['summary'] })
          .summary || {
          title: '标准审批流程',
          initiatorDisplayName: '-',
          departmentDisplayName: null,
          submittedAt: new Date(0).toISOString(),
          businessNumber: null,
        },
    },
  };
}
