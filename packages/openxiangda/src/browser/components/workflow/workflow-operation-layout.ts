import type { WorkflowOperationSurface } from 'openxiangda-contracts/browser';

/** Presentation only. Never add permissions, rewrite schemas or clone command envelopes. */
function prominence(operation: WorkflowOperationSurface): number | null {
  if (operation.prominence !== undefined) return operation.prominence;
  // Older servers still own their placement and emphasis. No command-name heuristics.
  if (operation.placement !== 'primary') return null;
  return operation.emphasis === 'primary' ? 1 : operation.emphasis === 'warning' ? 2 : operation.emphasis === 'danger' ? 3 : 4;
}

export function workflowOperationGroups(operations: WorkflowOperationSurface[], variant: 'desktop' | 'mobile') {
  const visible = operations.filter(operation => operation.visible);
  const ranked = visible.slice().sort((left, right) => (prominence(left) ?? Infinity) - (prominence(right) ?? Infinity));
  const selected = ranked.filter(operation => prominence(operation) !== null).slice(0, variant === 'mobile' ? 2 : 3);
  const primary = selected.slice().reverse();
  return { primary, secondary: ranked.filter(operation => !selected.includes(operation)) };
}
