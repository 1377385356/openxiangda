import type { WorkflowOperationSurface, WorkflowSurface } from 'openxiangda-contracts/browser';

export interface WorkflowOperationStringSchema {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export function workflowOperationStringError(
  schema: WorkflowOperationStringSchema, value: unknown, required: boolean, label: string,
): string | null {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || (required && !value.trim())) return `请填写${label}，不能仅包含空格`;
  if (schema.minLength !== undefined && value.length < schema.minLength) return `${label}至少填写${schema.minLength}个字符`;
  if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${label}最多填写${schema.maxLength}个字符`;
  if (schema.pattern) {
    let pattern: RegExp;
    try { pattern = new RegExp(schema.pattern); }
    catch { return '操作表单配置无效，请刷新后重试'; }
    if (!pattern.test(value)) return schema.pattern === '\\S'
      ? `请填写${label}，不能仅包含空格` : `请核对${label}，内容不符合要求`;
  }
  return null;
}

export function workflowOperationSignature(operation: WorkflowOperationSurface): string {
  return JSON.stringify({
    key: operation.key, kind: operation.kind, label: operation.label,
    placement: operation.placement, group: operation.group, audience: operation.audience,
    emphasis: operation.emphasis, tone: operation.tone,
    visible: operation.visible, enabled: operation.enabled, disabledReason: operation.disabledReason,
    inputSchema: operation.inputSchema, uiSchema: operation.uiSchema,
    execute: operation.execute, refresh: operation.refresh,
  });
}

export function retainedWorkflowOperation(
  selected: { operation: WorkflowOperationSurface; operationSignature: string; surface: WorkflowSurface } | null,
  current: WorkflowSurface, operations: WorkflowOperationSurface[], afterRefusal: boolean,
): WorkflowOperationSurface | null {
  if (!selected) return null;
  const operation = operations.find(item => item.key === selected.operation.key &&
    item.visible && item.enabled && workflowOperationSignature(item) === selected.operationSignature);
  if (!operation) return null;
  if (selected.surface === current) return selected.operation;
  if (!afterRefusal || !selected.surface.instance?.id ||
    selected.surface.instance.id !== current.instance?.id ||
    selected.surface.instanceSequence !== current.instanceSequence ||
    selected.surface.task?.id !== current.task?.id ||
    selected.surface.task?.version !== current.task?.version) return null;
  // Preserve the Form's operation object and values, while a new explicit
  // confirmation uses the current Surface token. No request is resent here.
  return selected.operation;
}

export function workflowOperationInputFailure(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'WORKFLOW_V2_REASON_INVALID') return '请填写原因，不能仅包含空格，最多4000个字符。';
  if (code === 'WORKFLOW_V2_OPERATION_COMMENT_REQUIRED' || code === 'WORKFLOW_V2_REJECT_COMMENT_REQUIRED') {
    return '请填写审批意见，不能仅包含空格，最多4000个字符。';
  }
  if (code === 'WORKFLOW_V2_TRANSFER_SELF_FORBIDDEN') return '请选择其他人员接收任务，当前任务仍由你处理。';
  return null;
}
