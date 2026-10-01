import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import type { WorkflowGraphProjection } from 'openxiangda-contracts/browser';

type Point = { x: number; y: number };
const inputPort = (id: string) => `in:${id}`;
const outputPort = (id: string) => `out:${id}`;

/** Coordinates are disposable presentation data; ELK routes every edge orthogonally. */
export async function workflowFlowLayout(graph: WorkflowGraphProjection) {
  if (graph.nodes.length > 200 || graph.edges.length > 1024) throw new Error('WORKFLOW_GRAPH_LAYOUT_LIMIT_EXCEEDED');
  // The bundled constructor uses an in-process shim, not a persistent browser Worker.
  // Release it after this bounded request; terminateWorker requires a workerUrl factory.
  const engine = new ELK();
  const result = await engine.layout<ElkNode>({ id: 'workflow',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '76', 'elk.spacing.nodeNode': '56',
      'elk.layered.spacing.edgeNodeBetweenLayers': '32', 'elk.spacing.edgeEdge': '22',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.edgeLabels.placement': 'CENTER',
      'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    },
    children: graph.nodes.map(node => ({ id: node.id,
      width: node.kind === 'condition' ? 288 : node.kind === 'end' ? 232 : 264, height: node.kind === 'end' ? 92 : 112,
      layoutOptions: { 'elk.portConstraints': 'FIXED_ORDER' },
      ports: [
        { id: inputPort(node.id), width: 0, height: 0, layoutOptions: { 'elk.port.side': 'NORTH' } },
        ...graph.edges.filter(edge => edge.from === node.id).map(edge => ({ id: outputPort(edge.id), width: 0, height: 0, layoutOptions: { 'elk.port.side': 'SOUTH' } })),
      ],
    })),
    edges: graph.edges.map(edge => ({ id: edge.id, sources: [outputPort(edge.id)], targets: [inputPort(edge.to)],
      labels: [{ id: `label:${edge.id}`, text: edge.label, width: edge.kind === 'branch' ? 226 : 112, height: edge.kind === 'branch' ? 62 : 30 }],
    })),
  });
  return {
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
      const fallback: Point = points[Math.floor(points.length / 2)]!;
      return [edge.id, { points, label: label ? { x: label.x! + label.width! / 2, y: label.y! + label.height! / 2 } : fallback }];
    })),
  };
}
