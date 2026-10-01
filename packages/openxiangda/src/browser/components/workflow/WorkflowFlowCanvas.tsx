import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, MiniMap, Position, ReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { formatWorkflowExpression, type WorkflowGraphEdge, type WorkflowGraphProjection, type WorkflowGraphVisit } from 'openxiangda-contracts/browser';
import { WorkflowNodeCard } from './WorkflowNodeCard';
import { workflowFlowLayout } from './workflow-flow-layout';
import '@xyflow/react/dist/style.css';
import { Skeleton } from 'antd';

export interface WorkflowFlowCanvasController {
  locate: (id: string, focus?: boolean) => void;
  fit: () => void;
  zoomBy: (direction: number) => void;
}
type Point = { x: number; y: number };
type FlowNode = Node<{
  node: WorkflowGraphProjection['nodes'][number]; title: string; summary?: string; start: boolean;
  visit?: WorkflowGraphVisit; onSelect: () => void; onNavigate: (id: string, key: string) => boolean;
  input: { id: string; x: number }; outputs: Array<{ id: string; x: number }>;
}, 'workflow'>;
type FlowEdge = Edge<{
  edge: WorkflowGraphEdge; expression: string; points: Point[]; label: Point;
  actual: boolean; highlighted: boolean; selected: boolean; onSelect: () => void;
}, 'workflow'>;

function DiagramNode({ data, selected }: NodeProps<FlowNode>) {
  return <><Handle id={data.input.id} type="target" position={Position.Top} style={{ left: data.input.x }} isConnectable={false} />
    <WorkflowNodeCard node={data.node} title={data.title} summary={data.summary} selected={selected} start={data.start} visit={data.visit} onClick={data.onSelect} onNavigate={data.onNavigate} />
    {data.outputs.map(port => <Handle key={port.id} id={port.id} type="source" position={Position.Bottom} style={{ left: port.x }} isConnectable={false} />)}</>;
}

function orthogonalPath(points: Point[]) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

function DiagramEdge({ id, data, markerEnd }: EdgeProps<FlowEdge>) {
  if (!data) return null;
  return <><BaseEdge id={id} path={orthogonalPath(data.points)} markerEnd={markerEnd} interactionWidth={22} style={{ stroke: data.actual ? 'var(--ant-color-success, #389e0d)' : data.highlighted ? 'var(--ant-color-primary, #1677ff)' : '#aab4c1', strokeWidth: data.actual || data.highlighted ? 2 : 1.5 }} />
    <EdgeLabelRenderer><button type="button" className={`oxa-workflow-edge-label nodrag nopan ${data.actual ? 'executed' : ''} ${data.highlighted ? 'selected' : ''} ${data.edge.kind === 'branch' ? 'branch' : ''}`}
      style={{ transform: `translate(-50%, -50%) translate(${data.label.x}px, ${data.label.y}px)` }}
      title={`${data.edge.label}${data.expression ? `：${data.expression}` : ''}`} aria-pressed={data.selected} aria-label={`分支：${data.edge.priority ? `顺序 ${data.edge.priority}，` : ''}${data.edge.label}${data.expression ? `，${data.expression}` : ''}`} onClick={data.onSelect}>
      <span>{data.edge.priority ? <b>{data.edge.priority}</b> : null}{data.edge.label}{data.actual && <small>已执行</small>}</span>{data.expression && <strong>{data.expression}</strong>}
    </button></EdgeLabelRenderer></>;
}
const nodeTypes = { workflow: DiagramNode };
const edgeTypes = { workflow: DiagramEdge };

/** Lazy module: loading a CRUD page or the node list does not instantiate React Flow. */
export default function WorkflowFlowCanvas(props: {
  graph: WorkflowGraphProjection; selectedNodeId: string; selectedEdgeId?: string;
  titles: Record<string, string>; summaries?: Record<string, string>; visits: readonly WorkflowGraphVisit[]; executedEdges: Set<string>;
  onSelectNode: (id: string) => void; onSelectEdge: (id: string) => void; onNavigate: (id: string, key: string) => boolean;
  onReady: (controller: WorkflowFlowCanvasController | null) => void; onZoom: (zoom: number) => void;
}) {
  const latest = useRef(props); latest.current = props;
  const container = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const [layoutState, setLayoutState] = useState<{ graph: WorkflowGraphProjection; positions?: Awaited<ReturnType<typeof workflowFlowLayout>>; error?: Error }>({ graph: props.graph });
  const positions = layoutState.graph === props.graph ? layoutState.positions : undefined;
  useEffect(() => {
    let active = true;
    void workflowFlowLayout(props.graph).then(value => { if (active) setLayoutState({ graph: props.graph, positions: value }); },
      error => { if (active) setLayoutState({ graph: props.graph, error: error instanceof Error ? error : new Error(String(error)) }); });
    return () => { active = false; };
  }, [props.graph]);
  const nodes = useMemo<FlowNode[]>(() => positions ? props.graph.nodes.map(node => {
    const point = positions.nodes.get(node.id)!;
    return { id: node.id, type: 'workflow', position: { x: point.x, y: point.y }, width: point.width, height: point.height,
      style: { width: point.width, height: point.height }, selected: props.selectedNodeId === node.id, draggable: false, connectable: false, deletable: false,
      data: { node, title: props.titles[node.id] || node.title, summary: props.summaries?.[node.id], start: node.id === props.graph.startAt,
        visit: [...props.visits].reverse().find(visit => visit.nodeId === node.id), input: point.input, outputs: point.outputs,
        onSelect: () => latest.current.onSelectNode(node.id), onNavigate: (id, key) => latest.current.onNavigate(id, key) } };
  }) : [], [props.graph, props.selectedNodeId, props.titles, props.summaries, props.visits, positions]);
  const edges = useMemo<FlowEdge[]>(() => positions ? props.graph.edges.map(edge => {
    const position = positions.edges.get(edge.id)!;
    const actual = props.executedEdges.has(edge.id), selected = props.selectedEdgeId === edge.id;
    const highlighted = props.selectedEdgeId ? selected : edge.from === props.selectedNodeId;
    return { id: edge.id, source: edge.from, sourceHandle: `out:${edge.id}`, target: edge.to, targetHandle: `in:${edge.to}`, type: 'workflow', deletable: false, reconnectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: actual ? '#389e0d' : highlighted ? '#1677ff' : '#aab4c1' },
      data: { edge, expression: edge.expression ? formatWorkflowExpression(edge.expression, props.graph.variables) : '', points: position.points, label: position.label, actual, highlighted, selected, onSelect: () => latest.current.onSelectEdge(edge.id) } };
  }) : [], [props.graph, props.executedEdges, props.selectedNodeId, props.selectedEdgeId, positions]);
  useEffect(() => {
    if (!instance || !positions) return;
    const locate = (id: string, focus = false) => {
      const point = positions.nodes.get(id);
      if (!point) return;
      void instance.setCenter(point.x + point.width / 2, point.y + point.height / 2, { zoom: .95, duration: focus ? 0 : 180 }).then(() => {
        if (focus) requestAnimationFrame(() => container.current?.querySelector<HTMLButtonElement>(`.react-flow__node[data-id="${CSS.escape(id)}"] button`)?.focus({ preventScroll: true }));
      });
    };
    latest.current.onReady({ locate, fit: () => { void instance.fitView({ padding: .18, maxZoom: 1, minZoom: .025, duration: 200 }); }, zoomBy: direction => { void instance.zoomTo(Math.max(.025, Math.min(1.6, instance.getZoom() * (direction > 0 ? 1.25 : .8))), { duration: 120 }); } });
    if (latest.current.graph.nodes.length > 14) locate(latest.current.selectedNodeId);
    else void instance.fitView({ padding: .2, maxZoom: 1, minZoom: .025 });
    return () => latest.current.onReady(null);
  }, [instance, positions]);
  if (layoutState.graph === props.graph && layoutState.error) throw layoutState.error;
  if (!positions) return <div className="oxa-workflow-canvas-loading"><Skeleton active title paragraph={{ rows: 4 }} /></div>;
  return <div ref={container} className="oxa-workflow-reactflow">
    <ReactFlow<FlowNode, FlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={setInstance}
      nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} edgesReconnectable={false}
      deleteKeyCode={null} disableKeyboardA11y selectionOnDrag={false} selectionKeyCode={null} zoomOnDoubleClick={false}
      minZoom={.025} maxZoom={1.6} onlyRenderVisibleElements onMoveEnd={(_event, viewport) => props.onZoom(viewport.zoom)}
      onEdgeClick={(_event, edge) => props.onSelectEdge(edge.id)} aria-label="只读流程画布">
      <Background color="#d6dde5" gap={22} size={1} />
      <MiniMap pannable zoomable position="bottom-right" aria-label="流程缩略导航" style={{ width: 150, height: 94 }} nodeColor={node => node.selected ? '#1677ff' : '#b7c2cf'} maskColor="rgba(243, 246, 250, .72)" />
    </ReactFlow>
  </div>;
}
