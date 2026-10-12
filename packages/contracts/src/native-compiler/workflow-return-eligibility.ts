import { inspectWorkflowParallel, workflowForwardTargets } from './workflow-parallel.js';
import type { WorkflowDefinition } from '../types.js';
/** Configuration eligibility, not proof that a specific instance visited the target. */
export function workflowReturnEligibility(definition: Pick<WorkflowDefinition,'nodes'|'startAt'>, sourceId: string, targetId: string): { allowed:boolean; reason?:string } {
  const nodes=definition.nodes,source=nodes[sourceId],target=nodes[targetId];
  if(!source||!['approval','handle'].includes(source.kind)||!target||!['approval','handle','correction'].includes(target.kind)||sourceId===targetId)return {allowed:false,reason:'不是可退回的办理节点'};
  const regions=inspectWorkflowParallel(definition).regions;
  for(const region of regions) {
    const sourceBranch=region.branches.find(branch=>branch.nodeIds.includes(sourceId));
    const targetBranch=region.branches.find(branch=>branch.nodeIds.includes(targetId));
    if(sourceBranch?.id!==targetBranch?.id && (sourceBranch||targetBranch)) return {allowed:false,reason:'并行分支内只能退回本分支的节点，不能跨越汇合边界'};
  }
  const pending=[targetId],visited=new Set<string>();
  while(pending.length){const id=pending.shift()!;if(id===sourceId)return {allowed:true};if(visited.has(id))continue;visited.add(id);const node=nodes[id];if(node)pending.push(...workflowForwardTargets(node).filter(next=>!visited.has(next)));}
  return {allowed:false,reason:'该节点不在本节点之前的可达流转路径上'};
}
