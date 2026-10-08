/** Shared by source compilation, activation and transactional execution. */
export const WORKFLOW_AUTOMATIC_CC_DEFAULT_RECIPIENTS = 20;
export const WORKFLOW_AUTOMATIC_CC_MAX_RECIPIENTS = 200;
export const WORKFLOW_AUTOMATIC_CC_PROVIDERS = [
  'fixed_users', 'initiator', 'input_users', 'form_field_users',
  'app_role', 'app_role_in_scope', 'previous_node_actor',
] as const;

type Definition = { nodes?: Record<string, { kind: string; [key: string]: any }> };
type Binding = { bindings?: Record<string, { provider: string; min?: number; max?: number; users?: string[] }> };

export function validateWorkflowAutomaticCc(definition: Definition, binding?: Binding): string[] {
  const errors: string[] = [];
  for (const [id, node] of Object.entries(definition?.nodes || {})) {
    if (node?.kind !== 'cc') continue;
    if (Object.keys(node).some(key => !['id', 'kind', 'title', 'binding', 'next', 'emptyPolicy', 'notify', 'administration'].includes(key)) ||
        typeof node.title !== 'string' || !node.title.trim() || node.title.length > 255 ||
        typeof node.binding !== 'string' || !node.binding.trim() || node.binding.length > 255 ||
        typeof node.next !== 'string' || !node.next.trim() || !definition.nodes?.[node.next] ||
        !['block', 'skip'].includes(node.emptyPolicy) || node.notify !== undefined && typeof node.notify !== 'boolean') {
      errors.push(`WORKFLOW_CC_NODE_INVALID:${id}`);
    }
    if (!binding) continue;
    const entry = binding.bindings?.[node.binding];
    if (!entry) { errors.push(`WORKFLOW_CC_BINDING_NOT_FOUND:${id}`); continue; }
    if (!WORKFLOW_AUTOMATIC_CC_PROVIDERS.includes(entry.provider as any)) errors.push(`WORKFLOW_CC_PROVIDER_INVALID:${id}`);
    const minimum = entry.min ?? 1, maximum = entry.max ?? WORKFLOW_AUTOMATIC_CC_DEFAULT_RECIPIENTS;
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 1 || maximum < minimum || maximum > WORKFLOW_AUTOMATIC_CC_MAX_RECIPIENTS ||
        entry.provider === 'fixed_users' && (!Array.isArray(entry.users) || !entry.users.length || entry.users.length > maximum)) {
      errors.push(`WORKFLOW_CC_RECIPIENT_LIMIT_INVALID:${id}`);
    }
  }
  return [...new Set(errors)];
}
