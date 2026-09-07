import {
  SCHEMA_VERSIONS,
  WORKFLOW_SUMMARY_MAX_FIELDS,
  sha256Digest,
  type WorkflowApprovalMode,
  type WorkflowBinding,
  type WorkflowDelegation,
  type WorkflowDefinition,
  type WorkflowExpression,
  type WorkflowNode,
} from 'openxiangda-contracts';
import { Ajv2020 } from 'ajv/dist/2020.js';

export const expr = {
  literal: (value: unknown): WorkflowExpression => ({ op: 'literal', value }),
  path: (path: string): WorkflowExpression => ({ op: 'path', path }),
  eq: (left: WorkflowExpression, right: WorkflowExpression): WorkflowExpression => ({
    op: 'eq',
    left,
    right,
  }),
  neq: (left: WorkflowExpression, right: WorkflowExpression): WorkflowExpression => ({
    op: 'neq',
    left,
    right,
  }),
  gt: (left: WorkflowExpression, right: WorkflowExpression): WorkflowExpression => ({
    op: 'gt',
    left,
    right,
  }),
  gte: (left: WorkflowExpression, right: WorkflowExpression): WorkflowExpression => ({
    op: 'gte',
    left,
    right,
  }),
  lt: (left: WorkflowExpression, right: WorkflowExpression): WorkflowExpression => ({
    op: 'lt',
    left,
    right,
  }),
  lte: (left: WorkflowExpression, right: WorkflowExpression): WorkflowExpression => ({
    op: 'lte',
    left,
    right,
  }),
  and: (...values: WorkflowExpression[]): WorkflowExpression => ({ op: 'and', values }),
  or: (...values: WorkflowExpression[]): WorkflowExpression => ({ op: 'or', values }),
  not: (value: WorkflowExpression): WorkflowExpression => ({ op: 'not', value }),
  exists: (value: WorkflowExpression): WorkflowExpression => ({ op: 'exists', value }),
};

export class WorkflowCompilationError extends Error {
  readonly code = 'OPENXIANGDA_WORKFLOW_INVALID';

  constructor(readonly diagnostics: string[]) {
    super(diagnostics.join('; '));
    this.name = 'WorkflowCompilationError';
  }
}

const WORKFLOW_SUMMARY_FIELD_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;

/** Normalize source declarations without changing the workflow identity model. */
export function normalizeWorkflowDefinition(
  definition: WorkflowDefinition,
): WorkflowDefinition {
  const subject = definition?.subject;
  if (!subject || typeof subject !== 'object') return definition;
  return {
    ...definition,
    subject: {
      ...subject,
      summaryFields:
        Array.isArray(subject.summaryFields)
          ? [...subject.summaryFields]
          : subject.summaryFields === undefined
            ? []
            : subject.summaryFields,
    },
  };
}

export function defineWorkflow(definition: WorkflowDefinition): WorkflowDefinition {
  return Object.freeze(normalizeWorkflowDefinition(definition));
}

export function defineWorkflowBinding(binding: WorkflowBinding): WorkflowBinding {
  return Object.freeze(binding);
}

export function compileWorkflow(
  definition: WorkflowDefinition,
  binding: WorkflowBinding
) {
  const normalizedDefinition = normalizeWorkflowDefinition(definition);
  const diagnostics = [
    ...validateWorkflowDefinition(normalizedDefinition),
    ...validateWorkflowBinding(normalizedDefinition, binding),
  ];
  if (diagnostics.length) throw new WorkflowCompilationError(diagnostics);
  return {
    definition: normalizedDefinition,
    binding,
    definitionDigest: sha256Digest(normalizedDefinition),
    bindingDigest: sha256Digest(binding),
  };
}

export function validateWorkflowDefinition(definition: WorkflowDefinition) {
  const diagnostics: string[] = [];
  if (definition?.schemaVersion !== SCHEMA_VERSIONS.workflowDefinition) {
    diagnostics.push('WORKFLOW_DEFINITION_SCHEMA_INVALID');
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(definition?.code || '')) {
    diagnostics.push('WORKFLOW_CODE_INVALID');
  }
  if (
    !['finish-pinned', 'cancel-on-deactivate'].includes(
      definition?.acceptedCommandDeactivationPolicy || ''
    )
  ) {
    diagnostics.push('WORKFLOW_COMMAND_DEACTIVATION_POLICY_INVALID');
  }
  const subject = definition?.subject;
  const summaryFields = subject?.summaryFields;
  if (summaryFields !== undefined) {
    if (!Array.isArray(summaryFields)) {
      diagnostics.push('WORKFLOW_SUMMARY_FIELDS_INVALID');
    } else {
      if (summaryFields.length > WORKFLOW_SUMMARY_MAX_FIELDS) {
        diagnostics.push('WORKFLOW_SUMMARY_FIELDS_LIMIT_EXCEEDED');
      }
      if (new Set(summaryFields).size !== summaryFields.length) {
        diagnostics.push('WORKFLOW_SUMMARY_FIELDS_DUPLICATE');
      }
      if (
        summaryFields.some(
          field =>
            typeof field !== 'string' ||
            !WORKFLOW_SUMMARY_FIELD_CODE_PATTERN.test(field) ||
            field.trim() !== field
        )
      ) {
        diagnostics.push('WORKFLOW_SUMMARY_FIELDS_INVALID');
      }
    }
  }
  const inputSchema = definition?.inputSchema;
  if (
    !inputSchema ||
    inputSchema.type !== 'object' ||
    inputSchema.additionalProperties !== false
  ) {
    diagnostics.push('WORKFLOW_INPUT_SCHEMA_ROOT_NOT_CLOSED');
  } else {
    try {
      new Ajv2020({ strict: false, validateFormats: false }).compile(inputSchema);
    } catch {
      diagnostics.push('WORKFLOW_INPUT_SCHEMA_INVALID');
    }
  }
  const nodes = definition?.nodes || {};
  if (!nodes[definition?.startAt]) diagnostics.push('WORKFLOW_START_NODE_NOT_FOUND');
  for (const [id, node] of Object.entries(nodes)) {
    if (node.id !== id) diagnostics.push(`WORKFLOW_NODE_ID_MISMATCH:${id}`);
    if (!['approval', 'condition', 'end'].includes(node.kind)) {
      diagnostics.push(`WORKFLOW_NODE_KIND_INVALID:${id}`);
      continue;
    }
    for (const target of targets(node)) {
      if (!nodes[target]) diagnostics.push(`WORKFLOW_TARGET_NOT_FOUND:${id}:${target}`);
    }
    if (node.kind === 'approval' && !['single', 'any', 'all', 'sequence'].includes(node.mode)) {
      diagnostics.push(`WORKFLOW_APPROVAL_MODE_INVALID:${id}`);
    }
    if (node.kind === 'condition' && !node.branches.length) {
      diagnostics.push(`WORKFLOW_CONDITION_BRANCH_REQUIRED:${id}`);
    }
  }
  if (nodes[definition?.startAt]) {
    const reachable = new Set<string>();
    const visiting = new Set<string>();
    walk(definition.startAt, nodes, reachable, visiting, diagnostics);
    for (const id of Object.keys(nodes)) {
      if (!reachable.has(id)) diagnostics.push(`WORKFLOW_NODE_UNREACHABLE:${id}`);
    }
  }
  return [...new Set(diagnostics)];
}

export function validateWorkflowBinding(
  definition: WorkflowDefinition,
  binding: WorkflowBinding
) {
  const diagnostics: string[] = [];
  if (binding?.schemaVersion !== SCHEMA_VERSIONS.workflowBinding) {
    diagnostics.push('WORKFLOW_BINDING_SCHEMA_INVALID');
  }
  if (binding?.workflowCode !== definition?.code) {
    diagnostics.push('WORKFLOW_BINDING_CODE_MISMATCH');
  }
  for (const [code, entry] of Object.entries(binding?.bindings || {})) {
    const minimum = entry.min === undefined ? 1 : entry.min;
    const maximum = entry.max === undefined ? 200 : entry.max;
    if (
      !Number.isSafeInteger(minimum) ||
      !Number.isSafeInteger(maximum) ||
      minimum < 1 ||
      maximum < minimum ||
      maximum > 200
    ) {
      diagnostics.push(`WORKFLOW_BINDING_CANDIDATE_LIMIT_INVALID:${code}`);
    }
  }
  for (const node of Object.values(definition?.nodes || {})) {
    if (node.kind !== 'approval') continue;
    const entry = binding?.bindings?.[node.binding];
    if (!entry) {
      diagnostics.push(`WORKFLOW_BINDING_NOT_FOUND:${node.binding}`);
      continue;
    }
    if (
      ['input_users', 'form_field_users'].includes(entry.provider) &&
      !entry.inputPath
    ) {
      diagnostics.push(`WORKFLOW_BINDING_INPUT_PATH_REQUIRED:${node.binding}`);
    }
    if (
      ['app_role', 'app_role_in_scope', 'initiator_select'].includes(
        entry.provider
      ) &&
      !entry.roleCode
    ) {
      diagnostics.push(`WORKFLOW_BINDING_ROLE_REQUIRED:${node.binding}`);
    }
    if (entry.provider === 'department_supervisor' && !entry.departmentIdFrom) {
      diagnostics.push(
        `WORKFLOW_BINDING_DEPARTMENT_PATH_REQUIRED:${node.binding}`
      );
    }
    if (entry.provider === 'application_provider' && !entry.providerCode) {
      diagnostics.push(`WORKFLOW_BINDING_PROVIDER_CODE_REQUIRED:${node.binding}`);
    }
  }
  return [...new Set(diagnostics)];
}

export interface WorkflowPlan {
  steps: Array<{
    nodeId: string;
    kind: WorkflowNode['kind'];
    result?: Record<string, unknown>;
  }>;
  activeNode?: Extract<WorkflowNode, { kind: 'approval' }>;
  outcome?: string;
}

export function planWorkflow(
  definition: WorkflowDefinition,
  facts: Record<string, unknown>,
  startAt = definition.startAt
): WorkflowPlan {
  const diagnostics = validateWorkflowDefinition(definition);
  if (diagnostics.length) throw new WorkflowCompilationError(diagnostics);
  const steps: WorkflowPlan['steps'] = [];
  let nodeId = startAt;
  for (let count = 0; count <= 200; count += 1) {
    const node = definition.nodes[nodeId];
    if (!node) throw new WorkflowCompilationError([`WORKFLOW_NODE_NOT_FOUND:${nodeId}`]);
    if (node.kind === 'approval') {
      steps.push({ nodeId, kind: node.kind });
      return { steps, activeNode: node };
    }
    if (node.kind === 'end') {
      steps.push({ nodeId, kind: node.kind, result: { outcome: node.outcome } });
      return { steps, outcome: node.outcome };
    }
    const matchedBranch = node.branches.findIndex(branch =>
      Boolean(evaluateExpression(branch.when, facts))
    );
    const target = matchedBranch >= 0 ? node.branches[matchedBranch]!.target : node.otherwise;
    steps.push({ nodeId, kind: node.kind, result: { matchedBranch, target } });
    nodeId = target;
  }
  throw new WorkflowCompilationError(['WORKFLOW_TRANSITION_LIMIT_EXCEEDED']);
}

export function evaluateExpression(
  expression: WorkflowExpression,
  facts: Record<string, unknown>
): unknown {
  switch (expression.op) {
    case 'literal':
      return expression.value;
    case 'path':
      return readPath(facts, expression.path);
    case 'eq':
      return evaluateExpression(expression.left, facts) === evaluateExpression(expression.right, facts);
    case 'neq':
      return evaluateExpression(expression.left, facts) !== evaluateExpression(expression.right, facts);
    case 'gt':
      return compare(expression, facts) > 0;
    case 'gte':
      return compare(expression, facts) >= 0;
    case 'lt':
      return compare(expression, facts) < 0;
    case 'lte':
      return compare(expression, facts) <= 0;
    case 'in': {
      const right = evaluateExpression(expression.right, facts);
      return Array.isArray(right) && right.includes(evaluateExpression(expression.left, facts));
    }
    case 'contains': {
      const left = evaluateExpression(expression.left, facts);
      const right = evaluateExpression(expression.right, facts);
      return Array.isArray(left)
        ? left.includes(right)
        : typeof left === 'string' && left.includes(String(right));
    }
    case 'and':
      return expression.values.every(value => Boolean(evaluateExpression(value, facts)));
    case 'or':
      return expression.values.some(value => Boolean(evaluateExpression(value, facts)));
    case 'not':
      return !evaluateExpression(expression.value, facts);
    case 'exists': {
      const value = evaluateExpression(expression.value, facts);
      return value !== undefined && value !== null;
    }
  }
}

export interface ApprovalParticipantState {
  id: string;
  status: 'pending' | 'active' | 'approved' | 'rejected' | 'cancelled';
  required?: boolean;
  kind?: 'primary' | 'add_sign' | 'transfer' | 'delegate';
}

export function insertApprovalParticipant<T extends ApprovalParticipantState>(input: {
  participants: T[];
  relativeToId: string;
  participant: T;
  position: 'before' | 'after';
}) {
  const participants = input.participants.map(participant => ({ ...participant }));
  if (participants.some(participant => participant.id === input.participant.id)) {
    throw new WorkflowCompilationError(['WORKFLOW_PARTICIPANT_DUPLICATE']);
  }
  const relativeIndex = participants.findIndex(participant => participant.id === input.relativeToId);
  const relative = participants[relativeIndex];
  if (!relative || relative.status !== 'active') {
    throw new WorkflowCompilationError(['WORKFLOW_PARTICIPANT_NOT_ACTIVE']);
  }
  const participant = { ...input.participant };
  if (input.position === 'before') {
    relative.status = 'pending';
    participant.status = 'active';
    participants.splice(relativeIndex, 0, participant);
  } else {
    participant.status = 'pending';
    let insertAt = relativeIndex + 1;
    while (
      insertAt < participants.length &&
      participants[insertAt]?.status === 'pending'
    ) {
      insertAt += 1;
    }
    participants.splice(insertAt, 0, participant);
  }
  return participants;
}

export function replaceApprovalParticipant<T extends ApprovalParticipantState>(input: {
  participants: T[];
  participantId: string;
  replacement: T;
}) {
  const participants = input.participants.map(participant => ({ ...participant }));
  if (participants.some(participant => participant.id === input.replacement.id)) {
    throw new WorkflowCompilationError(['WORKFLOW_PARTICIPANT_DUPLICATE']);
  }
  const participantIndex = participants.findIndex(participant => participant.id === input.participantId);
  const participant = participants[participantIndex];
  if (!participant || participant.status !== 'active') {
    throw new WorkflowCompilationError(['WORKFLOW_PARTICIPANT_NOT_ACTIVE']);
  }
  participant.status = 'cancelled';
  participant.required = false;
  participants.splice(participantIndex + 1, 0, {
    ...input.replacement,
    status: 'active',
  });
  return participants;
}

export function planApprovalDecision<T extends ApprovalParticipantState>(input: {
  mode: WorkflowApprovalMode;
  participants: T[];
  participantId: string;
  decision: 'approved' | 'rejected';
}) {
  const participants = input.participants.map(participant => ({ ...participant }));
  const actor = participants.find(participant => participant.id === input.participantId);
  if (!actor || actor.status !== 'active') {
    throw new WorkflowCompilationError(['WORKFLOW_PARTICIPANT_NOT_ACTIVE']);
  }
  actor.status = input.decision;
  if (input.decision === 'rejected') {
    return { participants, completed: false, rejected: true, nextParticipantId: null };
  }
  const required = participants.filter(participant => participant.required !== false);
  let completed = false;
  let nextParticipantId: string | null = null;
  const hasAnotherActiveParticipant = required.some(
    participant => participant.status === 'active'
  );
  const pendingRequiredParticipant = required.find(
    participant => participant.status === 'pending'
  );
  const hasExplicitAddSignSequence =
    actor.kind === 'add_sign' || pendingRequiredParticipant?.kind === 'add_sign';
  if (
    !hasAnotherActiveParticipant &&
    pendingRequiredParticipant &&
    hasExplicitAddSignSequence
  ) {
    pendingRequiredParticipant.status = 'active';
    nextParticipantId = pendingRequiredParticipant.id;
  } else if (input.mode === 'single' || input.mode === 'any') {
    completed = true;
  } else {
    completed = required.every(participant => participant.status === 'approved');
    if (!completed && input.mode === 'sequence') {
      const next = required.find(participant => participant.status === 'pending');
      if (next) {
        next.status = 'active';
        nextParticipantId = next.id;
      }
    }
  }
  return { participants, completed, rejected: false, nextParticipantId };
}

type DelegationWindow = Pick<
  WorkflowDelegation,
  | 'id'
  | 'workflowCode'
  | 'delegatorRoleSubjectKey'
  | 'validFrom'
  | 'validTo'
  | 'status'
  | 'createdAt'
>;

export function workflowDelegationWindowsOverlap(
  left: Pick<DelegationWindow, 'workflowCode' | 'validFrom' | 'validTo'>,
  right: Pick<DelegationWindow, 'workflowCode' | 'validFrom' | 'validTo'>
) {
  const workflowOverlaps =
    left.workflowCode === null ||
    right.workflowCode === null ||
    left.workflowCode === right.workflowCode;
  return workflowOverlaps && left.validFrom < right.validTo && right.validFrom < left.validTo;
}

export function selectWorkflowDelegation<T extends DelegationWindow>(input: {
  delegations: T[];
  workflowCode: string;
  delegatorRoleSubjectKey: string;
  at: string;
}) {
  const matches = input.delegations.filter(delegation =>
    delegation.status === 'active' &&
    delegation.delegatorRoleSubjectKey === input.delegatorRoleSubjectKey &&
    (delegation.workflowCode === null || delegation.workflowCode === input.workflowCode) &&
    delegation.createdAt <= input.at &&
    delegation.validFrom <= input.at &&
    input.at < delegation.validTo
  );
  if (matches.length > 1) {
    throw new WorkflowCompilationError(['WORKFLOW_DELEGATION_AMBIGUOUS']);
  }
  return matches[0] || null;
}

function compare(
  expression: Extract<WorkflowExpression, { left: WorkflowExpression }>,
  facts: Record<string, unknown>
) {
  const left = evaluateExpression(expression.left, facts) as never;
  const right = evaluateExpression(expression.right, facts) as never;
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function readPath(facts: Record<string, unknown>, path: string) {
  if (!/^[A-Za-z][A-Za-z0-9_.]{0,254}$/.test(path)) {
    throw new WorkflowCompilationError(['WORKFLOW_EXPRESSION_PATH_INVALID']);
  }
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[key];
  }, facts);
}

function targets(node: WorkflowNode) {
  if (node.kind === 'approval') return [node.onApprove, node.onReject];
  if (node.kind === 'condition') {
    return [...node.branches.map(branch => branch.target), node.otherwise];
  }
  return [];
}

function walk(
  nodeId: string,
  nodes: WorkflowDefinition['nodes'],
  reachable: Set<string>,
  visiting: Set<string>,
  diagnostics: string[]
) {
  if (visiting.has(nodeId)) {
    diagnostics.push(`WORKFLOW_CYCLE_NOT_SUPPORTED:${nodeId}`);
    return;
  }
  if (reachable.has(nodeId)) return;
  const node = nodes[nodeId];
  if (!node) return;
  reachable.add(nodeId);
  if (node.kind === 'end') return;
  visiting.add(nodeId);
  for (const target of targets(node)) walk(target, nodes, reachable, visiting, diagnostics);
  visiting.delete(nodeId);
}
