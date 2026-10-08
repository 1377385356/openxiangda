import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatWorkflowExpression, type WorkflowGraphProjection, type WorkflowGraphVisit } from 'openxiangda-contracts/browser';
import { Alert, Button, Empty, Input, Segmented, Select, Skeleton, Space, Switch, Tooltip } from 'antd';
import { AimOutlined, BorderOutlined, LockOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { WorkflowNodeCard } from './WorkflowNodeCard';
import type { WorkflowFlowCanvasController } from './WorkflowFlowCanvas';
import { workflowNodeSummaries } from './workflow-graph-presentation';

const FlowCanvas = lazy(() => import('./WorkflowFlowCanvas'));
const emptyVisits: readonly WorkflowGraphVisit[] = [];
const emptyTitles: Record<string, string> = {};

function displayNodeOrder(graph: WorkflowGraphProjection) {
  const forwardEdges = graph.edges.filter(edge => edge.kind !== 'return' && edge.kind !== 'resubmit');
  const incoming = new Map(graph.nodes.map(node => [node.id, 0]));
  for (const edge of forwardEdges) incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  const ready = graph.nodes.filter(node => incoming.get(node.id) === 0);
  ready.sort((left, right) => Number(right.id === graph.startAt) - Number(left.id === graph.startAt));
  const ordered: WorkflowGraphProjection['nodes'] = [];
  while (ready.length) {
    const node = ready.shift()!;
    ordered.push(node);
    for (const edge of forwardEdges.filter(item => item.from === node.id)) {
      incoming.set(edge.to, incoming.get(edge.to)! - 1);
      if (incoming.get(edge.to) === 0) {
        const target = graph.nodes.find(item => item.id === edge.to);
        if (target) ready.push(target);
      }
    }
  }
  return ordered.length === graph.nodes.length ? ordered : graph.nodes;
}

export interface WorkflowDiagramProps {
  graph: WorkflowGraphProjection;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  /** Only overlay titles from the matching effective configuration or frozen visit. */
  titles?: Record<string, string>;
  /** Optional matching-version summaries, e.g. the effective approval mode. */
  summaries?: Record<string, string>;
  visits?: readonly WorkflowGraphVisit[];
  selectedEdgeId?: string;
  onSelectEdge?: (edgeId: string) => void;
}

class CanvasBoundary extends Component<{ children: ReactNode; onList: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <Alert type="error" showIcon title="流程画布未能加载" description="请使用节点列表查看同一版本的完整结构。" action={<Button onClick={this.props.onList}>查看节点列表</Button>} /> : this.props.children;
  }
}

/** Read-only graph and accessible list share the platform's immutable projection. */
export function WorkflowDiagram({ graph, selectedNodeId, onSelectNode, titles = emptyTitles, summaries, visits = emptyVisits, selectedEdgeId, onSelectEdge }: WorkflowDiagramProps) {
  const controller = useRef<WorkflowFlowCanvasController | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const listButtons = useRef(new Map<string, HTMLButtonElement>());
  const [zoom, setZoom] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);
  const [actualOnly, setActualOnly] = useState(false);
  const [localEdge, setLocalEdge] = useState<string>();
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const changed = () => setNarrow(query.matches);
    query.addEventListener('change', changed);
    changed();
    return () => query.removeEventListener('change', changed);
  }, []);
  const effectiveView = narrow ? 'list' : view;
  const nodeSummaries = useMemo(() => ({ ...workflowNodeSummaries(graph), ...summaries }), [graph, summaries]);
  const visited = useMemo(() => new Set(visits.map(visit => visit.nodeId)), [visits]);
  const executedEdges = useMemo(() => new Set(visits.flatMap(visit => {
    if (visit.matchedBranch !== undefined) return [`${visit.nodeId}:${visit.matchedBranch < 0 ? 'default' : `branch:${visit.matchedBranch}`}`];
    if (visit.transition === 'return') return [`${visit.nodeId}:return:${visit.target}`];
    return visit.transition ? [`${visit.nodeId}:${visit.transition}`] : [];
  })), [visits]);
  const shownGraph = useMemo(() => {
    if (!actualOnly) return graph;
    const nodes = graph.nodes.filter(node => visited.has(node.id));
    const ids = new Set(nodes.map(node => node.id));
    return { ...graph, nodes, edges: graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to) && executedEdges.has(edge.id)) };
  }, [graph, actualOnly, visited, executedEdges]);
  const orderedNodes = useMemo(() => displayNodeOrder(shownGraph), [shownGraph]);
  useEffect(() => {
    if (effectiveView !== 'list') return;
    const container = list.current, button = listButtons.current.get(selectedNodeId);
    if (!container || !button) return;
    const bounds = container.getBoundingClientRect(), target = button.getBoundingClientRect();
    if (target.top < bounds.top + 12 || target.bottom > bounds.bottom - 12) {
      container.scrollTo({ top: container.scrollTop + target.top - bounds.top - 12, behavior: 'instant' });
    }
  }, [selectedNodeId, effectiveView, orderedNodes]);
  const title = (id: string) => titles[id] || graph.nodes.find(node => node.id === id)?.title || id;
  const options = orderedNodes.filter(node => `${title(node.id)} ${node.id}`.toLowerCase().includes(keyword.toLowerCase())).map(node => ({ value: node.id, label: title(node.id) }));
  const locate = (id: string, focus = false) => {
    onSelectNode(id); setLocalEdge(undefined);
    if (effectiveView === 'graph') controller.current?.locate(id, focus);
    else {
      const container = list.current, button = listButtons.current.get(id);
      if (!container || !button) return;
      const bounds = container.getBoundingClientRect(), target = button.getBoundingClientRect();
      container.scrollTo({ top: container.scrollTop + target.top - bounds.top - 12, behavior: focus ? 'instant' : 'smooth' });
      if (focus) button.focus({ preventScroll: true });
    }
  };
  const navigate = (id: string, key: string) => {
    const delta = ['ArrowDown', 'ArrowRight'].includes(key) ? 1 : ['ArrowUp', 'ArrowLeft'].includes(key) ? -1 : 0;
    const order = orderedNodes.map(node => node.id);
    const target = key === 'Home' ? order[0] : key === 'End' ? order.at(-1) : delta ? order[(order.indexOf(id) + delta + order.length) % order.length] : undefined;
    if (target) locate(target, true);
    return !!target;
  };
  const selectEdge = (id: string) => {
    const edge = graph.edges.find(item => item.id === id);
    if (edge) onSelectNode(edge.from);
    setLocalEdge(id); onSelectEdge?.(id);
  };
  if (graph.nodes.length > 200) return <Alert type="error" title="流程图超出 200 节点的显示上限" />;
  return <section className="oxa-workflow-diagram" aria-label="固定流程结构">
    <div className="oxa-workflow-diagram-tools">
      <Segmented aria-label="流程查看方式" value={effectiveView} disabled={narrow} onChange={value => setView(value as typeof view)} options={[{ value: 'graph', label: '流程图' }, { value: 'list', label: '节点列表' }]} />
      <div className="oxa-workflow-node-search"><Input.Search aria-label="搜索流程节点" placeholder="搜索节点" value={keyword} allowClear onChange={event => setKeyword(event.target.value)} onSearch={() => options[0] && locate(options[0].value)} />
        <Select aria-label="定位流程节点" labelInValue value={shownGraph.nodes.some(node => node.id === selectedNodeId) ? { value: selectedNodeId, label: title(selectedNodeId) } : undefined} options={options} onChange={option => locate(option.value)} notFoundContent="没有匹配的节点" popupMatchSelectWidth={300} /></div>
      {visits.length > 0 && <Space size="small"><Switch size="small" checked={actualOnly} onChange={setActualOnly} aria-label="只看已执行节点" /><span>已执行路径</span></Space>}
      <span className="oxa-workflow-readonly"><LockOutlined /> 结构只读</span>
    </div>
    {effectiveView === 'graph' ? <div className="oxa-workflow-canvas">
      {!shownGraph.nodes.length ? <Empty description="尚无已执行节点" /> : <CanvasBoundary onList={() => setView('list')}><Suspense fallback={<div className="oxa-workflow-canvas-loading"><Skeleton active title paragraph={{ rows: 4 }} /></div>}>
        <FlowCanvas graph={shownGraph} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId || localEdge} onSelectNode={onSelectNode} onSelectEdge={selectEdge} titles={titles} summaries={nodeSummaries} visits={visits} executedEdges={executedEdges} onNavigate={navigate} onReady={value => { controller.current = value; }} onZoom={setZoom} />
      </Suspense></CanvasBoundary>}
      <div className="oxa-workflow-viewport-tools" aria-label="画布导航"><Tooltip title="缩小"><Button aria-label="缩小流程图" icon={<MinusOutlined />} disabled={zoom <= .025} onClick={() => controller.current?.zoomBy(-1)} /></Tooltip><span>{Math.round(zoom * 100)}%</span><Tooltip title="放大"><Button aria-label="放大流程图" icon={<PlusOutlined />} disabled={zoom >= 1.6} onClick={() => controller.current?.zoomBy(1)} /></Tooltip>
        <Tooltip title="适应全图"><Button aria-label="适应全图" icon={<BorderOutlined />} onClick={() => controller.current?.fit()} /></Tooltip><Tooltip title="聚焦选中节点"><Button aria-label="聚焦选中节点" icon={<AimOutlined />} onClick={() => locate(selectedNodeId)} /></Tooltip></div>
      <div className="oxa-workflow-graph-help">拖动画布平移 · 滚轮缩放 · 方向键切换节点</div>
    </div> : <ol ref={list} className="oxa-workflow-node-list" aria-label="流程节点列表">
      {orderedNodes.map(node => <li key={node.id}><WorkflowNodeCard node={node} title={title(node.id)} summary={nodeSummaries[node.id]} selected={selectedNodeId === node.id} start={node.id === graph.startAt} visit={[...visits].reverse().find(visit => visit.nodeId === node.id)} onClick={() => onSelectNode(node.id)} onNavigate={navigate} buttonRef={element => { if (element) listButtons.current.set(node.id, element); else listButtons.current.delete(node.id); }} />
        <ul>{shownGraph.edges.filter(edge => edge.from === node.id).map(edge => <li key={edge.id}><button type="button" onClick={() => selectEdge(edge.id)}>
          {edge.priority ? `顺序 ${edge.priority} · ` : ''}{edge.label}{edge.expression ? `：${formatWorkflowExpression(edge.expression, graph.variables)}` : ''} → {title(edge.to)}</button><Button size="small" type="text" onClick={() => locate(edge.to)} aria-label={`定位${title(edge.to)}`}>定位</Button></li>)}</ul></li>)}
      {!shownGraph.nodes.length && <li><Empty description="尚无已执行节点" /></li>}
    </ol>}
  </section>;
}
