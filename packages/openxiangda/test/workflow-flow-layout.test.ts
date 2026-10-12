import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowGraphProjection } from 'openxiangda-contracts/browser';
import { workflowFlowLayout } from '../src/browser/components/workflow/workflow-flow-layout';

const graph = (nodes: WorkflowGraphProjection['nodes'], edges: WorkflowGraphProjection['edges']): WorkflowGraphProjection => ({
  schemaVersion: 'openxiangda.workflow-graph/v2', workflowCode: 'layout', definitionDigest: 'layout-test', startAt: nodes[0]!.id,
  fixedTopology: true, branchStrategy: 'first_match', nodes, edges, variables: [], logic: [], diagnostics: [],
});
const edge = (from: string, to: string, kind: 'approve' | 'reject' | 'branch' | 'default' = 'approve') => ({ id: `${from}:${kind}:${to}`, from, to, kind, label: kind, variablePaths: [] });

for (const [name, source] of [
  ['branching and converging decisions', graph([
    { id: 'route', kind: 'condition', title: '分流' }, ...['a', 'b', 'c'].map(id => ({ id, kind: 'approval', title: id })),
    ...['approved', 'rejected'].map(id => ({ id, kind: 'end', title: id })),
  ], [...['a', 'b', 'c'].map(id => edge('route', id, id === 'c' ? 'default' : 'branch')), ...['a', 'b', 'c'].flatMap(id => [edge(id, 'approved'), edge(id, 'rejected', 'reject')])])],
  ['100 nodes with shared rejection target', graph([
    ...Array.from({ length: 98 }, (_, index) => ({ id: `review-${index}`, kind: 'approval', title: `审批 ${index}` })),
    { id: 'approved', kind: 'end', title: '通过' }, { id: 'rejected', kind: 'end', title: '拒绝' },
  ], Array.from({ length: 98 }, (_, index) => [edge(`review-${index}`, index === 97 ? 'approved' : `review-${index + 1}`), edge(`review-${index}`, 'rejected', 'reject')]).flat())],
] as const) test(`orthogonal layout preserves every edge and keeps nodes apart: ${name}`, async () => {
  const result = await workflowFlowLayout(source);
  assert.equal(result.nodes.size, source.nodes.length);
  assert.equal(result.edges.size, source.edges.length);
  for (const input of source.edges) {
    const points = result.edges.get(input.id)!.points;
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1]!, next = points[index]!;
      assert.ok(Math.abs(previous.x - next.x) < .01 || Math.abs(previous.y - next.y) < .01, input.id);
    }
    const from = result.nodes.get(input.from)!, to = result.nodes.get(input.to)!;
    const port = from.outputs.find(port => port.id === `out:${input.id}`)!;
    assert.equal(points[0]!.x, from.x + port.x);
    assert.equal(points[0]!.y, from.y + from.height);
    assert.equal(points.at(-1)!.x, to.x + to.input.x);
    assert.equal(points.at(-1)!.y, to.y);
  }
  const nodes = [...result.nodes.values()];
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    const x = nodes[a]!, y = nodes[b]!;
    assert.ok(x.x + x.width <= y.x || y.x + y.width <= x.x || x.y + x.height <= y.y || y.y + y.height <= x.y, 'nodes overlap');
  }
});


test('correction outside lanes preserve forward ranks and orthogonal endpoints', async () => {
  const forward = graph([{ id: 'route', kind: 'condition', title: '分支' }, { id: 'review', kind: 'approval', title: '审核' }, { id: 'end', kind: 'end', title: '结束' }],
    [edge('route', 'review', 'branch'), edge('review', 'end')]);
  const before = await workflowFlowLayout(forward);
  const correction = { id: 'correct', kind: 'correction', title: '本人补正' };
  const returns: WorkflowGraphProjection['edges'] = [
    { id: 'review:return:correct', from: 'review', to: 'correct', kind: 'return', label: '退回补正', variablePaths: [] },
    { id: 'correct:resubmit', from: 'correct', to: 'route', kind: 'resubmit', label: '重新流转', variablePaths: [] },
  ];
  const result = await workflowFlowLayout({ ...forward, nodes: [...forward.nodes, correction], edges: [...forward.edges, ...returns] });
  for (const node of forward.nodes) assert.equal(result.nodes.get(node.id)!.y, before.nodes.get(node.id)!.y);
  for (const input of returns) {
    const points = result.edges.get(input.id)!.points;
    const source = result.nodes.get(input.from)!, target = result.nodes.get(input.to)!;
    assert.equal(points[0]!.x, source.x + source.outputs.find(port => port.id === `out:${input.id}`)!.x);
    assert.deepEqual(points.at(-1), { x: target.x + target.input.x, y: target.y });
    for (let i = 1; i < points.length; i++) assert.ok(points[i]!.x === points[i - 1]!.x || points[i]!.y === points[i - 1]!.y);
  }
  assert.ok(result.nodes.get('correct')!.x > Math.max(...forward.nodes.map(node => { const p = result.nodes.get(node.id)!; return p.x + p.width; })));
});


test('designer starts and outline follow execution order without altering the immutable projection', async () => {
  const { workflowDesignerDisplayGraph, workflowDesignerOutlineNodes } = await import('../src/browser/components/workflow/workflow-designer-presentation');
  const source = graph([{id:'done',kind:'end',title:'通过',outcome:'approved'}, {id:'rejected',kind:'end',title:'拒绝',outcome:'rejected'}, {id:'a',kind:'approval',title:'部门'}, {id:'b',kind:'approval',title:'财务'}], [edge('a','b'),edge('b','done'),edge('a','rejected','reject'),edge('b','rejected','reject')]);
  source.startAt='a';const before=structuredClone(source);
  const displayed=workflowDesignerDisplayGraph(source);
  assert.deepEqual(workflowDesignerOutlineNodes(displayed).map(node=>node.title),['发起','部门','财务','通过']);
  assert.deepEqual(source,before);
  const positioned=await workflowFlowLayout(displayed,{designer:true});
  for(const e of displayed.edges) {
    const points=positioned.edges.get(e.id)!.points;
    for(let index=1;index<points.length;index++) assert.ok(points[index]!.x===points[index-1]!.x||points[index]!.y===points[index-1]!.y);
  }
  const start=positioned.nodes.get(displayed.startAt)!,first=positioned.nodes.get('a')!;
  const startEdge=positioned.edges.get(displayed.edges[0]!.id)!;
  assert.ok(first.y-start.y-start.height<=40,'ordinary connectors do not reserve invisible edge-label layers');
  assert.ok(startEdge.label.y>start.y+start.height&&startEdge.label.y<first.y,'insertion control remains in the connector gap');
  const spine=[...positioned.nodes.values()].map(node=>node.x+node.width/2);
  assert.ok(Math.max(...spine)-Math.min(...spine)<1,'the start/end pills align to the same spine as tasks');
});

test('return inspection projects only its canonical targets without changing the forward graph', async () => {
  const { workflowDesignerDisplayGraph, workflowDesignerOutlineNodes } = await import('../src/browser/components/workflow/workflow-designer-presentation');
  const source = graph([{id:'a',kind:'approval',title:'部门'},{id:'b',kind:'approval',title:'财务'},{id:'c',kind:'approval',title:'确认'},{id:'done',kind:'end',title:'结束'}], [edge('a','b'),edge('b','c'),edge('c','done')]);
  source.startAt='a'; const before=structuredClone(source);
  const ordinary=workflowDesignerDisplayGraph(source);
  const inspected=workflowDesignerDisplayGraph(source,'c',['a','b','missing']);
  assert.deepEqual(inspected.edges.filter(edge=>edge.kind==='return').map(edge=>[edge.from,edge.to]),[['c','a'],['c','b']]);
  assert.deepEqual(workflowDesignerDisplayGraph(source),ordinary);
  assert.deepEqual(workflowDesignerOutlineNodes(inspected).map(node=>node.id),workflowDesignerOutlineNodes(ordinary).map(node=>node.id));
  assert.deepEqual(source,before);
  const positioned=await workflowFlowLayout(inspected,{designer:true});
  for(const edge of inspected.edges.filter(edge=>edge.kind==='return')) {
    const points=positioned.edges.get(edge.id)!.points;
    assert.ok(points.some(point=>point.x<positioned.nodes.get('a')!.x),'return routes occupy an outside lane');
    for(let i=1;i<points.length;i++) assert.ok(points[i]!.x===points[i-1]!.x||points[i]!.y===points[i-1]!.y);
  }
});

test('parallel outline groups each branch body once and lets branch rows target the owning fork', async () => {
  const { workflowDesignerOutlineRows }=await import('../src/browser/components/workflow/workflow-designer-presentation');
  const graph: any={ schemaVersion: 'openxiangda.workflow-graph/v2',mode: 'draft',startAt: 'fork',variables: [],nodes: [
    { id: 'fork',kind: 'parallel',title: '并行审核',parallel: { joinNodeId: 'join',branchNodeIds: ['a','a2','b'],branchCount: 2 } },
    { id: 'a',kind: 'approval',title: '法务' },{ id: 'a2',kind: 'handle',title: '法务复核' },{ id: 'b',kind: 'approval',title: '财务' },{ id: 'join',kind: 'join',title: '全部完成' },
  ],edges: [
    { id: 'fork:parallel:legal',from: 'fork',to: 'a',kind: 'branch',parallelBranch: true,label: '法务分支',priority: 1 },
    { id: 'fork:parallel:finance',from: 'fork',to: 'b',kind: 'branch',parallelBranch: true,label: '财务分支',priority: 2 },
    { id: 'a:next',from: 'a',to: 'a2',kind: 'next' },{ id: 'a2:next',from: 'a2',to: 'join',kind: 'next' },{ id: 'b:next',from: 'b',to: 'join',kind: 'next' },
  ] };
  const rows=workflowDesignerOutlineRows(graph);
  assert.deepEqual(rows.map(row => [row.title,row.depth]),[['并行审核',0],['法务分支',1],['法务',2],['法务复核',2],['财务分支',1],['财务',2],['全部完成',0]]);
  assert.equal(new Set(rows.map(row => row.id)).size,rows.length);
  assert.deepEqual(rows.filter(row => row.edgeId).map(row => row.nodeId),['fork','fork']);
});
