import type { WorkflowGraphProjection } from 'openxiangda-contracts/browser';

/** Summaries describe the immutable projection; they never infer business rules. */
export function workflowNodeSummaries(graph: WorkflowGraphProjection): Record<string, string> {
  const labels = new Map(graph.variables.map(variable => [variable.path, variable.label]));
  const summaries: Record<string, string> = {};
  for (const node of graph.nodes) {
    if (node.kind === 'condition') {
      const edges = graph.edges.filter(edge => edge.from === node.id);
      const branches = edges.filter(edge => edge.kind === 'branch');
      const paths = [...new Set(branches.flatMap(edge => edge.variablePaths))];
      summaries[node.id] = `${paths.map(path => labels.get(path) || path).join('、') || '固定条件'} · ${branches.length} 条条件${edges.some(edge => edge.kind === 'default') ? ' + 默认' : ''}`;
    } else if (node.businessStep?.outputPaths.length) {
      summaries[node.id] = `产出：${node.businessStep.outputPaths.map(path => labels.get(path) || path).join('、')}`;
    }
  }
  return summaries;
}

export const workflowReadableZoom = .7;

/** Check layout coordinates rather than virtualized DOM nodes, which may not exist. */
export function workflowNodeIsReadable(
  node: { x: number; y: number; width: number; height: number },
  viewport: { x: number; y: number; zoom: number },
  size: { width: number; height: number },
) {
  const left = node.x * viewport.zoom + viewport.x;
  const top = node.y * viewport.zoom + viewport.y;
  const padding = 24;
  return viewport.zoom >= workflowReadableZoom && left >= padding && top >= padding &&
    left + node.width * viewport.zoom <= size.width - padding &&
    top + node.height * viewport.zoom <= size.height - padding;
}
