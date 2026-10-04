/** Admission only: actual node entry always resolves participants again. */
export interface WorkflowLaunchPreflight {
  requiredApprovalNodes: string[];
}

export const WORKFLOW_LAUNCH_PREFLIGHT_PROVIDERS = ['fixed_users', 'initiator', 'app_role', 'app_role_in_scope'] as const;
type Definition = {
  launchPreflight?: unknown;
  nodes?: Record<string, { kind: string; binding?: string }>;
};
type Binding = { bindings: Record<string, { provider: string; candidateField?: string }> };
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Shared by declaration/target compilers, activation and effective runtime configuration. */
export function validateWorkflowLaunchPreflight(definition: Definition, binding?: Binding): string[] {
  const policy = definition?.launchPreflight;
  if (policy === undefined) return [];
  if (!record(policy) || Object.keys(policy).join(',') !== 'requiredApprovalNodes' ||
      !Array.isArray(policy.requiredApprovalNodes) || policy.requiredApprovalNodes.length < 1 ||
      policy.requiredApprovalNodes.length > 20 || new Set(policy.requiredApprovalNodes).size !== policy.requiredApprovalNodes.length ||
      policy.requiredApprovalNodes.some(id => typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(id))) {
    return ['WORKFLOW_LAUNCH_PREFLIGHT_INVALID'];
  }
  const errors: string[] = [];
  for (const id of policy.requiredApprovalNodes) {
    const node = definition.nodes?.[id];
    if (!node || node.kind !== 'approval') { errors.push(`WORKFLOW_LAUNCH_PREFLIGHT_NODE_INVALID:${id}`); continue; }
    if (!binding) continue;
    const entry = binding.bindings?.[node.binding || ''];
    if (!entry || !WORKFLOW_LAUNCH_PREFLIGHT_PROVIDERS.includes(entry.provider as any) || entry.candidateField !== undefined) {
      errors.push(`WORKFLOW_LAUNCH_PREFLIGHT_PROVIDER_UNSUPPORTED:${id}`);
    }
  }
  return errors;
}
