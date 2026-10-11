import type { WorkflowGraphProjection } from 'openxiangda-contracts/browser';
import { workflowDiagramProjection } from './workflow-graph-presentation';

/** UI-only start node; it never enters the canonical document or command authority. */
export const workflowDesignerStartId = '__oxa_designer_start__';
export function workflowDesignerDisplayGraph(graph: WorkflowGraphProjection): WorkflowGraphProjection {
  const forward = workflowDiagramProjection(graph);
  return { ...forward, startAt: workflowDesignerStartId,
    nodes: [{ id: workflowDesignerStartId, kind: 'start', title: '发起' }, ...forward.nodes],
    edges: [{ id: '__oxa_designer_start_edge__', from: workflowDesignerStartId, to: graph.startAt, kind: 'next', label: '发起后', variablePaths: [] }, ...forward.edges] };
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
