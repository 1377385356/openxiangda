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
/** Move a whole node with its identity, binding and return policy intact. */
export function moveWorkflowCanvasNode(source: WorkflowDefinition,nodeId:string,edgeId:string) {
  const graph=projectWorkflowGraph(source,'edit'),node=source.nodes[nodeId];
  const edge=graph.edges.find(edge=>edge.id===edgeId);
  if(!node||!['approval','handle','cc','action'].includes(node.kind)||!edge||['return','resubmit','reject'].includes(edge.kind)||edge.from===nodeId||edge.to===nodeId)throw new Error('请将普通节点移动到另一条有效的前向路径');
  const successors=graph.edges.filter(edge=>edge.from===nodeId&&['approve','next'].includes(edge.kind));
  const incoming=graph.edges.filter(edge=>edge.to===nodeId&&!['return','resubmit'].includes(edge.kind));
  if(successors.length!==1||incoming.length>1||incoming.some(edge=>edge.kind==='reject'))throw new Error('此节点有多个入口，请先明确调整相关路径');
  const region=(id:string)=>graph.nodes.filter(n=>n.parallel?.branchNodeIds.includes(id)).map(n=>n.id).sort().join('/');
  if(region(nodeId)!==region(edge.from)||region(nodeId)!==region(edge.to))throw new Error('不能跨越并行分支边界移动节点');
  const next=structuredClone(source),successor=successors[0]!;
  for(const incomingEdge of incoming)changeTarget(next,incomingEdge,successor.to);
  if(next.startAt===nodeId)next.startAt=successor.to;
  changeTarget(next,edge,nodeId);
  changeTarget(next,successor,edge.to);
  return checked(next);
}
