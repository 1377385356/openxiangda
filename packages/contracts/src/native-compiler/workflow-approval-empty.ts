/** Only these sources can currently attest a genuine empty approval result. */
export const WORKFLOW_APPROVAL_EMPTY_PROVIDERS = [
  'fixed_users', 'input_users', 'form_field_users', 'app_role', 'app_role_in_scope',
] as const;

type Node = { kind: string; emptyPolicy?: unknown; binding?: string };
type Definition = { nodes?: Record<string, Node> };
type Binding = { bindings?: Record<string, { provider: string }> };

export function validateWorkflowApprovalEmptyPolicy(definition: Definition, binding?: Binding): string[] {
  const errors: string[] = [];
  for (const [id, node] of Object.entries(definition?.nodes || {})) {
    if (node.kind === 'cc' || node.emptyPolicy === undefined) continue;
    if (node.kind !== 'approval' || !['block', 'skip'].includes(node.emptyPolicy as string)) {
      errors.push(`WORKFLOW_APPROVAL_EMPTY_POLICY_INVALID:${id}`);
    } else if (node.emptyPolicy === 'skip' && binding &&
      !WORKFLOW_APPROVAL_EMPTY_PROVIDERS.includes(binding.bindings?.[node.binding || '']?.provider as any)) {
      errors.push(`WORKFLOW_APPROVAL_EMPTY_PROVIDER_UNSUPPORTED:${id}`);
    }
  }
  return errors;
}

/** An empty selection alone is never evidence that an approval may be skipped. */
export function workflowApprovalCanSkip(node: Node, resolution: {
  provider: string;
  emptyResult?: 'no_candidates';
  candidates: unknown[];
  selected: unknown[];
  warnings: unknown[];
} | undefined): boolean {
  return node.kind === 'approval' && node.emptyPolicy === 'skip' &&
    resolution?.emptyResult === 'no_candidates' &&
    WORKFLOW_APPROVAL_EMPTY_PROVIDERS.includes(resolution.provider as any) &&
    Array.isArray(resolution.candidates) && resolution.candidates.length === 0 &&
    Array.isArray(resolution.selected) && resolution.selected.length === 0 &&
    Array.isArray(resolution.warnings) && resolution.warnings.length === 0;
}

/** Empty fixed lists must be explicit and used exclusively by skipping approval nodes. */
export function workflowBindingAllowsEmptyUsers(definition: Definition, bindingCode: string): boolean {
  const consumers = Object.values(definition.nodes || {}).filter(node => node.binding === bindingCode);
  return consumers.length > 0 && consumers.every(node => node.kind === 'approval' && node.emptyPolicy === 'skip');
}
