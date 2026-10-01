import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatWorkflowExpression, type WorkflowGraphProjection, type WorkflowGraphVisit } from 'openxiangda-contracts/browser';
import { Button, Empty, Input, Segmented, Select, Space, Switch, Tag } from 'antd';

const kinds: Record<string, string> = { approval: '审批', condition: '条件分支', end: '结束', cc: '抄送', action: '业务步骤' };
const modes: Record<string, string> = { single: '单人审批', any: '任一人同意', all: '所有人同意', sequence: '按顺序审批' };

export interface WorkflowDiagramProps {
  graph: WorkflowGraphProjection;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  /** Titles may be overlaid from the matching effective configuration or frozen visit. */
  titles?: Record<string, string>;
  visits?: readonly WorkflowGraphVisit[];
}

/** Fixed topology renderer, shared by platform administration and application SDK pages. */
export function WorkflowDiagram({ graph, selectedNodeId, onSelectNode, titles = {}, visits = [] }: WorkflowDiagramProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const nodeButtons = useRef(new Map<string, HTMLButtonElement>());
  const marker = useId().replace(/:/g, '');
  const [scale, setScale] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const changed = () => setNarrow(query.matches);
    query.addEventListener('change', changed);
    changed();
    return () => query.removeEventListener('change', changed);
  }, []);
  const effectiveView = narrow ? 'list' : view;
  const [actualOnly, setActualOnly] = useState(false);
  const visited = new Set(visits.map(visit => visit.nodeId));
  const executedEdges = new Set(visits.flatMap((visit, index) => {
    if (visit.matchedBranch !== undefined) return [`${visit.nodeId}:${visit.matchedBranch < 0 ? 'default' : `branch:${visit.matchedBranch}`}`];
    const next = visits[index + 1];
    // Only an unambiguous static edge can be inferred from adjacent visits.
    // Approval/rejection ending at the same node needs a recorded decision.
    const candidates = next ? graph.edges.filter(edge => edge.from === visit.nodeId && edge.to === next.nodeId) : [];
    return candidates.length === 1 ? [candidates[0]!.id] : [];
  }));
  const shownNodes = actualOnly ? graph.nodes.filter(node => visited.has(node.id)) : graph.nodes;
  const shown = new Set(shownNodes.map(node => node.id));
  const edges = graph.edges.filter(edge => shown.has(edge.from) && shown.has(edge.to));
  const title = (id: string) => titles[id] || graph.nodes.find(node => node.id === id)?.title || id;
  const layout = useMemo(() => {
    const indegree = new Map(graph.nodes.map(node => [node.id, 0]));
    const outgoing = new Map<string, typeof graph.edges>();
    for (const edge of graph.edges) {
      indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
      outgoing.set(edge.from, [...outgoing.get(edge.from) || [], edge]);
    }
    const queue = [...indegree].filter(([, count]) => !count).map(([id]) => id);
    const depths = new Map(queue.map(id => [id, 0]));
    for (let index = 0; index < queue.length; index++) for (const edge of outgoing.get(queue[index]!) || []) {
      depths.set(edge.to, Math.max(depths.get(edge.to) || 0, (depths.get(edge.from) || 0) + 1));
      indegree.set(edge.to, indegree.get(edge.to)! - 1);
      if (!indegree.get(edge.to)) queue.push(edge.to);
    }
    const levels = new Map<number, string[]>();
    graph.nodes.forEach((node, index) => {
      const depth = depths.get(node.id) ?? index;
      levels.set(depth, [...levels.get(depth) || [], node.id]);
    });
    const width = Math.max(620, ...[...levels.values()].map(ids => ids.length * 290 + 40));
    const positions = new Map<string, { x: number; y: number }>();
    for (const [depth, ids] of levels) ids.forEach((id, index) => positions.set(id, { x: width / 2 - ids.length * 290 / 2 + index * 290 + 20, y: 64 + depth * 220 }));
    return { width, height: 210 + Math.max(0, ...levels.keys()) * 220, positions, order: [...levels].sort(([a], [b]) => a - b).flatMap(([, ids]) => ids) };
  }, [graph]);
  const locate = (id: string) => {
    onSelectNode(id);
    nodeButtons.current.get(`${effectiveView}:${id}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };
  const keyboard = (id: string, key: string) => {
    const direction = ['ArrowDown', 'ArrowRight'].includes(key) ? 1 : ['ArrowUp', 'ArrowLeft'].includes(key) ? -1 : 0;
    if (!direction) return false;
    const order = layout.order.filter(nodeId => shown.has(nodeId));
    const next = order[(order.indexOf(id) + direction + order.length) % order.length];
    if (next) { locate(next); nodeButtons.current.get(`${effectiveView}:${next}`)?.focus(); }
    return true;
  };
  const options = graph.nodes.filter(node => `${title(node.id)} ${node.id}`.toLowerCase().includes(keyword.toLowerCase())).map(node => ({ value: node.id, label: `${title(node.id)} · ${node.id}` }));
  const nodeButton = (node: WorkflowGraphProjection['nodes'][number], kind: 'graph' | 'list') => {
    const point = layout.positions.get(node.id)!;
    const latest = [...visits].reverse().find(visit => visit.nodeId === node.id);
    return <button key={node.id} type="button" ref={element => { if (element) nodeButtons.current.set(`${kind}:${node.id}`, element); else nodeButtons.current.delete(`${kind}:${node.id}`); }}
      className={`oxa-workflow-node ${selectedNodeId === node.id ? 'selected' : ''} ${visited.has(node.id) ? 'visited' : ''}`}
      style={kind === 'graph' ? { left: point.x, top: point.y, width: 250 } : undefined}
      aria-pressed={selectedNodeId === node.id} aria-label={`${title(node.id)}，${kinds[node.kind] || node.kind}${latest ? '，已执行' : ''}`}
      onClick={() => onSelectNode(node.id)} onKeyDown={event => { if (keyboard(node.id, event.key)) event.preventDefault(); }}>
      <span className="oxa-workflow-node-kind">{node.id === graph.startAt ? '起点 · ' : ''}{kinds[node.kind] || node.kind}{latest ? ` · ${latest.status}` : ''}</span>
      <strong>{title(node.id)}</strong><small>{node.mode ? modes[node.mode] || node.mode : node.kind === 'condition' ? '按顺序首次命中' : node.outcome || node.id}</small>
    </button>;
  };
  return <section className="oxa-workflow-diagram" aria-label="固定流程结构">
    <div className="oxa-workflow-diagram-tools"><Space wrap><Tag>固定结构</Tag><Segmented aria-label="流程查看方式" value={effectiveView} disabled={narrow} onChange={value => setView(value as typeof view)} options={[{ value: 'graph', label: '流程图' }, { value: 'list', label: '节点列表' }]} /></Space>
      <Space wrap><Input.Search aria-label="搜索流程节点" placeholder="搜索节点名称或代码" value={keyword} allowClear onChange={event => setKeyword(event.target.value)} onSearch={() => options[0] && locate(options[0].value)} style={{ width: 210 }} />
        <Select aria-label="定位流程节点" value={selectedNodeId} options={options} onChange={locate} style={{ width: 200 }} notFoundContent="没有匹配的节点" /></Space>
      <Space wrap><Button aria-label="缩小流程图" disabled={scale <= .3} onClick={() => setScale(value => Math.max(.3, value - .1))}>−</Button><span>{Math.round(scale * 100)}%</span><Button aria-label="放大流程图" disabled={scale >= 1.5} onClick={() => setScale(value => Math.min(1.5, value + .1))}>＋</Button>
        <Button onClick={() => { const width = canvas.current?.clientWidth || layout.width; setScale(Math.max(.15, Math.min(1, (width - 32) / layout.width))); }}>适配宽度</Button>
        {visits.length > 0 && <Space><Switch checked={actualOnly} onChange={setActualOnly} aria-label="只看已执行节点" /><span>已执行路径</span></Space>}</Space>
    </div>
    <div className="oxa-workflow-graph-help">条件按展示顺序判断，第一条满足即进入对应分支；均不满足时走默认分支。方向键可逐个定位节点。</div>
    <div ref={canvas} className={`oxa-workflow-canvas ${effectiveView === 'list' ? 'hidden' : ''}`}>
      {!shownNodes.length ? <Empty description="尚无已执行节点" /> : <div style={{ width: layout.width * scale, height: layout.height * scale }}><div style={{ width: layout.width, height: layout.height, position: 'relative', transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <svg width={layout.width} height={layout.height} className="oxa-workflow-edges" role="img" aria-label="固定节点连线"><defs><marker id={marker} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="currentColor" /></marker></defs>
          {edges.map(edge => { const from = layout.positions.get(edge.from)!, to = layout.positions.get(edge.to)!;
            const outgoing = edges.filter(item => item.from === edge.from); const ordinal = outgoing.indexOf(edge);
            const mid = from.y + 112 + ordinal * 23, startX = from.x + 125, endX = to.x + 125;
            const actual = executedEdges.has(edge.id);
            return <g key={edge.id} className={actual ? 'executed' : edge.from === selectedNodeId ? 'selected' : ''}>
              <path d={`M${startX} ${from.y + 95} L${startX} ${mid} L${endX} ${mid} L${endX} ${to.y - 5}`} fill="none" stroke="currentColor" strokeWidth={actual ? 2.5 : 1.5} markerEnd={`url(#${marker})`} />
              <text x={startX + 10} y={mid - 5} fontSize="11">{edge.priority ? `${edge.priority}. ` : ''}{edge.label.length > 28 ? `${edge.label.slice(0, 27)}…` : edge.label}<title>{edge.label}{edge.expression ? `：${formatWorkflowExpression(edge.expression, graph.variables)}` : ''}</title></text>
            </g>; })}</svg>{shownNodes.map(node => nodeButton(node, 'graph'))}
      </div></div>}
    </div>
    <ol className={`oxa-workflow-node-list ${effectiveView === 'graph' ? 'hidden' : ''}`} aria-label="流程节点列表">{layout.order.filter(id => shown.has(id)).map(id => {
      const node = graph.nodes.find(item => item.id === id)!;
      return <li key={id}>{nodeButton(node, 'list')}<ul>{edges.filter(edge => edge.from === id).map(edge => <li key={edge.id}><button type="button" onClick={() => locate(edge.to)}>
        {edge.priority ? `顺序 ${edge.priority} · ` : ''}{edge.label}{edge.expression ? `：${formatWorkflowExpression(edge.expression, graph.variables)}` : ''} → {title(edge.to)}</button></li>)}</ul></li>;
    })}</ol>
  </section>;
}
