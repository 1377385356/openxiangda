/** Code-owned policy. Automatic approval must never bypass application input. */
export interface WorkflowInitiatorApprovalNodeSource {
  kind: string;
  initiatorApprovalPolicy?: unknown;
  taskPageCode?: unknown;
  fieldPolicy?: { default?: string; fields?: Record<string, string> };
  operationPolicy?: { approve?: { commentRequired?: boolean } };
}
export type WorkflowInitiatorApprovalPages = Record<string, { fields?: unknown }>;

/** An immutable display page supplies no input, including locked owned rows. */
function readonlyFields(fields: unknown, depth = 0): boolean {
  if (!Array.isArray(fields) || fields.length > 64 || depth > 1) return false;
  return fields.every(field => {
    if (!field || typeof field !== 'object' || Array.isArray(field) || field.readonlyWhen !== undefined) return false;
    if (field.subtable !== undefined) {
      const table = field.subtable;
      return table && table.create === false && table.delete === false && table.reorder === false && readonlyFields(table.fields, depth + 1);
    }
    return field.readonly === true;
  });
}

export function validateWorkflowInitiatorApprovalPolicy(definition: {
  nodes?: Record<string, WorkflowInitiatorApprovalNodeSource>;
  taskPages?: WorkflowInitiatorApprovalPages;
}): string[] {
  const errors: string[] = [];
  for (const [id, node] of Object.entries(definition?.nodes || {})) {
    if (node.initiatorApprovalPolicy === undefined) continue;
    if (node.kind !== 'approval' || !['manual', 'auto_approve'].includes(node.initiatorApprovalPolicy as string)) {
      errors.push(`WORKFLOW_INITIATOR_APPROVAL_POLICY_INVALID:${id}`);
      continue;
    }
    if (node.initiatorApprovalPolicy !== 'auto_approve') continue;
    if (node.taskPageCode !== undefined &&
      (typeof node.taskPageCode !== 'string' || !readonlyFields(definition.taskPages?.[node.taskPageCode]?.fields)) ||
      [node.fieldPolicy?.default, ...Object.values(node.fieldPolicy?.fields || {})].some(value => value === 'edit' || value === 'edit_required')) {
      errors.push(`WORKFLOW_INITIATOR_APPROVAL_INPUT_REQUIRED:${id}`);
    }
    if (node.operationPolicy?.approve?.commentRequired === true) {
      errors.push(`WORKFLOW_INITIATOR_APPROVAL_COMMENT_REQUIRED:${id}`);
    }
  }
  return errors;
}

/** Requires a current, direct resolution seat; replacement and delegated seats stay manual. */
export function workflowInitiatorApprovalCanComplete(node: WorkflowInitiatorApprovalNodeSource, taskKind: string | undefined,
  initiatorUserId: string, participant: {
    user_id?: string; status?: string; participant_kind?: string; source?: string;
    source_participant_id?: string | null; delegate_authorization_id?: string | null;
  }, taskPages?: WorkflowInitiatorApprovalPages): boolean {
  return node.kind === 'approval' && node.initiatorApprovalPolicy === 'auto_approve' &&
    validateWorkflowInitiatorApprovalPolicy({ nodes: { node }, ...(taskPages ? { taskPages } : {}) }).length === 0 && taskKind !== 'return_review' &&
    !!initiatorUserId && participant.user_id === initiatorUserId && participant.status === 'active' &&
    participant.participant_kind === 'primary' && ['resolution', 'resolution_retry'].includes(participant.source || '') &&
    !participant.source_participant_id && !participant.delegate_authorization_id;
}
