export function validateWorkflowHandlingNodes(definition: { nodes?: Record<string, any> }): string[] {
  const errors: string[] = [];
  for (const [id, node] of Object.entries(definition?.nodes || {})) {
    if (node?.kind !== 'handle') {
      if (node?.allowedOperations?.includes('complete')) errors.push(`WORKFLOW_HANDLE_COMMAND_ONLY:${id}`);
      continue;
    }
    if (!node.next || !definition.nodes?.[node.next]) errors.push(`WORKFLOW_HANDLE_TARGET_MISSING:${id}`);
    if (['onApprove', 'onReject', 'initiatorApprovalPolicy', 'completionDeadline'].some(key => key in node) || node.emptyPolicy === 'skip') errors.push(`WORKFLOW_HANDLE_APPROVAL_POLICY_FORBIDDEN:${id}`);
    if (!Array.isArray(node.allowedOperations) || !node.allowedOperations.includes('complete') || node.allowedOperations.some((op: string) => !['complete', 'save_form', 'transfer', 'delegate', 'return'].includes(op))) errors.push(`WORKFLOW_HANDLE_OPERATIONS_INVALID:${id}`);
    if (!Array.isArray(node.requiredOperations) || !node.requiredOperations.includes('complete')) errors.push(`WORKFLOW_HANDLE_COMPLETE_REQUIRED:${id}`);
  }
  return errors;
}
