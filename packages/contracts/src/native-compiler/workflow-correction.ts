/** Fixed data correction task; assignment always belongs to the instance initiator. */
export interface WorkflowCorrectionNode {
  id: string;
  kind: 'correction';
  title: string;
  taskPageCode: string;
  next: string;
}

type Definition = { startAt: string; nodes: Record<string, any>; taskPages?: Record<string, any> };
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value) && [null, Object.prototype].includes(Object.getPrototypeOf(value));
export function validateWorkflowCorrections(definition: Definition): string[] {
  const nodes = definition?.nodes || {};
  const corrections = Object.values(nodes).filter(node => node?.kind === 'correction');
  if (!corrections.length) return [];
  const errors: string[] = [];
  const targets = (node: any): string[] => node?.kind === 'approval' ? [node.onApprove, node.onReject]
    : node?.kind === 'condition' ? [...(Array.isArray(node.branches) ? node.branches : []).map((branch: any) => branch.target), node.otherwise]
    : node?.kind === 'action' || node?.kind === 'cc' ? [node.next] : [];
  const forward = new Set<string>();
  const pending = [definition.startAt];
  while (pending.length) {
    const id = pending.pop()!; if (forward.has(id)) continue;
    forward.add(id); pending.push(...targets(nodes[id]));
  }
  for (const node of corrections) {
    if (!object(node) || Object.keys(node).some(key => !['id', 'kind', 'title', 'taskPageCode', 'next'].includes(key)) ||
      typeof node.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(node.id) ||
      ['__proto__', 'prototype', 'constructor'].includes(node.id) || nodes[node.id] !== node ||
      typeof node.title !== 'string' || !node.title.trim() || node.title.length > 255 ||
      typeof node.taskPageCode !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(node.taskPageCode))
      errors.push('WORKFLOW_CORRECTION_NODE_INVALID');
    if (node.next !== definition.startAt || nodes[node.next]?.kind === 'correction')
      errors.push('WORKFLOW_CORRECTION_REPLAY_TARGET_INVALID');
    if (forward.has(node.id) || Object.values(nodes).some(current => targets(current).includes(node.id)))
      errors.push('WORKFLOW_CORRECTION_FORWARD_ENTRY_FORBIDDEN');
    if (!Object.values(nodes).some(current => current?.kind === 'approval' && forward.has(current.id) &&
      Array.isArray(current.returnTargets) && current.returnTargets.includes(node.id)))
      errors.push('WORKFLOW_CORRECTION_RETURN_SOURCE_REQUIRED');
    const page = definition.taskPages?.[node.taskPageCode];
    if (!page || !Array.isArray(page.fields)) errors.push('WORKFLOW_CORRECTION_PAGE_REQUIRED');
    else if (page.fields.some((field: any) => field?.subtable)) errors.push('WORKFLOW_CORRECTION_OWNED_FACTS_UNSUPPORTED');
  }
  return [...new Set(errors)];
}
