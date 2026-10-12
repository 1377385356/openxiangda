import type { ElkNode, LayoutOptions } from 'elkjs/lib/elk-api';
import type { WorkflowGraphProjection } from 'openxiangda-contracts/browser';

type Point = { x: number; y: number };
type NodePosition = {
  x: number; y: number; width: number; height: number;
  input: { id: string; x: number }; outputs: Array<{ id: string; x: number }>;
};
export type WorkflowFlowPositions = {
  nodes: Map<string, NodePosition>;
  edges: Map<string, { points: Point[]; label: Point }>;
};
const laneGap = 48;
const nodeGap = 56;
const branchGap = 168;
const turnGap = 24;
const branchCardWidth = 296;

/** Place ordinary insertion controls halfway along their orthogonal route. */
export function connectorMidpoint(points: Point[]): Point {
  const lengths = points.slice(1).map((point,index) => Math.hypot(point.x-points[index]!.x,point.y-points[index]!.y));
  let distance = lengths.reduce((sum,length)=>sum+length,0)/2;
  for (const [index,length] of lengths.entries()) {
    if (distance <= length) { const a=points[index]!,b=points[index+1]!;const ratio=length ? distance/length : 0;return {x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio}; }
    distance-=length;
  }
  return points[0]!;
}

/** A paired parallel region is one block in the outer layout. This prevents
 * ELK's preference for a straight branch from pulling the join off the spine.
 * Branch bodies retain their own routed geometry, including condition graphs. */
export async function layoutDesignerParallelRegions(
  graph: WorkflowGraphProjection,
  positions: WorkflowFlowPositions,
  engine: { layout: (graph: ElkNode) => Promise<ElkNode> },
  layoutOptions: LayoutOptions,
): Promise<WorkflowFlowPositions> {
  const edges = graph.edges.filter(edge => !['return', 'resubmit'].includes(edge.kind));
  const owner = new Map<string, string>();
  const regions = graph.nodes.filter(node => node.parallel).map(fork => {
    const joinId = fork.parallel!.joinNodeId;
    const allowed = new Set(fork.parallel!.branchNodeIds);
    const branches = edges.filter(edge => edge.from === fork.id && edge.parallelBranch)
      .sort((a, b) => (a.priority || 0) - (b.priority || 0)).map(edge => {
        const members = new Set<string>(), pending = [edge.to];
        while (pending.length) {
          const id = pending.pop()!;
          if (!allowed.has(id) || members.has(id)) continue;
          members.add(id);
          pending.push(...edges.filter(next => next.from === id).map(next => next.to));
        }
        const internal = edges.filter(next => members.has(next.from) && members.has(next.to));
        const entry = edge.to === joinId ? undefined : positions.nodes.get(edge.to);
        const center = entry ? entry.x + entry.width / 2 : 0;
        const xs = [...members].flatMap(id => {
          const node = positions.nodes.get(id)!;
          return [node.x, node.x + node.width];
        });
        for (const next of internal) {
          const route = positions.edges.get(next.id)!;
          xs.push(...route.points.map(point => point.x));
          if (['branch', 'default'].includes(next.kind)) xs.push(route.label.x - branchCardWidth / 2, route.label.x + branchCardWidth / 2);
        }
        return { edge, members, internal, entry, center, radius: Math.max(branchCardWidth / 2, ...xs.map(x => Math.abs(x - center))) };
      });
    const laneWidth = Math.max(branchCardWidth, ...branches.map(branch => branch.radius * 2));
    const width = branches.length * (laneWidth + laneGap) - laneGap;
    const forkPosition = positions.nodes.get(fork.id)!, joinPosition = positions.nodes.get(joinId)!;
    const nodes = new Map<string, NodePosition>(), routes: WorkflowFlowPositions['edges'] = new Map();
    const centered = (node: NodePosition, y: number, nodeWidth = node.width): NodePosition => ({
      ...node, x: (width - nodeWidth) / 2, y, width: nodeWidth,
      input: { ...node.input, x: nodeWidth / 2 }, outputs: node.outputs.map(port => ({ ...port, x: nodeWidth / 2 })),
    });
    nodes.set(fork.id, centered(forkPosition, 0, width));
    const firstY = forkPosition.height + branchGap;
    let bottom = firstY;
    for (const [index, branch] of branches.entries()) {
      const center = laneWidth / 2 + index * (laneWidth + laneGap);
      const dx = center - branch.center, dy = firstY - (branch.entry?.y || 0);
      for (const id of branch.members) {
        const node = positions.nodes.get(id)!;
        nodes.set(id, { ...node, x: node.x + dx, y: node.y + dy });
        bottom = Math.max(bottom, node.y + dy + node.height);
      }
      for (const edge of branch.internal) {
        const route = positions.edges.get(edge.id)!;
        routes.set(edge.id, {
          points: route.points.map(point => ({ x: point.x + dx, y: point.y + dy })),
          label: { x: route.label.x + dx, y: route.label.y + dy },
        });
      }
    }
    const joinY = bottom + nodeGap, mergeY = joinY - nodeGap / 2;
    nodes.set(joinId, centered(joinPosition, joinY));
    for (const [index, branch] of branches.entries()) {
      const x = laneWidth / 2 + index * (laneWidth + laneGap);
      const start = { x: width / 2, y: forkPosition.height };
      const splitY = start.y + turnGap;
      const end = { x: width / 2, y: joinY };
      routes.set(branch.edge.id, {
        points: [start, { x: start.x, y: splitY }, { x, y: splitY }, ...(branch.entry ? [{ x, y: firstY }] : [{ x, y: mergeY }, { x: end.x, y: mergeY }, end])],
        label: { x, y: firstY - 68 },
      });
      for (const edge of edges.filter(edge => branch.members.has(edge.from) && edge.to === joinId)) {
        const source = nodes.get(edge.from)!;
        const start = { x: source.x + source.outputs.find(port => port.id === `out:${edge.id}`)!.x, y: source.y + source.height };
        const points = [start, { x: start.x, y: mergeY }, { x: end.x, y: mergeY }, end];
        // Place insertion in the vertical branch lane, away from the shared bus.
        routes.set(edge.id, { points, label: { x: start.x, y: (start.y + mergeY) / 2 } });
      }
    }
    for (const id of nodes.keys()) owner.set(id, fork.id);
    return { id: fork.id, joinId, width, height: joinY + joinPosition.height, nodes, routes };
  });
  const regionById = new Map(regions.map(region => [region.id, region]));
  const outerEdges = edges.filter(edge => !owner.has(edge.from) || owner.get(edge.from) !== owner.get(edge.to));
  const outer = await engine.layout({ id: 'workflow-parallel-blocks', layoutOptions,
    children: graph.nodes.filter(node => positions.nodes.has(node.id) && (!owner.has(node.id) || regionById.has(node.id))).map(node => {
      const position = positions.nodes.get(node.id)!, region = regionById.get(node.id);
      const width = region?.width || position.width, height = region?.height || position.height;
      return { id: node.id, width, height, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' }, ports: [
        { id: `in:${node.id}`, x: width / 2, y: 0, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'NORTH' } },
        ...outerEdges.filter(edge => (owner.get(edge.from) || edge.from) === node.id).map(edge => ({ id: `out:${edge.id}`, x: width / 2, y: height, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'SOUTH' } })),
      ] };
    }),
    edges: outerEdges.map(edge => ({ id: edge.id, sources: [`out:${edge.id}`], targets: [`in:${owner.get(edge.to) || edge.to}`],
      labels: ['branch', 'default'].includes(edge.kind) ? [{ id: `label:${edge.id}`, text: edge.label, width: branchCardWidth, height: 64 }] : [],
    })),
  });
  const result: WorkflowFlowPositions = { nodes: new Map(), edges: new Map() };
  for (const node of outer.children || []) {
    const region = regionById.get(node.id);
    if (region) {
      for (const [id, position] of region.nodes) result.nodes.set(id, { ...position, x: position.x + node.x!, y: position.y + node.y! });
      for (const [id, route] of region.routes) result.edges.set(id, { points: route.points.map(point => ({ x: point.x + node.x!, y: point.y + node.y! })), label: { x: route.label.x + node.x!, y: route.label.y + node.y! } });
    } else {
      const position = positions.nodes.get(node.id)!;
      result.nodes.set(node.id, { ...position, x: node.x!, y: node.y!, input: { ...position.input, x: node.width! / 2 }, outputs: position.outputs.map(port => ({ ...port, x: node.width! / 2 })) });
    }
  }
  for (const edge of outer.edges || []) {
    const section = edge.sections?.[0];
    if (!section) throw new Error('WORKFLOW_GRAPH_ROUTING_MISSING');
    const points = [section.startPoint, ...section.bendPoints || [], section.endPoint];
    const label = edge.labels?.[0];
    result.edges.set(edge.id, { points, label: label ? { x: label.x! + label.width! / 2, y: label.y! + label.height! / 2 } : connectorMidpoint(points) });
  }
  return result;
}
