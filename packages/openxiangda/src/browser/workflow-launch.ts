import {
  SCHEMA_VERSIONS,
  type BusinessProcessCommand,
  type DataFieldSurface,
  type SubjectProfile,
  type WorkflowNamedOperationLaunchIntent,
} from 'openxiangda-contracts/browser';

export function workflowContextScalarValue(
  field: Pick<DataFieldSurface, 'type' | 'options'>,
  value: string,
): unknown {
  if (field.type === 'option.single') {
    const option = field.options?.find(item => item.value === value);
    if (!option) throw new Error('OPENXIANGDA_WORKFLOW_LAUNCH_CONTEXT_VALUE_INVALID');
    const { label, value: key, description, color } = option;
    return { label, value: key, ...(description ? { description } : {}), ...(color ? { color } : {}) };
  }
  if (field.type === 'number.integer' || field.type === 'number.decimal') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error('OPENXIANGDA_WORKFLOW_LAUNCH_CONTEXT_VALUE_INVALID');
    return parsed;
  }
  if (field.type === 'boolean') {
    if (!['true', 'false'].includes(value)) throw new Error('OPENXIANGDA_WORKFLOW_LAUNCH_CONTEXT_VALUE_INVALID');
    return value === 'true';
  }
  return value;
}

export interface WorkflowNamedOperationSubjectInput {
  id: string;
  revision: number;
}

export interface WorkflowNamedOperationExpectedResult {
  appCode: string;
  environmentKey: string;
  workflowCode: string;
  resourceCode: string;
}

export type WorkflowNamedOperationResult =
  | {
      kind: 'workflow-command';
      subjectId: string;
      subjectRevision?: number;
      command: BusinessProcessCommand;
    }
  | {
      kind: 'completed-without-workflow';
      subjectId: string;
      subjectRevision?: number;
    };

function canonicalWorkflowLaunchJson(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return `[${value
      .map(item => canonicalWorkflowLaunchJson(item) ?? 'null')
      .join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .flatMap(key => {
        const serialized = canonicalWorkflowLaunchJson(record[key]);
        return serialized === undefined
          ? []
          : [`${JSON.stringify(key)}:${serialized}`];
      });
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Compares JSON launch-contract fragments structurally. Runtime Surfaces are
 * read through PostgreSQL jsonb, whose object-key order is not an application
 * contract; array order and every serialized value remain significant.
 */
export function workflowLaunchContractJsonEqual(
  left: unknown,
  right: unknown,
) {
  return (
    canonicalWorkflowLaunchJson(left) === canonicalWorkflowLaunchJson(right)
  );
}

function currentUserReference(profile: SubjectProfile) {
  return {
    value: profile.userId,
    label: profile.displayName || profile.userId,
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    ...(profile.jobNumber ? { employeeNo: profile.jobNumber } : {}),
    ...(profile.affiliatedDepartment
      ? {
          departments: [
            {
              value: profile.affiliatedDepartment.id,
              label: profile.affiliatedDepartment.name,
            },
          ],
        }
      : {}),
  };
}

/** Builds only the top-level request properties sealed by the launch intent. */
export function buildWorkflowNamedOperationInput(
  intent: WorkflowNamedOperationLaunchIntent,
  input: {
    values: Record<string, unknown>;
    idempotencyKey: string;
    requestedAt: string;
    subjectProfile: SubjectProfile;
    subject?: WorkflowNamedOperationSubjectInput;
  },
) {
  const result: Record<string, unknown> = {};
  for (const [inputCode, binding] of Object.entries(intent.inputs)) {
    let value: unknown;
    switch (binding.source) {
      case 'field':
        value = input.values[binding.fieldCode];
        break;
      case 'idempotency-key':
        value = input.idempotencyKey;
        break;
      case 'current-user-reference':
        value = currentUserReference(input.subjectProfile);
        break;
      case 'subject-id':
        value = input.subject?.id;
        break;
      case 'subject-revision':
        value = input.subject?.revision;
        break;
      case 'requested-at':
        value = input.requestedAt;
        break;
    }
    if (value !== undefined) result[inputCode] = value;
  }
  return result;
}

function positiveRevision(value: unknown) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : undefined;
}

/**
 * Verifies the application response before the standard page starts polling a
 * durable command. Missing/null processCommand is the explicit no-approval
 * outcome and never causes the browser to synthesize a Workflow.
 */
export function parseWorkflowNamedOperationResult(
  intent: WorkflowNamedOperationLaunchIntent,
  result: Record<string, unknown>,
  expected: WorkflowNamedOperationExpectedResult,
): WorkflowNamedOperationResult {
  const subjectId = String(result[intent.output.subjectId] || '').trim();
  if (!subjectId || subjectId.length > 500) {
    throw new Error('OPENXIANGDA_WORKFLOW_NAMED_OPERATION_SUBJECT_INVALID');
  }
  const subjectRevision = intent.output.subjectRevision
    ? positiveRevision(result[intent.output.subjectRevision])
    : undefined;
  if (intent.output.subjectRevision && !subjectRevision) {
    throw new Error('OPENXIANGDA_WORKFLOW_NAMED_OPERATION_REVISION_INVALID');
  }
  const rawCommand = intent.output.processCommand
    ? result[intent.output.processCommand]
    : undefined;
  if (rawCommand === undefined || rawCommand === null) {
    return {
      kind: 'completed-without-workflow',
      subjectId,
      ...(subjectRevision ? { subjectRevision } : {}),
    };
  }
  if (!rawCommand || typeof rawCommand !== 'object' || Array.isArray(rawCommand)) {
    throw new Error('OPENXIANGDA_WORKFLOW_NAMED_OPERATION_COMMAND_INVALID');
  }
  const command = rawCommand as BusinessProcessCommand;
  if (
    command.schemaVersion !== SCHEMA_VERSIONS.businessProcessCommand ||
    !String(command.id || '').trim() ||
    command.appCode !== expected.appCode ||
    command.environmentKey !== expected.environmentKey ||
    command.workflowCode !== expected.workflowCode ||
    command.operationCode !== intent.operationCode ||
    command.subject?.resourceCode !== expected.resourceCode ||
    command.subject?.id !== subjectId ||
    (subjectRevision !== undefined &&
      command.subject?.dataRevision !== subjectRevision)
  ) {
    throw new Error('OPENXIANGDA_WORKFLOW_NAMED_OPERATION_COMMAND_MISMATCH');
  }
  return {
    kind: 'workflow-command',
    subjectId,
    ...(subjectRevision ? { subjectRevision } : {}),
    command,
  };
}

/** 仅供已接受命令的状态读取；不用于提交、补充或显式重试命令。 */
export function processStatusReadRetryDelay(error: unknown, failures: number, elapsedMs: number): number | null {
  if (failures > 5 || elapsedMs >= 60_000) return null;
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  const networkFailure = error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError');
  if (!networkFailure && ![408, 429, 500, 502, 503, 504].includes(status)) return null;
  const delay = Math.min(500 * 2 ** (failures - 1), 5000);
  return elapsedMs + delay < 60_000 ? delay : null;
}
