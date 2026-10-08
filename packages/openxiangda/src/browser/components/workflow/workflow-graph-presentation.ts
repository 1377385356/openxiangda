import { workflowVariableLabel, type WorkflowGraphProjection } from 'openxiangda-contracts/browser';

/** Common task operations belong in configuration/history, not in the main diagram. */
export function workflowDiagramProjection(graph: WorkflowGraphProjection): WorkflowGraphProjection {
  const nodes = graph.nodes.filter(node => {
    if (node.kind === 'correction') return false;
    if (node.kind !== 'end') return true;
    if (node.outcome === 'rejected') return false;
    const incoming = graph.edges.filter(edge => edge.to === node.id);
    return !incoming.length || incoming.some(edge => edge.kind !== 'reject');
  });
  const ids = new Set(nodes.map(node => node.id));
  return { ...graph, nodes, edges: graph.edges.filter(edge =>
    !['reject', 'return', 'resubmit'].includes(edge.kind) && ids.has(edge.from) && ids.has(edge.to)) };
}

/** Summaries describe the immutable projection; they never infer business rules. */
export function workflowNodeSummaries(graph: WorkflowGraphProjection): Record<string, string> {
  const label = (path: string) => workflowVariableLabel(path, graph.variables);
  const summaries: Record<string, string> = {};
  for (const node of graph.nodes) {
    if (node.kind === 'condition') {
      const edges = graph.edges.filter(edge => edge.from === node.id);
      const branches = edges.filter(edge => edge.kind === 'branch');
      const paths = [...new Set(branches.flatMap(edge => edge.variablePaths))];
      summaries[node.id] = `${paths.map(label).join('、') || '固定条件'} · ${branches.length} 条条件${edges.some(edge => edge.kind === 'default') ? ' + 默认' : ''}`;
    } else if (node.businessStep?.outputPaths.length) {
      summaries[node.id] = `产出：${node.businessStep.outputPaths.map(label).join('、')}`;
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
