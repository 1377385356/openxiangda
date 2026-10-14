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

/** Structured forks are atomic blocks in their enclosing layout. Conditions use
 * their nearest common post-dominator, never an inferred executable graph edge.
 * A branch's local merge is virtual when shared with its enclosing fork. */
export async function layoutDesignerRegions(
  graph: WorkflowGraphProjection,
  positions: WorkflowFlowPositions,
  engine: { layout: (graph: ElkNode) => Promise<ElkNode> },
  layoutOptions: LayoutOptions,
): Promise<WorkflowFlowPositions> {
  type Edge = WorkflowGraphProjection['edges'][number];
  const forward = graph.edges.filter(edge => !['return', 'resubmit'].includes(edge.kind));
  const centers = (node: NodePosition): NodePosition => ({ ...node,
    input: { ...node.input, x: node.width / 2 },
    outputs: node.outputs.map(port => ({ ...port, x: node.width / 2 })),
  });
  const translateRoute = (route: WorkflowFlowPositions['edges'] extends Map<string, infer R> ? R : never, dx: number, dy: number) => ({
    points: route.points.map(point => ({ x: point.x + dx, y: point.y + dy })),
    label: { x: route.label.x + dx, y: route.label.y + dy },
  });
  async function scope(ids: Set<string>, edges: Edge[]): Promise<WorkflowFlowPositions> {
    const outgoing = new Map([...ids].map(id => [id, edges.filter(edge => edge.from === id)]));
    const postdominators = new Map<string, Set<string>>(), visiting = new Set<string>();
    function postdom(id: string): Set<string> {
      if (postdominators.has(id)) return postdominators.get(id)!;
      if (visiting.has(id)) return new Set(); // Unstructured cycles stay with ELK.
      visiting.add(id);
      const successors = (outgoing.get(id) || []).map(edge => postdom(edge.to));
      const common = successors.length ? [...successors[0]!].filter(next => successors.every(set => set.has(next))) : [];
      visiting.delete(id);
      const result = new Set([id, ...common]); postdominators.set(id, result); return result;
    }
    function membersUntil(entry: string, join: string): Set<string> {
      const members = new Set<string>(), pending = [entry];
      while (pending.length) {
        const id = pending.pop()!;
        if (id === join || members.has(id)) continue;
        members.add(id); pending.push(...(outgoing.get(id) || []).map(edge => edge.to));
      }
      return members;
    }
    const candidates = graph.nodes.filter(node => ids.has(node.id)).flatMap(fork => {
      const branches = [...(outgoing.get(fork.id) || [])].sort((a,b) => Number(a.kind === 'default') - Number(b.kind === 'default') || (a.priority || 0) - (b.priority || 0));
      if (!(fork.parallel || fork.kind === 'condition') || branches.length < 2) return [];
      if (branches.some(edge => !['branch','default'].includes(edge.kind))) return [];
      const common = [...postdom(branches[0]!.to)].filter(id => id !== fork.id && branches.every(edge => postdom(edge.to).has(id)));
      // The nearest common post-dominator dominates all later common merges.
      const joinId = fork.parallel?.joinNodeId || common.find(id => common.every(other => postdom(id).has(other)));
      if (!joinId || !ids.has(joinId) || !common.includes(joinId)) return [];
      const bodies = branches.map(edge => ({ edge, members: membersUntil(edge.to,joinId) }));
      const seen = new Set<string>();
      for (const body of bodies) for (const id of body.members) {
        if (id === fork.id || seen.has(id)) return []; // Crossing/shared bodies are not structured lanes.
        seen.add(id);
      }
      const all = new Set([fork.id,joinId,...seen]);
      if (edges.some(edge => all.has(edge.to) && edge.to !== fork.id && !all.has(edge.from))) return [];
      return [{ fork,joinId,bodies,all }];
    });
    const regions = candidates.filter(candidate => !candidates.some(parent => parent !== candidate && parent.all.size > candidate.all.size && parent.joinId !== candidate.fork.id && parent.all.has(candidate.fork.id)));
    const owner = new Map<string,string>();
    const blocks = new Map<string, { width: number; height: number; layout: WorkflowFlowPositions }>();
    for (const region of regions) {
      const fork = positions.nodes.get(region.fork.id)!, join = positions.nodes.get(region.joinId)!;
      const branches = [];
      for (const body of region.bodies) {
        const branchIds = new Set([...body.members,region.joinId]);
        const branchEdges = edges.filter(edge => body.members.has(edge.from) && branchIds.has(edge.to));
        const layout = await scope(branchIds,branchEdges);
        const entry = body.edge.to === region.joinId ? undefined : layout.nodes.get(body.edge.to);
        const center = entry ? entry.x + entry.width / 2 : layout.nodes.get(region.joinId)!.x + join.width / 2;
        const xs = [...layout.nodes.entries()].flatMap(([id,node]) => id === region.joinId ? [] : [node.x,node.x+node.width]);
        for (const [id,route] of layout.edges) {
          xs.push(...route.points.map(point => point.x));
          if (['branch','default'].includes(branchEdges.find(edge => edge.id === id)!.kind)) xs.push(route.label.x-branchCardWidth/2,route.label.x+branchCardWidth/2);
        }
        branches.push({ ...body,layout,entry,center,radius: Math.max(branchCardWidth/2,...xs.map(x => Math.abs(x-center))), nested: candidates.some(candidate => body.members.has(candidate.fork.id)) });
      }
      const laneWidth = Math.max(branchCardWidth,...branches.map(branch => branch.radius*2));
      const width = branches.length*(laneWidth+laneGap)-laneGap;
      const layout: WorkflowFlowPositions = { nodes: new Map(),edges: new Map() };
      const forkWidth = region.fork.parallel ? width : fork.width;
      layout.nodes.set(region.fork.id,centers({ ...fork,x:(width-forkWidth)/2,y:0,width:forkWidth }));
      const firstY = fork.height+branchGap;
      let mergeY = firstY+nodeGap/2;
      for (const [index,branch] of branches.entries()) {
        const x = laneWidth/2+index*(laneWidth+laneGap);
        const dx=x-branch.center, dy=firstY-(branch.entry?.y || branch.layout.nodes.get(region.joinId)!.y);
        for (const [id,node] of branch.layout.nodes) if (id !== region.joinId) layout.nodes.set(id,{...node,x:node.x+dx,y:node.y+dy});
        for (const [id,route] of branch.layout.edges) layout.edges.set(id,translateRoute(route,dx,dy));
        mergeY=Math.max(mergeY,branch.layout.nodes.get(region.joinId)!.y+dy-nodeGap/2);
      }
      const joinY=mergeY+nodeGap/2;
      layout.nodes.set(region.joinId,centers({ ...join,x:(width-join.width)/2,y:joinY }));
      for (const [index,branch] of branches.entries()) {
        const x=laneWidth/2+index*(laneWidth+laneGap),start={x:width/2,y:fork.height},end={x:width/2,y:joinY};
        layout.edges.set(branch.edge.id,{
          points:[start,{x:start.x,y:start.y+turnGap},{x,y:start.y+turnGap},...(branch.entry ? [{x,y:firstY}] : [{x,y:mergeY},{x:end.x,y:mergeY},end])],
          label:{x,y:firstY-68},
        });
        for (const edge of edges.filter(edge => branch.members.has(edge.from) && edge.to === region.joinId)) {
          const source=layout.nodes.get(edge.from)!,start={x:source.x+source.width/2,y:source.y+source.height};
          const prior=layout.edges.get(edge.id)!;
          // Preserve an inner fork's bus when its virtual merge is this join.
          const points=branch.nested ? [...prior.points,{x:prior.points.at(-1)!.x,y:mergeY},{x:end.x,y:mergeY},end] : [start,{x:start.x,y:mergeY},{x:end.x,y:mergeY},end];
          layout.edges.set(edge.id,{points,label:branch.nested ? prior.label : {x:start.x,y:(start.y+mergeY)/2}});
        }
      }
      // The merge belongs to the enclosing scope. It may itself be the next
      // fork; owning it in both blocks overwrites its position but leaves the
      // previous block's routes pointing at a now invisible copy.
      layout.nodes.delete(region.joinId);
      for (const id of region.all) if (id !== region.joinId) owner.set(id,region.fork.id);
      blocks.set(region.fork.id,{width,height:joinY,layout});
    }
    const outerEdges=edges.filter(edge => !owner.has(edge.from) || owner.get(edge.from) !== owner.get(edge.to));
    const outer=await engine.layout({id:'workflow-structured-blocks',layoutOptions,
      children:[...ids].filter(id => !owner.has(id) || blocks.has(id)).map(id => {
        const node=positions.nodes.get(id)!,block=blocks.get(id),width=block?.width || node.width,height=block?.height || node.height;
        return {id,width,height,layoutOptions:{'elk.portConstraints':'FIXED_POS'},ports:[
          {id:`in:${id}`,x:width/2,y:0,width:0,height:0,layoutOptions:{'elk.port.side':'NORTH'}},
          ...outerEdges.filter(edge => (owner.get(edge.from) || edge.from) === id).map(edge => ({id:`out:${edge.id}`,x:width/2,y:height,width:0,height:0,layoutOptions:{'elk.port.side':'SOUTH'}})),
        ]};
      }),
      edges:outerEdges.map(edge => ({id:edge.id,sources:[`out:${edge.id}`],targets:[`in:${owner.get(edge.to) || edge.to}`],
        labels:!owner.has(edge.from) && ['branch','default'].includes(edge.kind) ? [{id:`label:${edge.id}`,text:edge.label,width:branchCardWidth,height:64}] : [],
      })),
    });
    const result: WorkflowFlowPositions={nodes:new Map(),edges:new Map()};
    for (const node of outer.children || []) {
      const block=blocks.get(node.id);
      if (block) {
        for (const [id,position] of block.layout.nodes) result.nodes.set(id,{...position,x:position.x+node.x!,y:position.y+node.y!});
        for (const [id,route] of block.layout.edges) result.edges.set(id,translateRoute(route,node.x!,node.y!));
      } else result.nodes.set(node.id,centers({...positions.nodes.get(node.id)!,x:node.x!,y:node.y!}));
    }
    for (const edge of outer.edges || []) {
      const section=edge.sections?.[0];if (!section) throw new Error('WORKFLOW_GRAPH_ROUTING_MISSING');
      const points=[section.startPoint,...section.bendPoints || [],section.endPoint],label=edge.labels?.[0];
      const inner=result.edges.get(edge.id);
      // A region's exit reaches its bottom port; continue the original edge
      // through the outer layout to its one real merge node.
      const routed=inner ? [...inner.points,...points.slice(1)] : points;
      result.edges.set(edge.id,{points:routed,label:inner && ['branch','default'].includes(edges.find(item => item.id === edge.id)!.kind) ? inner.label : label ? {x:label.x!+label.width!/2,y:label.y!+label.height!/2} : connectorMidpoint(routed)});
    }
    return result;
  }
  return scope(new Set(positions.nodes.keys()),forward);
}
