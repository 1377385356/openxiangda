/** Opt-in, fixed-definition dispatch; Workflow continues to own the decision. */
export type WorkflowBusinessCommand = 'approve' | 'reject' | 'withdraw' | 'resubmit';
export type WorkflowCommandHandlers = Partial<Record<WorkflowBusinessCommand, {
  operationCode: string;
  /** Opt-in approval routing remains owned by the Workflow kernel. */
  transitionPolicy?: 'workflow';
}>>;

type Definition = {
  code: string;
  subject?: { resourceCode: string };
  commandHandlers?: WorkflowCommandHandlers;
  nodes: Record<string, { kind: string; emptyPolicy?: string; initiatorApprovalPolicy?: string }>;
};
type Operation = {
  code: string;
  method: string;
  browser?: { exposure: string; behavior: string; idempotency: string; subject: { resourceCode: string; inputField: string }; fileIntent?: unknown };
  platformAccess?: { workflow?: { codes: readonly string[]; businessCommands?: readonly WorkflowBusinessCommand[] } };
};

export function validateWorkflowCommandHandlers(definition: Definition, operations?: readonly Operation[]): string[] {
  const handlers = definition.commandHandlers;
  if (handlers === undefined) return [];
  if (!handlers || typeof handlers !== 'object' || Array.isArray(handlers) || !Object.keys(handlers).length ||
      Object.keys(handlers).some(key => !['approve', 'reject', 'withdraw', 'resubmit'].includes(key))) return ['WORKFLOW_BUSINESS_COMMAND_HANDLERS_INVALID'];
  const errors: string[] = [];
  if (handlers.resubmit && !Object.values(definition.nodes || {}).some(node => node.kind === 'correction')) {
    errors.push('WORKFLOW_BUSINESS_CORRECTION_REQUIRED');
  }
  for (const [command, handler] of Object.entries(handlers)) {
    if (!handler || typeof handler !== 'object' || Array.isArray(handler) ||
        Object.keys(handler).some(key => !['operationCode', 'transitionPolicy'].includes(key)) ||
        (handler.transitionPolicy !== undefined && (command !== 'approve' || handler.transitionPolicy !== 'workflow')) ||
        !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(handler.operationCode || '')) {
      errors.push('WORKFLOW_BUSINESS_COMMAND_HANDLER_INVALID');
      continue;
    }
    if (!operations) continue;
    const operation = operations.find(item => item.code === handler.operationCode);
    if (!operation) { errors.push('WORKFLOW_BUSINESS_COMMAND_OPERATION_MISSING'); continue; }
    if (operation.method !== 'POST' || operation.browser?.exposure !== 'authenticated' ||
        operation.browser.behavior !== 'controlled' || operation.browser.idempotency !== 'required' || operation.browser.fileIntent ||
        operation.browser.subject?.resourceCode !== definition.subject?.resourceCode || operation.browser.subject?.inputField !== 'recordId' ||
        !operation.platformAccess?.workflow?.codes?.includes(definition.code) ||
        !operation.platformAccess.workflow.businessCommands?.includes(command as WorkflowBusinessCommand)) {
      errors.push('WORKFLOW_BUSINESS_COMMAND_OPERATION_INVALID');
    }
  }
  if (['approve', 'reject', 'withdraw'].some(command => Object.hasOwn(handlers, command)) &&
      Object.values(definition.nodes || {}).some(node => node.kind === 'approval' &&
      (node.emptyPolicy === 'skip' || node.initiatorApprovalPolicy === 'auto_approve'))) errors.push('WORKFLOW_BUSINESS_COMMAND_AUTOMATIC_DECISION_FORBIDDEN');
  return [...new Set(errors)];
}

/** Closed invocation passed by the shared browser client to a verified Named Action. */
export const workflowBusinessCommandInvocationSchema = {
  type: 'object', additionalProperties: false,
  required: ['workflowCode', 'target', 'recordId', 'expectedRevision', 'commandToken', 'idempotencyKey', 'input'],
  properties: {
    workflowCode: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,127}$' },
    target: {
      oneOf: [
        { type: 'object', additionalProperties: false, required: ['kind', 'id', 'command'], properties: {
          kind: { const: 'task' }, id: { type: 'string', format: 'uuid' }, command: { enum: ['approve', 'reject', 'resubmit'] },
        } },
        { type: 'object', additionalProperties: false, required: ['kind', 'id', 'command'], properties: {
          kind: { const: 'instance' }, id: { type: 'string', format: 'uuid' }, command: { const: 'withdraw' },
        } },
      ],
    },
    recordId: { type: 'string', format: 'uuid' },
    expectedRevision: { type: 'integer', minimum: 1 },
    commandToken: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
    idempotencyKey: { type: 'string', minLength: 1, maxLength: 128 },
    input: { type: 'object', maxProperties: 64 },
  },
} as const;
