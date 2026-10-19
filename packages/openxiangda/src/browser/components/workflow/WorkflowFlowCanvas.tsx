import '../../workflow-canvas.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, MiniMap, Position, ReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { type WorkflowGraphEdge, type WorkflowGraphProjection, type WorkflowGraphVisit } from 'openxiangda-contracts/browser';
import { WorkflowNodeCard } from './WorkflowNodeCard';
import { formatWorkflowCondition } from './workflow-variable-presentation';
import { workflowFlowLayout } from './workflow-flow-layout';
import { workflowNodeIsReadable, workflowReadableZoom } from './workflow-graph-presentation';
import '@xyflow/react/dist/style.css';
import { Dropdown, Skeleton, type MenuProps } from 'antd';
import { PlusOutlined, BranchesOutlined, BellOutlined, CodeOutlined, UserOutlined, FormOutlined, CopyOutlined } from '@ant-design/icons';

export interface WorkflowFlowCanvasController {
  locate: (id: string, focus?: boolean) => void;
  fit: () => void;
  zoomBy: (direction: number) => void;
}
type Point = { x: number; y: number };
type FlowNode = Node<{
  onToggleGroup?:()=>void;collapsed?:boolean;paths?:Array<{id:string;label:string}>;onReconnect?:(id:string)=>void; designer?: boolean; movable?: boolean; onKeyboardMove?:()=>void; node: WorkflowGraphProjection['nodes'][number]; title: string; summary?: string; start: boolean;
  visit?: WorkflowGraphVisit; onSelect: () => void; onNavigate: (id: string, key: string) => boolean;
  input: { id: string; x: number }; outputs: Array<{ id: string; x: number }>;
}, 'workflow' | 'parallel_group' | 'placeholder'>;
type FlowEdge = Edge<{
  edge: WorkflowGraphEdge; expression: string; points: Point[]; label: Point;
  actual: boolean; highlighted: boolean; selected: boolean; onSelect: () => void; onInsert?: (template?: string) => void; insertionOptions?: Array<{ value: string; label: string; kind: string }>; designer?: boolean; onReorderBranch?:(from:number,to:number)=>void;
}, 'workflow'>;

function DiagramNode({ data, selected }: NodeProps<FlowNode>) {
  return <>{data.movable&&<span role="button" tabIndex={0} aria-label={`移动${data.title}`} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();data.onKeyboardMove?.();}}} className="oxa-workflow-node-drag-handle" title="拖动调整顺序；按 Enter 选择投放位置" style={{position:'absolute',right:28,top:2,cursor:'grab',zIndex:5,padding:'4px 8px'}}>⠿</span>}<Handle id={data.input.id} type="target" position={Position.Top} style={{ left: data.input.x }} isConnectable={false} />
    {data.designer&&data.onReconnect&&<Dropdown trigger={['click']} menu={{items:[...(data.onToggleGroup?[{key:'collapse',label:data.collapsed?'展开分支':'收起分支'}]:[]),{key:'move',label:'移动节点（键盘）',disabled:!data.movable},...(data.paths || []).map(path=>({key:path.id,label:`修改${path.label}路径`}))],onClick:({key})=>key==='collapse'?data.onToggleGroup?.():key==='move'?data.onKeyboardMove?.():data.onReconnect?.(key)}}><button type="button" className="oxa-workflow-node-menu nodrag nopan" aria-label={`${data.title}节点菜单`}>⋯</button></Dropdown>}
    <WorkflowNodeCard designer={data.designer} node={data.node} title={data.title} summary={data.summary} selected={selected} start={data.start} visit={data.visit} onClick={data.onSelect} onNavigate={data.onNavigate} />
    {data.outputs.map(port => <Handle key={port.id} id={port.id} type="source" position={Position.Bottom} style={{ left: port.x }} isConnectable={false} />)}</>;
}

function orthogonalPath(points: Point[]) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

function insertionMenu(options: NonNullable<FlowEdge['data']>['insertionOptions']): MenuProps['items'] {
  const names: Record<string,string> = { approval: '审批节点', handle: '办理节点', cc: '抄送节点', action: '业务步骤', condition: '条件分支', parallel: '并行分支', notification: '发送通知' };
  const descriptions: Record<string,string> = { approval: '需要有人作出决定', handle: '需要有人完成工作并确认', cc: '让相关人知晓', action: '执行已发布的业务能力', condition: '只进入第一个满足的分支', parallel: '同时执行，全部完成后继续', notification: '发送消息' };
  const icons = { approval: UserOutlined, handle: FormOutlined, cc: CopyOutlined, action: CodeOutlined, condition: BranchesOutlined, parallel: BranchesOutlined, notification: BellOutlined };
  return [{ label: '人工', kinds: ['approval','handle','cc'] }, { label: '分支', kinds: ['condition','parallel'] }, { label: '自动', kinds: ['action','notification'] }].flatMap(group => {
    const children = group.kinds.flatMap(kind => {
      const entries = (options || []).filter(option => option.kind === kind);
      if (!entries.length) return [];
      const Icon = icons[kind as keyof typeof icons];
      const label = <span className="oxa-designer-insert-option"><span>{names[kind]}</span><small>{descriptions[kind]}</small></span>;
      return [entries.length === 1 ? { key: entries[0]!.value, icon: <Icon className={`kind-${kind}`} />, label } : { key: `kind:${kind}`, icon: <Icon className={`kind-${kind}`} />, label, children: entries.map(option => ({ key: option.value,label: option.label })) }];
    });
    return children.length ? [{ key: `group:${group.label}`,type: 'group' as const,label: group.label,children }] : [];
  });
}

function DiagramEdge({ id, data, markerEnd }: EdgeProps<FlowEdge>) {
  if (!data) return null;
  const insertButton = <button type="button" className="oxa-workflow-edge-insert nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${data.label.x}px, ${data.label.y + (data.designer ? ['branch','default'].includes(data.edge.kind) ? 50 : data.selected ? 24 : 0 : 30)}px)` }} aria-label={`在${data.edge.label}路径新增节点`} onClick={event => { event.stopPropagation(); if (!data.insertionOptions?.length) data.onInsert?.(); }}><PlusOutlined /></button>;
  return <><BaseEdge id={id} path={orthogonalPath(data.points)} markerEnd={data.designer && !['return','resubmit'].includes(data.edge.kind) ? undefined : markerEnd} interactionWidth={22} style={{ stroke: data.actual ? 'var(--ant-color-success, #389e0d)' : data.highlighted ? 'var(--ant-color-primary, #1677ff)' : '#aab4c1', strokeWidth: data.actual || data.highlighted ? 2 : 1.5,
    strokeDasharray: data.edge.kind === 'return' || data.edge.kind === 'resubmit' ? '6 4' : undefined }} />
    <EdgeLabelRenderer>{(!data.designer || data.selected || ['branch','default','return','resubmit'].includes(data.edge.kind)) && <button type="button" className={`oxa-workflow-edge-label nodrag nopan ${data.actual ? 'executed' : ''} ${data.highlighted ? 'selected' : ''} ${data.edge.kind === 'branch' ? 'branch' : ''} ${data.designer && ['branch','default'].includes(data.edge.kind) ? 'designer-branch' : ''}`}
      style={{ transform: `translate(-50%, -50%) translate(${data.label.x}px, ${data.label.y}px)` }}
      draggable={!!data.onReorderBranch&&data.edge.kind==='branch'}
      onDragStart={event=>{event.dataTransfer.setData('application/x-workflow-branch',JSON.stringify({nodeId:data.edge.from,index:(data.edge.priority||1)-1}));event.dataTransfer.effectAllowed='move';}}
      onDragOver={event=>{if(data.onReorderBranch&&data.edge.kind==='branch'&&event.dataTransfer.types.includes('application/x-workflow-branch'))event.preventDefault();}}
      onDrop={event=>{event.preventDefault();try{const moved=JSON.parse(event.dataTransfer.getData('application/x-workflow-branch'));if(moved.nodeId===data.edge.from)data.onReorderBranch?.(moved.index,(data.edge.priority||1)-1);}catch{/* Unrelated drag data does not modify a workflow. */}}}
      title={`${data.edge.label}${data.expression ? `：${data.expression}` : ''}`} aria-pressed={data.selected} aria-label={`分支：${data.edge.priority ? `顺序 ${data.edge.priority}，` : ''}${data.edge.label}${data.expression ? `，${data.expression}` : ''}`} onClick={data.onSelect}>
      {data.designer && ['branch','default'].includes(data.edge.kind) ? <><span><span>{data.edge.label}</span>{data.edge.parallelBranch ? <small>同时</small> : data.edge.kind==='default'?<small>默认</small>:data.edge.priority && <small>优先级 {data.edge.priority}</small>}</span><strong>{data.expression || (data.edge.parallelBranch ? '始终执行' : '以上都不满足')}</strong></> : <><span>{data.edge.priority ? <b>{data.edge.priority}</b> : null}{data.edge.label}{data.actual && <small>已执行</small>}</span>{data.expression && <strong>{data.expression}</strong>}</>}
    </button>}{data.onInsert && (data.insertionOptions?.length ? <Dropdown trigger={['click']} placement="bottom" menu={{ items: insertionMenu(data.insertionOptions), onClick: ({ key }) => data.onInsert?.(key) }} classNames={{ root: 'oxa-designer-insert-menu' }}>{insertButton}</Dropdown> : insertButton)}</EdgeLabelRenderer></>;
}
const nodeTypes = { workflow: DiagramNode, placeholder: () => <div className="oxa-workflow-drag-origin">原位置</div>, parallel_group: () => <div className="oxa-workflow-parallel-region" aria-hidden="true" /> };
const edgeTypes = { workflow: DiagramEdge };

/** Lazy module: loading a CRUD page or the node list does not instantiate React Flow. */
export default function WorkflowFlowCanvas(props: {
  graph: WorkflowGraphProjection; selectedNodeId: string; selectedEdgeId?: string; startAtTop?: boolean; designer?: boolean;
  titles: Record<string, string>; summaries?: Record<string, string>; visits: readonly WorkflowGraphVisit[]; executedEdges: Set<string>;
  onSelectNode: (id: string) => void; onSelectEdge: (id: string) => void; onNavigate: (id: string, key: string) => boolean;
  groupRegions?:Record<string,{members:string[];exit:string}>;
  onBeginReconnect?: (edgeId:string)=>void;
  onReorderBranch?: (nodeId:string,from:number,to:number)=>void;
  isMoveAllowed?: (nodeId:string,edgeId:string)=>boolean;
  onMoveNode?: (nodeId:string,edgeId:string)=>void;
  onInsertEdge?: (id: string, template?: string) => void; insertionOptions?: Array<{ value: string; label: string; kind: string }>;
  onReady: (controller: WorkflowFlowCanvasController | null) => void; onZoom: (zoom: number) => void;
}) {
  const [collapsed,setCollapsed]=useState<string[]>([]);
  const graph=useMemo(()=>{
    const regions=collapsed.flatMap(id=>props.groupRegions?.[id]?[{id,...props.groupRegions[id]!}]:[]);
    const hidden=new Set(regions.flatMap(region=>region.members.filter(id=>id!==region.id)));
    return {...props.graph,nodes:props.graph.nodes.filter(node=>!hidden.has(node.id)),edges:props.graph.edges.filter(edge=>!hidden.has(edge.from)).flatMap(edge=>{
      const region=regions.find(region=>region.id===edge.from);
      return region&&!['return','resubmit','reject'].includes(edge.kind)?[{...edge,to:region.exit}]:hidden.has(edge.to)?[]:[edge];
    })};
  },[props.graph,props.groupRegions,collapsed]);
  const [dragPosition,setDragPosition]=useState<{id:string;x:number;y:number}>();
  const [dropEdge,setDropEdge]=useState<string>();
  const [keyboardMove,setKeyboardMove]=useState<string>();
  const [miniMap,setMiniMap]=useState(false);
  const cancelledDrag = useRef(false);
  const dragActive = useRef(false);
  const legalSlots = useRef(new Set<string>());
  useEffect(()=>{
    const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape'){setKeyboardMove(undefined);}if(event.key==='Escape'&&dragActive.current){cancelledDrag.current=true;setDragPosition(undefined);setDropEdge(undefined);}};
    const blur=()=>{if(dragActive.current){cancelledDrag.current=true;dragActive.current=false;setDragPosition(undefined);setDropEdge(undefined);}};
    window.addEventListener('keydown',cancel);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',cancel);window.removeEventListener('blur',blur);};
  },[]);
  const latest = useRef(props); latest.current = props;
  const initialized = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const layoutSpine = useRef<{ instance: ReactFlowInstance<FlowNode, FlowEdge>; x: number } | null>(null);
  const ensureVisible = useRef<((id: string) => void) | null>(null);
  const interruptNavigation = useRef<(() => void) | null>(null);
  const [instance, setInstance] = useState<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const [layoutState, setLayoutState] = useState<{ graph: WorkflowGraphProjection; positions?: Awaited<ReturnType<typeof workflowFlowLayout>>; error?: Error }>({ graph });
  // Keep the last resolved canvas mounted while its next layout is calculated.
  // Unmounting React Flow here resets its camera and invalidates its controller.
  const positions = layoutState.positions;
  const renderedGraph = positions ? layoutState.graph : graph;
  useEffect(() => {
    let active = true;
    void workflowFlowLayout(graph, { designer: props.designer }).then(value => { if (active) setLayoutState({ graph, positions: value }); },
      error => { if (active) setLayoutState({ graph, error: error instanceof Error ? error : new Error(String(error)) }); });
    return () => { active = false; };
  }, [graph, props.designer]);
  const gapY=dropEdge&&positions?positions.edges.get(dropEdge)?.label.y:undefined;
  const gapHeight=dragPosition&&positions?(positions.nodes.get(dragPosition.id)?.height || 88)+36:0;
  const previewY=(y:number)=>gapY!==undefined&&y>=gapY?y+gapHeight:y;
  const nodes = useMemo<FlowNode[]>(() => positions ? renderedGraph.nodes.map(node => {
    const point = positions.nodes.get(node.id)!;
    return { id: node.id, type: 'workflow', position: dragPosition?.id===node.id?{x:dragPosition.x,y:dragPosition.y}:{ x: point.x, y: previewY(point.y) }, width: point.width, height: point.height,
      style: { width: point.width, height: point.height, pointerEvents: 'all' }, selected: props.selectedNodeId === node.id, draggable: !!props.onMoveNode&&['approval','handle','cc','action','condition','parallel'].includes(node.kind), connectable: false, deletable: false,
      dragHandle: '.oxa-workflow-node-drag-handle, .oxa-workflow-node-copy', data: { collapsed:collapsed.includes(node.id),onToggleGroup:props.groupRegions?.[node.id]?()=>setCollapsed(value=>value.includes(node.id)?value.filter(id=>id!==node.id):[...value,node.id]):undefined,paths:renderedGraph.edges.filter(edge=>edge.from===node.id&&['approve','reject','next'].includes(edge.kind)).map(edge=>({id:edge.id,label:edge.label})),onReconnect:props.onBeginReconnect?(edgeId)=>latest.current.onBeginReconnect?.(edgeId):undefined,onKeyboardMove:()=>setKeyboardMove(node.id),movable: !!props.onMoveNode&&['approval','handle','cc','action','condition','parallel'].includes(node.kind), designer: props.designer, node, title: props.titles[node.id] || node.title, summary: collapsed.includes(node.id) ? `分支已收起 · ${(props.groupRegions?.[node.id]?.members.length ?? 1)-1} 个节点` : props.summaries?.[node.id], start: node.id === renderedGraph.startAt,
        visit: [...props.visits].reverse().find(visit => visit.nodeId === node.id), input: point.input, outputs: point.outputs,
        onSelect: () => {if(!dragActive.current)latest.current.onSelectNode(node.id);}, onNavigate: (id, key) => latest.current.onNavigate(id, key) } };
  }) : [], [renderedGraph, props.selectedNodeId, props.titles, props.summaries, props.visits, positions, props.designer,props.onMoveNode,props.onBeginReconnect,props.groupRegions,collapsed,dragPosition,dropEdge]);
  const displayNodes = useMemo<FlowNode[]>(() => [...(positions?.groups || []).flatMap(group => {
    const source = nodes.find(node => node.id === group.nodeId);
    return source ? [{ ...source,id: group.id,type: 'parallel_group' as const,position: { x: group.x,y: group.y },width: group.width,height: group.height,selected: false,selectable: false,focusable: false,style: { width: group.width,height: group.height,pointerEvents: 'none' as const },zIndex: -1 }] : [];
  }),...(dragPosition&&positions&&nodes.find(node=>node.id===dragPosition.id)?[{...nodes.find(node=>node.id===dragPosition.id)!,id:'__drag_origin__',type:'placeholder' as const,position:{x:positions.nodes.get(dragPosition.id)!.x,y:previewY(positions.nodes.get(dragPosition.id)!.y)},draggable:false,selectable:false,focusable:false,selected:false}]:[]),...nodes], [nodes,positions,dragPosition,dropEdge]);
  const edges = useMemo<FlowEdge[]>(() => positions ? renderedGraph.edges.map(edge => {
    const position = positions.edges.get(edge.id)!;
    const actual = props.executedEdges.has(edge.id), selected = props.selectedEdgeId === edge.id;
    const highlighted = dropEdge ? dropEdge===edge.id : props.selectedEdgeId ? selected : edge.from === props.selectedNodeId;
    return { id: edge.id, ariaLabel: `${renderedGraph.nodes.find(node=>node.id===edge.from)?.title || '当前节点'}至${renderedGraph.nodes.find(node=>node.id===edge.to)?.title || '后续节点'}`, source: edge.from, sourceHandle: `out:${edge.id}`, target: edge.to, targetHandle: `in:${edge.to}`, type: 'workflow', deletable: false, reconnectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: actual ? '#389e0d' : highlighted ? '#1677ff' : '#aab4c1' },
      data: { designer: props.designer, edge, expression: edge.expression ? formatWorkflowCondition(edge.expression, renderedGraph.variables) : '', points: position.points.map(point=>({...point,y:previewY(point.y)})), label: {...position.label,y:previewY(position.label.y)}, actual, highlighted, selected, onReorderBranch:props.onReorderBranch?(from,to)=>latest.current.onReorderBranch?.(edge.from,from,to):undefined,onSelect: () => latest.current.onSelectEdge(edge.id), ...(props.onInsertEdge && !['return','resubmit'].includes(edge.kind) ? { insertionOptions: props.insertionOptions?.filter(option => option.kind !== 'parallel' || !renderedGraph.nodes.some(node => node.parallel && (node.id === edge.from || node.parallel.branchNodeIds.includes(edge.from)))), onInsert: (template?: string) => latest.current.onInsertEdge?.(edge.id, template) } : {}) } };
  }) : [], [renderedGraph, props.executedEdges, props.selectedNodeId, props.selectedEdgeId, props.onInsertEdge, props.insertionOptions, positions, props.designer,props.onReorderBranch,dropEdge]);
  useEffect(() => {
    if (!instance || !positions) return;
    let active = true;
    let focusFrame: number | undefined;
    let navigation = 0;
    const startNavigation = () => {
      if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
      focusFrame = undefined;
      return ++navigation;
    };
    interruptNavigation.current = startNavigation;
    const locate = (id: string, focus = false) => {
      const point = positions.nodes.get(id);
      if (!active || !point) return;
      const currentNavigation = startNavigation();
      void instance.setCenter(point.x + point.width / 2, point.y + point.height / 2, { zoom: .95, duration: focus ? 0 : 180 }).then(() => {
        if (active && currentNavigation === navigation && focus) focusFrame = requestAnimationFrame(() => container.current?.querySelector<HTMLButtonElement>(`.react-flow__node[data-id="${CSS.escape(id)}"] button`)?.focus({ preventScroll: true }));
      });
    };
    ensureVisible.current = id => {
      const point = positions.nodes.get(id), element = container.current;
      if (point && element && !workflowNodeIsReadable(point, instance.getViewport(), { width: element.clientWidth, height: element.clientHeight })) locate(id);
    };
    latest.current.onReady({ locate, fit: () => { startNavigation(); void instance.fitView({ padding: .18, maxZoom: 1, minZoom: .025, duration: 200 }); }, zoomBy: direction => { startNavigation(); void instance.zoomTo(Math.max(.025, Math.min(1.6, instance.getZoom() * (direction > 0 ? 1.25 : .8))), { duration: 120 }); } });
    const graph = renderedGraph;
    const target = [props.designer ? graph.startAt : latest.current.selectedNodeId, graph.startAt, graph.nodes[0]?.id].find(id => id && positions.nodes.has(id));
    const spine = positions.nodes.get(graph.startAt);
    if (props.designer && initialized.current === instance) {
      const previousSpine = layoutSpine.current;
      if (spine && previousSpine?.instance === instance) {
        const viewport = instance.getViewport();
        const delta = previousSpine.x - (spine.x + spine.width / 2);
        if (Math.abs(delta) > .5) void instance.setViewport({ ...viewport, x: viewport.x + delta * viewport.zoom });
      }
      // Preserve the camera after a structural edit; explicit selection and
      // locate actions own navigation, not every layout recalculation.
    } else if (props.startAtTop && target && container.current) {
      const point = positions.nodes.get(target)!;
      const zoom = .9;
      // Leave room for the floating tools, then show the following nodes below.
      // Explicit locate/fit actions still use their ordinary viewport behavior.
      void instance.setViewport({ x: container.current.clientWidth / 2 - (point.x + point.width / 2) * zoom,
        y: (props.designer ? 24 : 110) - point.y * zoom, zoom });
    } else void instance.fitView({ padding: .2, maxZoom: 1, minZoom: .025 }).then(() => {
      if (!active || navigation !== 0 || instance.getZoom() >= workflowReadableZoom) return;
      if (target) locate(target);
    });
    initialized.current = instance;
    if (spine) layoutSpine.current = { instance, x: spine.x + spine.width / 2 };
    return () => { active = false; if (focusFrame !== undefined) cancelAnimationFrame(focusFrame); ensureVisible.current = null; interruptNavigation.current = null; latest.current.onReady(null); };
  }, [instance, positions, renderedGraph, props.startAtTop, props.designer]);
  useEffect(() => {
    const element = container.current;
    if (!props.designer || !instance || !element) return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.clientWidth;
      const delta = nextWidth - width;
      width = nextWidth;
      if (!nextWidth || Math.abs(delta) < .5) return;
      const viewport = instance.getViewport();
      void instance.setViewport({ ...viewport, x: viewport.x + delta / 2 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [instance, props.designer]);
  useEffect(() => { ensureVisible.current?.(props.selectedNodeId); }, [props.selectedNodeId]);
  const dropTarget=(input:MouseEvent|TouchEvent,nodeId:string)=>{
    const event="touches" in input ? input.touches[0] || input.changedTouches[0] : input;
    if(!event)return undefined;
    if(!positions||!instance||!container.current||cancelledDrag.current)return undefined;
    const bounds=container.current.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return undefined;
    const candidates=renderedGraph.edges.filter(edge=>legalSlots.current.has(edge.id)).map(edge=>{
      const point=positions.edges.get(edge.id)!.label;
      const screen=instance.flowToScreenPosition(point);
      return {id:edge.id,distance:Math.hypot(Math.max(0,Math.abs(event.clientX-screen.x)-110*instance.getZoom()),Math.max(0,Math.abs(event.clientY-screen.y)-18*instance.getZoom()))};
    }).filter(slot=>slot.distance<64).sort((a,b)=>a.distance-b.distance);
    const retained=candidates.find(slot=>slot.id===dropEdge);
    return retained&&retained.distance<(candidates[0]?.distance || 0)+12?retained.id:candidates[0]?.id;
  };
  if (layoutState.graph === graph && layoutState.error) throw layoutState.error;
  if (!positions) return <div ref={container} className="oxa-workflow-reactflow"><div className="oxa-workflow-canvas-loading"><Skeleton active title paragraph={{ rows: 4 }} /></div></div>;
  const start = positions.nodes.get(renderedGraph.startAt);
  const initialViewport = initialized.current?.getViewport() || (props.designer && start && container.current ? { x: container.current.clientWidth / 2 - (start.x + start.width / 2) * .9, y: 24 - start.y * .9, zoom: .9 } : undefined);
  return <div ref={container} className="oxa-workflow-reactflow">
    {dragPosition&&<div className="oxa-workflow-drag-status" role="status" aria-live="polite">{dropEdge?'松开完成移动；按 Esc 取消':legalSlots.current.size?'靠近虚线插槽放置；按 Esc 取消':'当前没有合法投放位置，请检查退回或分支依赖'}</div>}
    {props.designer&&<button type="button" className="oxa-workflow-minimap-toggle" aria-pressed={miniMap} onClick={()=>setMiniMap(value=>!value)}>{miniMap?'收起小地图':'小地图'}</button>}
    {keyboardMove&&<div className="oxa-workflow-keyboard-move" role="dialog" aria-label="选择节点投放位置"><strong>选择放置位置</strong><button onClick={()=>setKeyboardMove(undefined)}>取消</button><div>{renderedGraph.edges.filter(edge=>edge.from!==keyboardMove&&edge.to!==keyboardMove&&!['return','resubmit','reject'].includes(edge.kind)&&props.isMoveAllowed?.(keyboardMove,edge.id)!==false).map(edge=><button key={edge.id} onClick={()=>{latest.current.onMoveNode?.(keyboardMove,edge.id);setKeyboardMove(undefined);}}>插入到{renderedGraph.nodes.find(node=>node.id===edge.from)?.title || '发起'}之后</button>)}</div></div>}
    <ReactFlow<FlowNode, FlowEdge> nodes={displayNodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultViewport={initialViewport} onInit={setInstance}
      nodesDraggable={!!props.onMoveNode} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} edgesReconnectable={false} elementsSelectable={false}
      deleteKeyCode={null} disableKeyboardA11y selectionOnDrag={false} selectionKeyCode={null} zoomOnDoubleClick={false}
      minZoom={.025} maxZoom={1.6} onlyRenderVisibleElements onMoveStart={event => { if (event) interruptNavigation.current?.(); }} onMoveEnd={(_event, viewport) => props.onZoom(viewport.zoom)}
      nodeDragThreshold={6} autoPanOnNodeDrag
      onNodeDragStart={(_event,node)=>{cancelledDrag.current=false;dragActive.current=true;legalSlots.current=new Set(renderedGraph.edges.filter(edge=>edge.from!==node.id&&edge.to!==node.id&&!['return','resubmit','reject'].includes(edge.kind)&&latest.current.isMoveAllowed?.(node.id,edge.id)!==false).map(edge=>edge.id));setDragPosition({id:node.id,...node.position});}}
      onNodesChange={changes=>{if(!cancelledDrag.current)for(const change of changes)if(change.type==='position'&&change.position)setDragPosition({id:change.id,...change.position});}}
      onNodeDrag={(event,node)=>{if(cancelledDrag.current)return;setDragPosition({id:node.id,...node.position});setDropEdge(dropTarget(event,node.id));}}
      onNodeDragStop={(event,node)=>{const target=dropTarget(event,node.id);setDragPosition(undefined);setDropEdge(undefined);if(target&&!cancelledDrag.current)latest.current.onMoveNode?.(node.id,target);dragActive.current=false;}}
      onEdgeClick={(_event, edge) => props.onSelectEdge(edge.id)} aria-label={props.onInsertEdge ? "流程设计画布" : "只读流程画布"}>
      {dragPosition&&<EdgeLabelRenderer>{renderedGraph.edges.filter(edge=>legalSlots.current.has(edge.id)).map(edge=>{
        const point=positions.edges.get(edge.id)!.label,active=dropEdge===edge.id;
        return <div key={edge.id} className={`oxa-workflow-drop-slot ${active?'active':''}`} style={{transform:`translate(-50%, -50%) translate(${point.x}px, ${point.y+(active?gapHeight/2:0)}px)`,height:active?gapHeight-16:36}}>{active?'松开放在这里':'可放置'}</div>;
      })}</EdgeLabelRenderer>}
      <Background color="#d6dde5" gap={props.designer ? 16 : 22} size={1} />
      {!dragPosition&&(!props.designer||miniMap)&&<MiniMap pannable zoomable position="bottom-right" aria-label="流程缩略导航" style={{ width: props.designer ? 116 : 150, height: props.designer ? 94 : 94 }} nodeColor={node => node.selected ? '#1677ff' : '#b7c2cf'} maskColor="rgba(243, 246, 250, .72)" />}
    </ReactFlow>
  </div>;
}
