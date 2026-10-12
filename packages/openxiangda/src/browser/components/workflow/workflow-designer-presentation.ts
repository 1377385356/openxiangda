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
  const edges = graph.edges.filter(edge => !['return','resubmit'].includes(edge.kind));
  const incoming = new Map(graph.nodes.map(node => [node.id, edges.filter(edge => edge.to === node.id).length]));
  const pending = graph.nodes.filter(node => incoming.get(node.id) === 0).sort((a,b) => Number(b.id === graph.startAt) - Number(a.id === graph.startAt));
  while (pending.length) {
    const node = pending.shift()!; if (ids.has(node.id)) continue;
    ids.add(node.id); ordered.push(node);
    for (const edge of edges.filter(edge => edge.from === node.id)) {
      incoming.set(edge.to, (incoming.get(edge.to) || 0) - 1);
      const target = graph.nodes.find(item => item.id === edge.to);
      if (target && incoming.get(edge.to) === 0) pending.push(target);
    }
  }
  return [...ordered, ...graph.nodes.filter(node => !ids.has(node.id))];
}

export type WorkflowDesignerOutlineRow = WorkflowGraphProjection['nodes'][number] & { nodeId: string; depth: number; edgeId?: string };
/** Keep parallel children under their own branch; joining nodes remain outside the branch rows. */
export function workflowDesignerOutlineRows(graph: WorkflowGraphProjection): WorkflowDesignerOutlineRow[] {
  const ordered=workflowDesignerOutlineNodes(graph),rows: WorkflowDesignerOutlineRow[]=[],emitted=new Set<string>();
  const edges=graph.edges.filter(edge => !['return','resubmit','reject'].includes(edge.kind));
  for (const node of ordered) {
    if (emitted.has(node.id)) continue;
    emitted.add(node.id);rows.push({ ...node,nodeId: node.id,depth: 0 });
    if (!node.parallel) continue;
    for (const edge of edges.filter(edge => edge.from === node.id && edge.parallelBranch).sort((a,b) => (a.priority || 0)-(b.priority || 0))) {
      rows.push({ id: `outline:${edge.id}`,nodeId: node.id,edgeId: edge.id,kind: 'parallel',title: edge.label,depth: 1 });
      const body=new Set<string>(),pending=[edge.to];
      while (pending.length) {
        const id=pending.pop()!;
        if (id === node.parallel.joinNodeId || body.has(id) || !node.parallel.branchNodeIds.includes(id)) continue;
        body.add(id);pending.push(...edges.filter(edge => edge.from === id).map(edge => edge.to));
      }
      for (const child of ordered.filter(child => body.has(child.id))) if (!emitted.has(child.id)) {
        emitted.add(child.id);rows.push({ ...child,nodeId: child.id,depth: 2 });
      }
    }
  }
  return rows;
}
