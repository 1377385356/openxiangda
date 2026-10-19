import { projectWorkflowGraph, validateWorkflowDesignerDocument, validateWorkflowBusinessSteps, type WorkflowDefinition, type WorkflowGraphEdge } from 'openxiangda-contracts/browser';

function changeTarget(definition: WorkflowDefinition, edge: WorkflowGraphEdge, target: string) {
  const node=definition.nodes[edge.from];
  if(!node||!definition.nodes[target])throw new Error('路径目标不存在');
  if(node.kind==='approval'&&edge.kind==='approve')node.onApprove=target;
  else if(node.kind==='approval'&&edge.kind==='reject')node.onReject=target;
  else if('next' in node&&edge.kind==='next')node.next=target;
  else if(node.kind==='condition'&&edge.kind==='default')node.otherwise=target;
  else if((node.kind==='condition'||node.kind==='parallel')&&edge.kind==='branch'&&edge.priority)node.branches[edge.priority-1]!.target=target;
  else throw new Error('此路径请在对应分支或退回设置中修改');
}
function checked(definition: WorkflowDefinition) {
  const errors=[...validateWorkflowDesignerDocument(definition),...validateWorkflowBusinessSteps(definition)];
  if(errors.length)throw Object.assign(new Error('此次调整未应用：'+[...new Set(errors.map(code=>code.includes('CYCLE')?'路径会形成循环':code.includes('UNREACHABLE')?'部分节点将无法到达':code.includes('PARALLEL')?'并行分支边界不完整':code.includes('STEP')?'业务步骤依赖顺序不满足':'流程结构校验未通过'))].join('；')),{diagnostics:errors});
  return definition;
}
export function reconnectWorkflowCanvasEdge(source: WorkflowDefinition, edgeId: string, target: string) {
  const graph=projectWorkflowGraph(source,'edit');
  const edge=graph.edges.find(edge=>edge.id===edgeId);
  if(!edge||!['approve','reject','next'].includes(edge.kind))throw new Error('请选择普通流转路径');
  const next=structuredClone(source);
  changeTarget(next,edge,target);
  return checked(next);
}
/** A bounded, single-entry region. Shared continuation is not part of the moving group. */
export function workflowCanvasMoveRegion(source: WorkflowDefinition,nodeId:string) {
  const node=source.nodes[nodeId],graph=projectWorkflowGraph(source,'edit');
  const forward=graph.edges.filter(edge=>!['return','resubmit','reject'].includes(edge.kind));
  if(!node)throw new Error('节点不存在');
  if(['approval','handle','cc','action'].includes(node.kind))return {members:new Set([nodeId]),exit:forward.find(edge=>edge.from===nodeId)?.to};
  if(node.kind==='parallel'){
    const region=graph.nodes.find(item=>item.id===nodeId)?.parallel;
    if(!region)throw new Error('并行组边界尚未确定');
    return {members:new Set([nodeId,region.joinNodeId,...region.branchNodeIds]),exit:forward.find(edge=>edge.from===region.joinNodeId)?.to};
  }
  if(node.kind!=='condition')throw new Error('此节点不支持移动');
  const destinations=[...node.branches.map(branch=>branch.target),node.otherwise];
  const reach=(start:string)=>{const distances=new Map<string,number>([[start,0]]),queue=[start];while(queue.length){const id=queue.shift()!;for(const edge of forward.filter(edge=>edge.from===id))if(!distances.has(edge.to)){distances.set(edge.to,distances.get(id)!+1);queue.push(edge.to);}}return distances;};
  const paths=destinations.map(reach);
  const common=[...paths[0]!.keys()].filter(id=>paths.every(path=>path.has(id)));
  common.sort((a,b)=>paths.reduce((sum,path)=>sum+path.get(a)!,0)-paths.reduce((sum,path)=>sum+path.get(b)!,0));
  const exit=common[0];if(!exit)throw new Error('条件组没有唯一共同后继，暂不支持整体移动');
  const members=new Set([nodeId]),queue=[...destinations];
  while(queue.length){const id=queue.pop()!;if(id===exit||members.has(id))continue;members.add(id);queue.push(...forward.filter(edge=>edge.from===id).map(edge=>edge.to));}
  return {members,exit};
}

/** Same pure transformation validates drag previews, keyboard moves and the final drop. */
export function moveWorkflowCanvasNode(source: WorkflowDefinition,nodeId:string,edgeId:string) {
  const graph=projectWorkflowGraph(source,'edit'),node=source.nodes[nodeId];
  const edge=edgeId==='__oxa_designer_start_edge__'?{id:edgeId,from:'__oxa_designer_start__',to:source.startAt,kind:'next'} as WorkflowGraphEdge:graph.edges.find(edge=>edge.id===edgeId);
  if(!node||!edge||['return','resubmit','reject'].includes(edge.kind))throw new Error('请选择有效的前向路径');
  const {members,exit}=workflowCanvasMoveRegion(source,nodeId);
  if(!exit||members.has(edge.from)||members.has(edge.to)||edge.to===nodeId)throw new Error('不能放入自身或相邻原位置');
  const incoming=graph.edges.filter(edge=>members.has(edge.to)&&!members.has(edge.from)&&!['return','resubmit'].includes(edge.kind));
  if(incoming.some(edge=>edge.to!==nodeId||edge.kind==='reject')||incoming.length>1)throw new Error('此区域有多个入口，暂不能整体移动');
  const exits=graph.edges.filter(edge=>members.has(edge.from)&&!members.has(edge.to)&&!['return','resubmit','reject'].includes(edge.kind));
  if(!exits.length||exits.some(edge=>edge.to!==exit))throw new Error('此区域有多个后继，暂不能整体移动');
  const region=(id:string)=>graph.nodes.filter(n=>n.parallel?.branchNodeIds.includes(id)&&!members.has(n.id)).map(n=>n.id).sort().join('/');
  if(region(nodeId)!==region(edge.from)||region(nodeId)!==region(edge.to))throw new Error('不能跨越并行分支边界移动节点');
  const next=structuredClone(source);
  for(const incomingEdge of incoming)changeTarget(next,incomingEdge,exit);
  if(next.startAt===nodeId)next.startAt=exit;
  if(edgeId==='__oxa_designer_start_edge__')next.startAt=nodeId;else changeTarget(next,edge,nodeId);
  for(const successor of exits)changeTarget(next,successor,edge.to);
  return checked(next);
}

export function reorderWorkflowCanvasBranch(source:WorkflowDefinition,nodeId:string,from:number,to:number){
  const node=source.nodes[nodeId];if(!node||!['condition','parallel'].includes(node.kind)||!('branches' in node)||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=node.branches.length||to>=node.branches.length)throw new Error('默认分支固定最后，只能调整有效条件分支');
  const next=structuredClone(source),target=next.nodes[nodeId]!;
  const reorder=<T,>(values:T[])=>{const result=[...values];const [moved]=result.splice(from,1);result.splice(to,0,moved!);return result;};
  if(target.kind==='condition')target.branches=reorder(target.branches);
  else if(target.kind==='parallel')target.branches=reorder(target.branches);
  return checked(next);
}
