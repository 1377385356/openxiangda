import type { DataResourceSurface } from './surface.js';

export const WORKFLOW_DETAIL_MAX_FIELDS = 200 as const;
export const WORKFLOW_DETAIL_MAX_SUBTABLE_ROWS = 200 as const;
export const WORKFLOW_DETAIL_MAX_RECORD_PROPERTIES =
  WORKFLOW_DETAIL_MAX_FIELDS + 2;
export const WORKFLOW_DETAIL_ENVELOPE_MAX_BYTES = 2 * 1024 * 1024;

export type WorkflowBusinessDetailStatus =
  | 'ready'
  | 'stale'
  | 'missing'
  | 'forbidden'
  | 'unavailable';

export interface WorkflowBusinessSubtable {
  resourceCode: string;
  surface: DataResourceSurface;
  rows: Array<Record<string, unknown>>;
  total: number;
}

export interface WorkflowBusinessDetail {
  status: WorkflowBusinessDetailStatus;
  resourceCode: string | null;
  resourceName: string | null;
  recordId: string | null;
  requestedRevision: number | null;
  sourceRevision: number | null;
  surface: DataResourceSurface | null;
  record: Record<string, unknown>;
  subtables: Record<string, WorkflowBusinessSubtable>;
  projectionDigest: string | null;
  errorCode?: string;
}

export function workflowBusinessDetailUnavailable(): WorkflowBusinessDetail {
  return {
    status: 'unavailable',
    resourceCode: null,
    resourceName: null,
    recordId: null,
    requestedRevision: null,
    sourceRevision: null,
    surface: null,
    record: {},
    subtables: {},
    projectionDigest: null,
  };
}

export function normalizeWorkflowBusinessDetail(
  value: unknown,
): WorkflowBusinessDetail {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return workflowBusinessDetailUnavailable();
  }
  const candidate = value as Partial<WorkflowBusinessDetail>;
  if (
    !['ready', 'stale', 'missing', 'forbidden', 'unavailable'].includes(
      candidate.status || '',
    ) ||
    !candidate.record ||
    typeof candidate.record !== 'object' ||
    Array.isArray(candidate.record) ||
    Object.keys(candidate.record).length >
      WORKFLOW_DETAIL_MAX_RECORD_PROPERTIES ||
    !candidate.subtables ||
    typeof candidate.subtables !== 'object' ||
    Array.isArray(candidate.subtables) ||
    Object.keys(candidate.subtables).length > WORKFLOW_DETAIL_MAX_FIELDS ||
    !Object.values(candidate.subtables).every(
      (subtable) =>
        subtable &&
        typeof subtable === 'object' &&
        !Array.isArray(subtable) &&
        typeof subtable.resourceCode === 'string' &&
        subtable.resourceCode.length > 0 &&
        subtable.surface &&
        typeof subtable.surface === 'object' &&
        !Array.isArray(subtable.surface) &&
        Array.isArray(subtable.rows) &&
        subtable.rows.length <= WORKFLOW_DETAIL_MAX_SUBTABLE_ROWS &&
        subtable.rows.every(
          (row) =>
            row &&
            typeof row === 'object' &&
            !Array.isArray(row) &&
            Object.keys(row).length <=
              WORKFLOW_DETAIL_MAX_RECORD_PROPERTIES,
        ) &&
        Number.isSafeInteger(subtable.total) &&
        subtable.total >= 0 &&
        subtable.total <= WORKFLOW_DETAIL_MAX_SUBTABLE_ROWS,
    )
  ) {
    return workflowBusinessDetailUnavailable();
  }
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(candidate)).byteLength;
    if (bytes > WORKFLOW_DETAIL_ENVELOPE_MAX_BYTES) {
      return workflowBusinessDetailUnavailable();
    }
  } catch {
    return workflowBusinessDetailUnavailable();
  }
  return {
    ...workflowBusinessDetailUnavailable(),
    ...candidate,
    record: { ...candidate.record },
    subtables: { ...candidate.subtables },
  } as WorkflowBusinessDetail;
}
