/** Immutable application rule. An automatic completion never fabricates a human vote. */
export interface WorkflowCompletionDeadline {
  afterSeconds: number;
  action: 'approve';
}

export interface WorkflowCompletionDeadlineState {
  deadlineAt: string;
  action: 'approve';
  status: 'pending' | 'completed' | 'cancelled' | 'failed';
  attempts: number;
  lastErrorCode?: string;
}

type Node = {
  kind: string;
  completionDeadline?: unknown;
  allowedOperations?: readonly string[];
  taskPageCode?: string;
  fieldPolicy?: { default?: string; fields?: Record<string, string> };
  operationPolicy?: { approve?: { commentRequired?: boolean } };
};
type Definition = {
  nodes?: Record<string, Node>;
  taskPages?: Record<string, { fields: unknown[] }>;
  commandHandlers?: { approve?: unknown };
};

function requiresInput(fields: unknown, depth = 0): boolean {
  if (!Array.isArray(fields) || fields.length > 64 || depth > 1) return true;
  return fields.some(field => !field || typeof field !== 'object' || Array.isArray(field) ||
    field.required === true || field.requiredWhen !== undefined ||
    field.subtable !== undefined && (!field.subtable || requiresInput(field.subtable.fields, depth + 1)));
}

export function formatWorkflowCompletionDeadline(rule: WorkflowCompletionDeadline): string {
  const seconds = rule.afterSeconds;
  const duration = seconds % 86400 === 0 ? `${seconds / 86400} 天` : seconds % 3600 === 0 ? `${seconds / 3600} 小时` : seconds % 60 === 0 ? `${seconds / 60} 分钟` : `${seconds} 秒`;
  return `进入后 ${duration}未完成，自动同意`;
}

/** Conservatively disallow anything that an automatic decision cannot supply. */
export function validateWorkflowCompletionDeadlines(definition: Definition): string[] {
  const errors: string[] = [];
  for (const [id, node] of Object.entries(definition?.nodes || {})) {
    if (!node || typeof node !== 'object') continue;
    if (node.completionDeadline === undefined) continue;
    const rule = node.completionDeadline as Partial<WorkflowCompletionDeadline> | null;
    if (node.kind !== 'approval' || !rule || typeof rule !== 'object' || Array.isArray(rule) ||
      Object.keys(rule).length !== 2 || Object.keys(rule).some(key => !['afterSeconds', 'action'].includes(key)) ||
      rule.action !== 'approve' || !Number.isInteger(rule.afterSeconds) || rule.afterSeconds! < 1 || rule.afterSeconds! > 2_592_000) {
      errors.push(`WORKFLOW_COMPLETION_DEADLINE_INVALID:${id}`);
      continue;
    }
    if (node.allowedOperations && !node.allowedOperations.includes('approve')) {
      errors.push(`WORKFLOW_COMPLETION_DEADLINE_APPROVE_UNAVAILABLE:${id}`);
    }
    const page = node.taskPageCode ? definition.taskPages?.[node.taskPageCode] : undefined;
    if (node.taskPageCode && (!page || requiresInput(page.fields)) ||
      [node.fieldPolicy?.default, ...Object.values(node.fieldPolicy?.fields || {})].includes('edit_required') ||
      node.operationPolicy?.approve?.commentRequired === true || definition.commandHandlers?.approve !== undefined) {
      errors.push(`WORKFLOW_COMPLETION_DEADLINE_INPUT_REQUIRED:${id}`);
    }
  }
  return errors;
}
