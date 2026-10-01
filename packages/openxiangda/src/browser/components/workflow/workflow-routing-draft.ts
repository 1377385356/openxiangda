import type { WorkflowAssignmentRoutingRule } from 'openxiangda-contracts/browser';

/** Compare JSON drafts without treating object insertion order as a change. */
export function routingDraftJson(value: WorkflowAssignmentRoutingRule | readonly WorkflowAssignmentRoutingRule[]) {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  });
}
