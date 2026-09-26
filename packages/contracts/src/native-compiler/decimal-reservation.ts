import type { AppEventDecimalReservationDeclaration } from '../native.js';

export const DECIMAL_RESERVATION_EVENT_MODES = {
  'openxiangda.workflow.instance.completed.v2': 'commit',
  'openxiangda.workflow.instance.rejected.v2': 'release',
  'openxiangda.workflow.instance.withdrawn.v2': 'release',
} as const;

type Resource = { code: string; fields: readonly { code: string; type: string; options?: readonly { value: string }[] }[] };
type Reserve = { mode?: unknown; resourceCode?: unknown; statusFieldCode?: unknown };
export interface DecimalReservationEventDeclarationContext {
  eventTypes: readonly string[];
  execution?: unknown;
  resources: readonly Resource[];
  reservations: readonly Reserve[];
  workflows: readonly { code: string; resourceCode?: string }[];
}

/** Shared by application and platform compilers; never creates runtime authority. */
export function normalizeDecimalReservationEventDeclaration(
  value: unknown,
  context: DecimalReservationEventDeclarationContext
): AppEventDecimalReservationDeclaration {
  const fail = (): never => { throw new Error('NATIVE_EVENT_DECIMAL_RESERVATION_INVALID'); };
  const record = (input: unknown): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail();
    return input as Record<string, unknown>;
  };
  const input = record(value);
  if (Object.keys(input).some(key => !['resourceCode', 'workflowCode', 'outcomes'].includes(key)) ||
      typeof input.resourceCode !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(input.resourceCode) ||
      typeof input.workflowCode !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.workflowCode) ||
      context.execution !== undefined || !Array.isArray(input.outcomes) ||
      !input.outcomes.length || input.outcomes.length > 3) return fail();
  const resource = context.resources.find(item => item.code === input.resourceCode);
  const reservation = context.reservations.find(item => item.mode === 'reserve' && item.resourceCode === input.resourceCode);
  const workflow = context.workflows.find(item => item.code === input.workflowCode);
  if (!resource || !reservation || !workflow || workflow.resourceCode !== resource.code) return fail();
  const status = resource.fields.find(field => field.code === reservation.statusFieldCode);
  if (status?.type !== 'option.single') return fail();
  const allowed = new Set(status.options?.map(option => option.value));
  const seen = new Set<string>();
  const outcomes = input.outcomes.map(raw => {
    const outcome = record(raw);
    const eventType = outcome.eventType;
    if (Object.keys(outcome).some(key => !['eventType', 'mode', 'eligibleChildStatuses'].includes(key)) ||
        typeof eventType !== 'string' || !Object.prototype.hasOwnProperty.call(DECIMAL_RESERVATION_EVENT_MODES, eventType) ||
        !context.eventTypes.includes(eventType) || seen.has(eventType) ||
        outcome.mode !== DECIMAL_RESERVATION_EVENT_MODES[eventType as keyof typeof DECIMAL_RESERVATION_EVENT_MODES] ||
        !Array.isArray(outcome.eligibleChildStatuses) || !outcome.eligibleChildStatuses.length ||
        outcome.eligibleChildStatuses.length > 16 ||
        new Set(outcome.eligibleChildStatuses).size !== outcome.eligibleChildStatuses.length ||
        outcome.eligibleChildStatuses.some(value => typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value) || !allowed.has(value))) return fail();
    seen.add(eventType);
    return {
      eventType: eventType as keyof typeof DECIMAL_RESERVATION_EVENT_MODES,
      mode: outcome.mode as 'commit' | 'release',
      eligibleChildStatuses: [...outcome.eligibleChildStatuses as string[]].sort(),
    };
  }).sort((a, b) => a.eventType.localeCompare(b.eventType));
  return { resourceCode: input.resourceCode, workflowCode: input.workflowCode, outcomes };
}

/** Both compiler inputs use the canonical resource/workflow envelope here. */
export function decimalReservationEventContext(
  config: Record<string, any>,
  subscription: Record<string, any>
): DecimalReservationEventDeclarationContext {
  const list = (value: unknown): Record<string, any>[] => Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
  return {
    eventTypes: Array.isArray(subscription.eventTypes) ? subscription.eventTypes : [],
    execution: subscription.execution,
    resources: list(config.data?.resources).map(resource => ({
      code: resource.code, fields: list(resource.schema?.fields).map(field => ({
        code: field.code, type: field.type,
        options: list(field.options).map(option => ({ value: option.value })),
      })),
    })),
    reservations: list(config.backend?.operations).flatMap(operation =>
      operation.platformAccess?.decimalReservation ? [operation.platformAccess.decimalReservation] : []),
    workflows: list(config.workflows?.definitions).map(item => ({
      code: item.definition?.code, resourceCode: item.definition?.subject?.resourceCode,
    })),
  };
}
