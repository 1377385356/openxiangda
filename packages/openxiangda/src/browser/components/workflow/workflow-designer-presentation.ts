import type { WorkflowGraphProjection } from 'openxiangda-contracts/browser';
import { workflowDiagramProjection } from './workflow-graph-presentation';

/** UI-only start node; it never enters the canonical document or command authority. */
export const workflowDesignerStartId = '__oxa_designer_start__';
export function workflowDesignerDisplayGraph(graph: WorkflowGraphProjection, returnFrom?: string, returnTargets: readonly string[] = []): WorkflowGraphProjection {
  const forward = workflowDiagramProjection(graph);
  const returns = returnFrom ? graph.edges.filter(edge => edge.kind === 'return' && edge.from === returnFrom) : [];
  // The read projection contains correction paths only. Human return policies
  // are projected here from the selected canonical node, without editing it.
  if (returnFrom) for (const target of returnTargets) if (graph.nodes.some(node => node.id === target) && !returns.some(edge => edge.to === target)) returns.push({ id: `${returnFrom}:return:${target}`, from: returnFrom, to: target, kind: 'return', label: '退回', variablePaths: [] });
  const corrections = graph.nodes.filter(node => node.kind === 'correction' && returns.some(edge => edge.to === node.id));
  const resumptions = graph.edges.filter(edge => edge.kind === 'resubmit' && corrections.some(node => node.id === edge.from));
  return { ...forward, startAt: workflowDesignerStartId,
    nodes: [{ id: workflowDesignerStartId, kind: 'start', title: '发起' }, ...forward.nodes, ...corrections],
    edges: [{ id: '__oxa_designer_start_edge__', from: workflowDesignerStartId, to: graph.startAt, kind: 'next', label: '发起后', variablePaths: [] }, ...forward.edges, ...returns, ...resumptions] };
}
export function workflowDesignerOutlineNodes(graph: WorkflowGraphProjection): WorkflowGraphProjection['nodes'] {
  const ids = new Set<string>(), ordered: WorkflowGraphProjection['nodes'] = [];
  const incoming = new Map(graph.nodes.map(node => [node.id, graph.edges.filter(edge => edge.to === node.id).length]));
  const pending = graph.nodes.filter(node => incoming.get(node.id) === 0).sort((a,b) => Number(b.id === graph.startAt) - Number(a.id === graph.startAt));
  while (pending.length) {
    const node = pending.shift()!; if (ids.has(node.id)) continue;
    ids.add(node.id); ordered.push(node);
    for (const edge of graph.edges.filter(edge => edge.from === node.id)) {
      incoming.set(edge.to, (incoming.get(edge.to) || 0) - 1);
      const target = graph.nodes.find(item => item.id === edge.to);
      if (target && incoming.get(edge.to) === 0) pending.push(target);
    }
  }
  return [...ordered, ...graph.nodes.filter(node => !ids.has(node.id))];
}
