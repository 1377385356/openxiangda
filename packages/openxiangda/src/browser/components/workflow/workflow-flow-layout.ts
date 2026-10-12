import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import type { WorkflowGraphProjection } from 'openxiangda-contracts/browser';

type Point = { x: number; y: number };
const inputPort = (id: string) => `in:${id}`;
const outputPort = (id: string) => `out:${id}`;

/** Coordinates are disposable presentation data; ELK routes every edge orthogonally. */
function connectorMidpoint(points: Point[]): Point {
  const lengths = points.slice(1).map((point,index) => Math.hypot(point.x-points[index]!.x,point.y-points[index]!.y));
  let distance = lengths.reduce((sum,length)=>sum+length,0)/2;
  for (const [index,length] of lengths.entries()) {
    if (distance <= length) { const a=points[index]!,b=points[index+1]!;const ratio=length ? distance/length : 0;return {x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio}; }
    distance-=length;
  }
  return points[0]!;
}

export async function workflowFlowLayout(graph: WorkflowGraphProjection, options: { designer?: boolean } = {}) {
  if (graph.nodes.length > (options.designer ? 201 : 200) || graph.edges.length > 1024) throw new Error('WORKFLOW_GRAPH_LAYOUT_LIMIT_EXCEEDED');
  // The bundled constructor uses an in-process shim, not a persistent browser Worker.
  // Release it after this bounded request; terminateWorker requires a workerUrl factory.
  const engine = new ELK();
  const returnEdges = graph.edges.filter(edge => edge.kind === 'return' || edge.kind === 'resubmit');
  const forwardEdges = graph.edges.filter(edge => !returnEdges.includes(edge));
  const forwardNodes = graph.nodes.filter(node => node.kind !== 'correction');
  const result = await engine.layout<ElkNode>({ id: 'workflow',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': options.designer ? '36' : '76', 'elk.spacing.nodeNode': options.designer ? '24' : '56',
      'elk.layered.spacing.edgeNodeBetweenLayers': options.designer ? '0' : '32', 'elk.spacing.edgeEdge': '22',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.edgeLabels.placement': 'CENTER',
      'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    },
    children: forwardNodes.map(node => ({ id: node.id,
      width: options.designer ? node.kind === 'start' ? 156 : node.kind === 'end' ? 180 : node.kind === 'join' ? 180 : node.parallel ? Math.max(616,node.parallel.branchCount*320-24) : 296 : node.kind === 'condition' ? 288 : node.kind === 'end' ? 232 : 264, height: options.designer ? ['start','end','join'].includes(node.kind) ? 42 : node.kind === 'parallel' ? 52 : 72 : node.kind === 'end' ? 92 : 112,
      layoutOptions: { 'elk.portConstraints': 'FIXED_ORDER' },
      ports: [
        { id: inputPort(node.id), width: 0, height: 0, layoutOptions: { 'elk.port.side': 'NORTH' } },
        ...graph.edges.filter(edge => edge.from === node.id).map(edge => ({ id: outputPort(edge.id), width: 0, height: 0, layoutOptions: { 'elk.port.side': 'SOUTH' } })),
      ],
    })),
    edges: forwardEdges.map(edge => ({ id: edge.id, sources: [outputPort(edge.id)], targets: [inputPort(edge.to)],
      labels: options.designer && !['branch','default'].includes(edge.kind) ? [] : [{ id: `label:${edge.id}`, text: edge.label, width: options.designer ? 296 : edge.kind === 'branch' ? 226 : 112, height: options.designer ? 64 : edge.kind === 'branch' ? 62 : 30 }],
    })),
  });
  const positions = {
    nodes: new Map((result.children || []).map(node => [node.id, {
      x: node.x!, y: node.y!, width: node.width!, height: node.height!,
      input: { id: inputPort(node.id), x: node.ports!.find(port => port.id === inputPort(node.id))!.x! },
      outputs: node.ports!.filter(port => port.id !== inputPort(node.id)).map(port => ({ id: port.id, x: port.x! })),
    }])),
    edges: new Map((result.edges || []).map(edge => {
      const section = edge.sections?.[0];
      if (!section) throw new Error('WORKFLOW_GRAPH_ROUTING_MISSING');
      const points = [section.startPoint, ...section.bendPoints || [], section.endPoint];
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1]!, b = points[index]!;
        if (Math.abs(a.x - b.x) > .01 && Math.abs(a.y - b.y) > .01) throw new Error('WORKFLOW_GRAPH_ROUTING_NOT_ORTHOGONAL');
      }
      const label = edge.labels?.[0];
      const fallback = connectorMidpoint(points);
      return [edge.id, { points, label: label ? { x: label.x! + label.width! / 2, y: label.y! + label.height! / 2 } : fallback }];
    })),
  };
  // Parallel branch cards belong directly above their first node. ELK's side
  // labels otherwise extend beyond the canvas and detach from their branches.
  if (options.designer) for (const edge of forwardEdges.filter(edge => edge.parallelBranch)) {
    const target=positions.nodes.get(edge.to),route=positions.edges.get(edge.id);
    const fork=graph.nodes.find(node => node.id === edge.from),source=positions.nodes.get(edge.from);
    if (fork?.parallel && edge.to === fork.parallel.joinNodeId && source && route) {
      const branches=forwardEdges.filter(branch => branch.from === edge.from && branch.parallelBranch);
      const index=branches.findIndex(branch => branch.id === edge.id);
      route.label={ x: source.x+source.width*(index+.5)/branches.length,y: source.y+source.height+54 };
    } else if (target && route) route.label={ x: target.x+target.width/2,y: target.y-68 };
  }
  // Return paths do not change the forward ranks. They occupy bounded outside
  // lanes; correction tasks are shown beside the route, not as a forward cycle.
  const mainRight = Math.max(0, ...[...positions.nodes.values()].map(node => node.x + node.width));
  const mainLeft = Math.min(36, ...[...positions.nodes.values()].map(node => node.x));
  const mainTop = Math.min(36, ...[...positions.nodes.values()].map(node => node.y));
  const corrections = graph.nodes.filter(node => node.kind === 'correction');
  for (const [index, node] of corrections.entries()) {
    const source = returnEdges.find(edge => edge.kind === 'return' && edge.to === node.id);
    const y = positions.nodes.get(source?.from || '')?.y ?? mainTop;
    positions.nodes.set(node.id, {
      x: mainRight + 180 + returnEdges.length * 24 + index * 340, y, width: 264, height: 112,
      input: { id: inputPort(node.id), x: 132 },
      outputs: graph.edges.filter(edge => edge.from === node.id).map(edge => ({ id: outputPort(edge.id), x: 132 })),
    });
  }
  for (const [index, edge] of returnEdges.entries()) {
    const source = positions.nodes.get(edge.from), target = positions.nodes.get(edge.to);
    if (!source || !target) throw new Error('WORKFLOW_GRAPH_ROUTING_MISSING');
    const start = { x: source.x + (source.outputs.find(port => port.id === outputPort(edge.id))?.x ?? source.width / 2), y: source.y + source.height };
    const end = { x: target.x + target.input.x, y: target.y };
    const laneX = edge.kind === 'return' ? options.designer ? mainLeft - 80 - index * 24 : mainRight + 80 + index * 24 : source.x + source.width + 56;
    const topY = edge.kind === 'return' ? target.y - 24 - index * 14 : mainTop - 60 - index * 14;
    const points = [start, { x: start.x, y: start.y + 18 }, { x: laneX, y: start.y + 18 },
      { x: laneX, y: topY }, { x: end.x, y: topY }, end];
    positions.edges.set(edge.id, { points, label: { x: laneX, y: (start.y + 18 + topY) / 2 } });
  }
  const groups = options.designer ? graph.nodes.filter(node => node.parallel).flatMap(node => {
    const members = [node.id,node.parallel!.joinNodeId,...node.parallel!.branchNodeIds].map(id => positions.nodes.get(id)).filter((position): position is NonNullable<typeof position> => !!position);
    if (!members.length) return [];
    const x = Math.min(...members.map(item => item.x))-16,y = Math.min(...members.map(item => item.y))-16;
    return [{ id: `parallel-group:${node.id}`,nodeId: node.id,x,y,width: Math.max(...members.map(item => item.x+item.width))-x+16,height: Math.max(...members.map(item => item.y+item.height))-y+16 }];
  }) : [];
  return { ...positions,groups };
}
