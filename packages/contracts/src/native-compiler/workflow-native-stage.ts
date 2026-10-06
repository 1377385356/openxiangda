import type { DataTransactionGuard } from '../types.js';

/** Fixed, sealed operation precondition; it does not grant data or workflow permissions. */
export interface WorkflowNativeStagePolicy {
  workflowCode: string;
  resourceCode: string;
  actor: 'initiator' | 'reader';
  runningNodeIds: readonly string[];
  allowedStatuses: readonly ('approved' | 'rejected' | 'cancelled' | 'terminated' | 'returned')[];
}

/** Observed before external preparation, then checked under the Kernel instance lock. */
export interface WorkflowNativeStageGuard {
  instanceId: string;
  subjectRecordId: string;
  expectedInstanceSequence: number;
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const code = (value: unknown) => typeof value === 'string' && /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value) && value.length <= 100;
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
function fail(suffix: string): never { throw new Error(`OPENXIANGDA_WORKFLOW_STAGE_${suffix}`); }

export function assertWorkflowNativeStagePolicy(value: unknown): asserts value is WorkflowNativeStagePolicy {
  if (!object(value) || !exact(value, ['workflowCode', 'resourceCode', 'actor', 'runningNodeIds', 'allowedStatuses']) ||
    !code(value.workflowCode) || !code(value.resourceCode) || !['initiator', 'reader'].includes(String(value.actor)) ||
    !Array.isArray(value.runningNodeIds) || value.runningNodeIds.length > 32 || new Set(value.runningNodeIds).size !== value.runningNodeIds.length ||
    value.runningNodeIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) ||
    !Array.isArray(value.allowedStatuses) || value.allowedStatuses.length > 5 || new Set(value.allowedStatuses).size !== value.allowedStatuses.length ||
    value.allowedStatuses.some(status => !['approved', 'rejected', 'cancelled', 'terminated', 'returned'].includes(status)) ||
    value.runningNodeIds.length + value.allowedStatuses.length === 0) fail('POLICY_INVALID');
}

export function assertWorkflowNativeStageGuard(value: unknown): asserts value is WorkflowNativeStageGuard {
  if (!object(value) || !exact(value, ['instanceId', 'subjectRecordId', 'expectedInstanceSequence']) ||
    !uuid(value.instanceId) || !uuid(value.subjectRecordId) || !Number.isSafeInteger(value.expectedInstanceSequence) ||
    (value.expectedInstanceSequence as number) < 0) fail('GUARD_INVALID');
}

export function assertWorkflowNativeStageSourceGuard(policy: WorkflowNativeStagePolicy, stage: WorkflowNativeStageGuard,
  guards: readonly DataTransactionGuard[] | undefined): void {
  // Native owns visibility, the record lock and revision validation. Kernel cannot substitute for them.
  if (!guards?.some(guard => (guard.kind === 'record-match' || guard.kind === 'record-assert') &&
    guard.resourceCode === policy.resourceCode && guard.id.toLowerCase() === stage.subjectRecordId.toLowerCase() &&
    guard.assertions.some(assertion => assertion.kind === 'value' && assertion.field === 'revision' && assertion.operator === 'eq' &&
      Number.isSafeInteger(assertion.value) && Number(assertion.value) > 0))) fail('SOURCE_GUARD_REQUIRED');
}

export const workflowNativeStagePolicySchema = {
  type: 'object', additionalProperties: false,
  required: ['workflowCode', 'resourceCode', 'actor', 'runningNodeIds', 'allowedStatuses'],
  properties: {
    workflowCode: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$', maxLength: 100 },
    resourceCode: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$', maxLength: 100 },
    actor: { enum: ['initiator', 'reader'] },
    runningNodeIds: { type: 'array', maxItems: 32, uniqueItems: true, items: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' } },
    allowedStatuses: { type: 'array', maxItems: 5, uniqueItems: true, items: { enum: ['approved', 'rejected', 'cancelled', 'terminated', 'returned'] } },
  },
  anyOf: [{ properties: { runningNodeIds: { minItems: 1 } } }, { properties: { allowedStatuses: { minItems: 1 } } }],
} as const;
