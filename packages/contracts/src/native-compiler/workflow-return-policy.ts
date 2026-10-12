export type WorkflowReturnRoute = 'replay' | 'resume';
export interface WorkflowReturnTargetPolicy {
  nodeId: string;
  routes: WorkflowReturnRoute[];
  defaultRoute: WorkflowReturnRoute;
}
export interface WorkflowReturnPolicy { targets: WorkflowReturnTargetPolicy[] }

export function workflowReturnTargets(node: { returnPolicy?: WorkflowReturnPolicy; returnTargets?: readonly string[] }): string[] {
  if (node.returnPolicy) return Array.isArray(node.returnPolicy.targets) ? node.returnPolicy.targets.filter(target => typeof target?.nodeId === 'string').map(target => target.nodeId) : [];
  return Array.isArray(node.returnTargets) ? [...node.returnTargets] : [];
}
export function workflowReturnTargetPolicy(definition: { nodes: Record<string, any> }, node: any, targetId: string): WorkflowReturnTargetPolicy | undefined {
  if (node.returnPolicy) return Array.isArray(node.returnPolicy.targets) ? node.returnPolicy.targets.find((target: WorkflowReturnTargetPolicy) => target.nodeId === targetId) : undefined;
  if (!node.returnTargets?.includes(targetId)) return undefined;
  return { nodeId: targetId, routes: definition.nodes[targetId]?.kind === 'correction' ? ['replay'] : ['replay','resume'], defaultRoute: 'replay' };
}
export function validateWorkflowReturnPolicies(definition: { nodes?: Record<string, any> }): string[] {
  const errors: string[] = [];
  for (const [id, node] of Object.entries(definition?.nodes || {})) {
    const policy = node?.returnPolicy;
    if (policy === undefined) continue;
    if (!['approval','handle'].includes(node.kind) || !policy || typeof policy !== 'object' || Array.isArray(policy) || Object.keys(policy).some(key => key !== 'targets') || !Array.isArray(policy.targets) || policy.targets.length > 20) { errors.push(`WORKFLOW_RETURN_POLICY_INVALID:${id}`); continue; }
    const ids = new Set<string>();
    for (const target of policy.targets) {
      if (!target || typeof target !== 'object' || Object.keys(target).some(key => !['nodeId','routes','defaultRoute'].includes(key)) || typeof target.nodeId !== 'string' || target.nodeId === id || ids.has(target.nodeId) || !['approval','handle','correction'].includes(definition.nodes?.[target.nodeId]?.kind)) errors.push(`WORKFLOW_RETURN_TARGET_INVALID:${id}`);
      if (target?.nodeId) ids.add(target.nodeId);
      if (!Array.isArray(target?.routes) || target.routes.length < 1 || target.routes.length > 2 || new Set(target.routes).size !== target.routes.length || target.routes.some((route: unknown) => !['replay','resume'].includes(route as string)) || !target.routes.includes(target.defaultRoute)) errors.push(`WORKFLOW_RETURN_ROUTES_INVALID:${id}`);
    }
    if (node.returnTargets && (node.returnTargets.length !== ids.size || node.returnTargets.some((target: string) => !ids.has(target)))) errors.push(`WORKFLOW_RETURN_TARGETS_CONFLICT:${id}`);
  }
  return errors;
}
