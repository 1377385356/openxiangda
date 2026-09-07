import type { WorkflowInstanceCommandPolicies } from '../types.js';

type PolicyDefinition = {
  instanceCommands?: unknown;
  inputSchema?: unknown;
  subject?: unknown;
};

type PolicyContext = {
  appCode: string;
  capabilities: readonly string[];
  fields: ReadonlyMap<string, { type: string; nullable?: boolean }>;
};

function object(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

export function validateWorkflowInstanceCommandPolicies(
  definition: PolicyDefinition,
  context?: PolicyContext
): string[] {
  if (definition?.instanceCommands === undefined) return [];
  const policies = object(definition.instanceCommands);
  if (
    !policies ||
    !Object.keys(policies).length ||
    Object.keys(policies).some(
      (key) => !['withdraw', 'terminate'].includes(key)
    )
  ) {
    return ['WORKFLOW_INSTANCE_COMMAND_POLICIES_INVALID'];
  }
  const errors: string[] = [];
  for (const [command, raw] of Object.entries(policies)) {
    const policy = object(raw);
    const keys =
      command === 'withdraw' ? ['beforeFact'] : ['beforeFact', 'capability'];
    if (!policy || Object.keys(policy).some((key) => !keys.includes(key))) {
      errors.push(`WORKFLOW_INSTANCE_COMMAND_POLICY_INVALID:${command}`);
      continue;
    }
    if (command === 'terminate') {
      const capability = policy.capability;
      if (
        typeof capability !== 'string' ||
        capability.length > 255 ||
        !/^app:[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[A-Za-z0-9:._-]+$/.test(
          capability
        ) ||
        (context &&
          (!capability.startsWith(`app:${context.appCode}:`) ||
            !context.capabilities.includes(capability)))
      ) {
        errors.push('WORKFLOW_INSTANCE_TERMINATE_CAPABILITY_INVALID');
      }
    }
    if (command === 'withdraw' || policy.beforeFact !== undefined) {
      const fact = policy.beforeFact;
      const schema = object(definition.inputSchema);
      const property = object(object(schema?.properties)?.[fact]);
      const fieldCode = object(object(definition.subject)?.factProjection)?.[
        fact
      ];
      const field = context?.fields.get(fieldCode);
      if (
        typeof fact !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(fact) ||
        !Array.isArray(schema?.required) ||
        !schema.required.includes(fact) ||
        property?.type !== 'string' ||
        property?.format !== 'date-time' ||
        typeof fieldCode !== 'string' ||
        (context && (field?.type !== 'datetime' || field.nullable === true))
      ) {
        errors.push(
          `WORKFLOW_INSTANCE_COMMAND_DEADLINE_FACT_INVALID:${command}`
        );
      }
    }
  }
  return errors;
}

export function workflowInstanceTerminateCapabilityAllowed(
  policies: WorkflowInstanceCommandPolicies | undefined,
  capabilityCodes: readonly string[]
): boolean {
  const capability = policies?.terminate?.capability;
  return (
    typeof capability === 'string' &&
    /^app:[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[A-Za-z0-9:._-]+$/.test(capability) &&
    capabilityCodes.includes(capability)
  );
}

// Require an offset and reject calendar normalization such as February 30.
export function workflowPolicyTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value
    );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const zone = match[8]!;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > days ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    (zone !== 'Z' &&
      (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))
  )
    return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function workflowInstanceCommandDeadlineError(
  policies: WorkflowInstanceCommandPolicies | undefined,
  command: 'withdraw' | 'terminate',
  facts: unknown,
  databaseNow: Date | string
): string | null {
  const policy = policies?.[command];
  if (!policy || (command === 'terminate' && policy.beforeFact === undefined))
    return null;
  const beforeFact = policy.beforeFact;
  const values = object(facts);
  const deadline =
    beforeFact && values && Object.hasOwn(values, beforeFact)
      ? workflowPolicyTimestamp(values[beforeFact])
      : null;
  const now =
    databaseNow instanceof Date
      ? databaseNow.getTime()
      : workflowPolicyTimestamp(databaseNow);
  if (deadline === null || now === null || !Number.isFinite(now)) {
    return 'WORKFLOW_V2_CANCELLATION_DEADLINE_INVALID';
  }
  return now < deadline ? null : 'WORKFLOW_V2_CANCELLATION_DEADLINE_PASSED';
}
