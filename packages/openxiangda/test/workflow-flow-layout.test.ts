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
  assert.ok(first.y-start.y-start.height>=48&&first.y-start.y-start.height<=64,'ordinary connectors leave room for insertion without reserving an invisible label layer');
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

test('designer parallel branch cards stay centred above their own approval cards', async () => {
  const source=graph([{ id: 'fork',kind: 'parallel',title: 'Parallel',parallel: { joinNodeId: 'join',branchNodeIds: ['a','b'],branchCount: 2 } },{ id: 'a',kind: 'approval',title: 'A' },{ id: 'b',kind: 'approval',title: 'B' },{ id: 'join',kind: 'join',title: 'Together' }],
    [{ ...edge('fork','a','branch'),parallelBranch: true },{ ...edge('fork','b','branch'),parallelBranch: true },edge('a','join'),edge('b','join')]);
  const positions=await workflowFlowLayout(source,{ designer: true });
  for (const route of source.edges.filter(route => route.parallelBranch)) {
    const target=positions.nodes.get(route.to)!,label=positions.edges.get(route.id)!.label;
    assert.equal(label.x,target.x+target.width/2);assert.equal(label.y,target.y-68);
  }
});

test('an empty paired parallel region keeps two separate branch cards for inserting its first nodes', async () => {
  const source=graph([{ id: 'fork',kind: 'parallel',title: 'Parallel',parallel: { joinNodeId: 'join',branchNodeIds: [],branchCount: 2 } },{ id: 'join',kind: 'join',title: 'Together' }],
    [{ ...edge('fork','join','branch'),id: 'branch-one',parallelBranch: true },{ ...edge('fork','join','branch'),id: 'branch-two',parallelBranch: true }]);
  const positions=await workflowFlowLayout(source,{ designer: true });
  const first=positions.edges.get('branch-one')!.label,second=positions.edges.get('branch-two')!.label;
  assert.ok(second.x-first.x >= 296);assert.equal(first.y,second.y);
});


function parallelFixture(lengths: number[]): WorkflowGraphProjection {
  const bodies = lengths.flatMap((length, branch) => Array.from({ length }, (_, index) => ({ id: `b${branch}-${index}`, kind: 'approval', title: `Branch ${branch} step ${index}` })));
  const source = graph([
    { id: 'start', kind: 'start', title: 'Start' },
    { id: 'fork', kind: 'parallel', title: 'Parallel', parallel: { joinNodeId: 'join', branchNodeIds: bodies.map(node => node.id), branchCount: lengths.length } },
    ...bodies, { id: 'join', kind: 'join', title: 'Together' }, { id: 'after', kind: 'approval', title: 'After' }, { id: 'done', kind: 'end', title: 'Done' },
  ], [edge('start', 'fork'), ...lengths.flatMap((length, branch) => [
    { ...edge('fork', length ? `b${branch}-0` : 'join', 'branch'), id: `branch-${branch}`, parallelBranch: true, priority: branch + 1 },
    ...Array.from({ length }, (_, index) => edge(`b${branch}-${index}`, index + 1 < length ? `b${branch}-${index + 1}` : 'join')),
  ]), edge('join', 'after'), edge('after', 'done')]);
  return source;
}

function assertRoutedWithoutOverlap(source: WorkflowGraphProjection, positions: Awaited<ReturnType<typeof workflowFlowLayout>>) {
  for (const edge of source.edges) {
    const route = positions.edges.get(edge.id)!;
    const from = positions.nodes.get(edge.from)!, to = positions.nodes.get(edge.to)!;
    assert.deepEqual(route.points[0], { x: from.x + from.outputs.find(port => port.id === `out:${edge.id}`)!.x, y: from.y + from.height }, edge.id);
    assert.deepEqual(route.points.at(-1), { x: to.x + to.input.x, y: to.y }, edge.id);
    for (let index = 1; index < route.points.length; index++) {
      const a = route.points[index - 1]!, b = route.points[index]!;
      assert.ok(Math.abs(a.x - b.x) < .01 || Math.abs(a.y - b.y) < .01, edge.id);
      // Every non-endpoint segment stays outside all card interiors.
      for (const node of positions.nodes.values()) {
        const vertical = Math.abs(a.x - b.x) < .01;
        const crosses = vertical
          ? a.x > node.x + .01 && a.x < node.x + node.width - .01 && Math.max(a.y, b.y) > node.y + .01 && Math.min(a.y, b.y) < node.y + node.height - .01
          : a.y > node.y + .01 && a.y < node.y + node.height - .01 && Math.max(a.x, b.x) > node.x + .01 && Math.min(a.x, b.x) < node.x + node.width - .01;
        assert.ok(!crosses, `${edge.id} crosses a card`);
      }
    }
  }
  const nodes = [...positions.nodes.values()];
  for (const [index, a] of nodes.entries()) for (const b of nodes.slice(index + 1)) {
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'nodes overlap');
  }
}

for (const lengths of [[1, 1], [3, 1], [1, 1, 1], Array(8).fill(1), [0, 0], [0, 2, 1]]) {
  test(`designer parallel block shares a spine, symmetric lanes and clear connectors: ${lengths.join('/')}`, async () => {
    const source = parallelFixture(lengths), before = structuredClone(source);
    const positions = await workflowFlowLayout(source, { designer: true });
    const center = (id: string) => { const node = positions.nodes.get(id)!; return node.x + node.width / 2; };
    const axis = center('start');
    for (const id of ['fork', 'join', 'after', 'done']) assert.ok(Math.abs(center(id) - axis) < .01, `${id} left the common spine`);
    const labels = lengths.map((_, index) => positions.edges.get(`branch-${index}`)!.label);
    for (const [index, label] of labels.entries()) {
      assert.ok(Math.abs(label.x + labels.at(-1 - index)!.x - 2 * axis) < .01, 'branches are not symmetric');
      assert.equal(label.y, labels[0]!.y, 'branch headers are not level');
      if (index) assert.ok(label.x - labels[index - 1]!.x - 296 >= 48, 'branch cards need breathing room');
      if (lengths[index]) assert.equal(label.x, center(`b${index}-0`));
      const points = positions.edges.get(`branch-${index}`)!.points;
      assert.ok(Math.abs(label.x - axis) < .01 || points.some((point, pointIndex) => pointIndex && Math.abs(point.x - points[pointIndex - 1]!.x) > 1 && point.y > positions.nodes.get('fork')!.y + positions.nodes.get('fork')!.height), 'split bus must be below the fork card');
    }
    const bodyBottom = Math.max(...source.nodes.filter(node => node.kind === 'approval' && node.id !== 'after').map(node => { const p = positions.nodes.get(node.id)!; return p.y + p.height; }));
    for (const route of source.edges.filter(edge => edge.to === 'join' && edge.from !== 'fork')) {
      const points = positions.edges.get(route.id)!.points;
      assert.ok(points.slice(1, -1).every(point => point.y > bodyBottom && point.y < positions.nodes.get('join')!.y), 'join bus must leave the card boundaries clear');
      const insertion = positions.edges.get(route.id)!.label, from = positions.nodes.get(route.from)!;
      assert.ok(insertion.y > from.y + from.height && insertion.y < positions.nodes.get('join')!.y, 'insert button is outside the branch lane');
    }
    assertRoutedWithoutOverlap(source, positions);
    assert.deepEqual(source, before, 'layout changed the canonical graph');
  });
}

test('parallel lanes reserve the full condition body and its labels', async () => {
  const source = parallelFixture([1, 1]);
  source.nodes.find(node => node.id === 'b0-0')!.kind = 'condition';
  source.nodes.push({ id: 'conditional-a', kind: 'approval', title: 'Conditional A' }, { id: 'conditional-b', kind: 'approval', title: 'Conditional B' });
  source.nodes.find(node => node.id === 'fork')!.parallel!.branchNodeIds.push('conditional-a', 'conditional-b');
  source.edges = source.edges.filter(edge => edge.from !== 'b0-0');
  source.edges.push(edge('b0-0', 'conditional-a', 'branch'), edge('b0-0', 'conditional-b', 'default'), edge('conditional-a', 'join'), edge('conditional-b', 'join'));
  const positions = await workflowFlowLayout(source, { designer: true });
  assertRoutedWithoutOverlap(source, positions);
  const right = positions.nodes.get('b1-0')!;
  for (const id of ['b0-0', 'conditional-a', 'conditional-b']) {
    const left = positions.nodes.get(id)!;
    assert.ok(left.x + left.width + 48 <= right.x, 'condition body spills into its neighbour');
  }
  for (const edge of source.edges.filter(edge => edge.from === 'b0-0')) {
    const label = positions.edges.get(edge.id)!.label;
    assert.ok(label.x + 148 + 48 <= right.x, 'condition label spills into its neighbour');
  }
});

test('consecutive paired regions keep one spine without overlaps', async () => {
  const source = parallelFixture([1, 2]);
  source.nodes.find(node => node.id === 'after')!.kind = 'parallel';
  source.nodes.find(node => node.id === 'after')!.parallel = { joinNodeId: 'join2', branchNodeIds: ['next-a', 'next-b'], branchCount: 2 };
  source.nodes.push({ id: 'next-a', kind: 'approval', title: 'Next A' }, { id: 'next-b', kind: 'approval', title: 'Next B' }, { id: 'join2', kind: 'join', title: 'Together again' });
  source.edges = source.edges.filter(edge => edge.from !== 'after');
  source.edges.push({ ...edge('after', 'next-a', 'branch'), parallelBranch: true }, { ...edge('after', 'next-b', 'branch'), parallelBranch: true }, edge('next-a', 'join2'), edge('next-b', 'join2'), edge('join2', 'done'));
  const positions = await workflowFlowLayout(source, { designer: true });
  assertRoutedWithoutOverlap(source, positions);
  const centers = ['start', 'fork', 'join', 'after', 'join2', 'done'].map(id => { const p = positions.nodes.get(id)!; return p.x + p.width / 2; });
  assert.ok(Math.max(...centers) - Math.min(...centers) < .01, 'consecutive regions have different spines');
});

for (const lengths of [[1,0],[0,2],[3,1],[1,0,2],[0,0]]) {
  test(`designer condition cards sit on symmetric lanes, including empty defaults: ${lengths}`, async () => {
    const source=parallelFixture(lengths);
    const fork=source.nodes.find(node => node.id==='fork')!;fork.kind='condition';delete fork.parallel;
    source.edges=source.edges.map(route => route.from==='fork' ? {...route,parallelBranch:undefined,kind:route.id===`branch-${lengths.length-1}` ? 'default' : 'branch'} : route);
    const before=structuredClone(source),positions=await workflowFlowLayout(source,{designer:true});
    const center=(id:string) => {const p=positions.nodes.get(id)!;return p.x+p.width/2;};
    const axis=center('fork');
    for (const id of ['start','join','after','done']) assert.ok(Math.abs(center(id)-axis)<.01,`${id} must remain on the spine`);
    const labels=lengths.map((_,index)=>positions.edges.get(`branch-${index}`)!.label);
    for (const [index,label] of labels.entries()) {
      assert.ok(Math.abs(label.x+labels.at(-1-index)!.x-2*axis)<.01);
      assert.equal(label.y,labels[0]!.y);
      if (index) assert.ok(label.x-labels[index-1]!.x>=344);
      for (let n=0;n<lengths[index]!;n++) assert.equal(center(`b${index}-${n}`),label.x,'body cards must share the label/wire axis');
      const points=positions.edges.get(`branch-${index}`)!.points;
      assert.ok(points.some((point,i)=>i && Math.abs(point.x-label.x)<.01 && Math.abs(points[i-1]!.x-label.x)<.01 && point.y>=label.y+50 && points[i-1]!.y<=label.y),'label and insertion must lie on their branch vertical wire');
      if (!lengths[index] && lengths.length===2) assert.notEqual(label.x,axis,'empty branch is not the central spine');
    }
    assertRoutedWithoutOverlap(source,positions);assert.deepEqual(source,before);
  });
}

test('nested condition sharing the outer merge reserves its own symmetric lanes',async()=>{
  const source=graph([{id:'outer',kind:'condition',title:'Outer'},{id:'inner',kind:'condition',title:'Inner'},...['a','b','c'].map(id=>({id,kind:'approval',title:id})),{id:'done',kind:'end',title:'Done'}],
    [edge('outer','inner','branch'),edge('outer','c','default'),edge('inner','a','branch'),edge('inner','b','default'),...['a','b','c'].map(id=>edge(id,'done'))]);
  const positions=await workflowFlowLayout(source,{designer:true});assertRoutedWithoutOverlap(source,positions);
  for (const fork of ['outer','inner']) {
    const p=positions.nodes.get(fork)!,axis=p.x+p.width/2,labels=source.edges.filter(e=>e.from===fork).map(e=>positions.edges.get(e.id)!.label);
    assert.ok(Math.abs(labels[0]!.x+labels[1]!.x-2*axis)<.01);
    for (const route of source.edges.filter(e=>e.from===fork)) {const target=positions.nodes.get(route.to)!;assert.equal(positions.edges.get(route.id)!.label.x,target.x+target.width/2);}
  }
});

test('non-convergent conditions keep every routed edge without inventing a merge',async()=>{
  const source=graph([{id:'fork',kind:'condition',title:'Fork'},{id:'a',kind:'end',title:'A'},{id:'b',kind:'end',title:'B'}],[edge('fork','a','branch'),edge('fork','b','default')]);
  const before=structuredClone(source),positions=await workflowFlowLayout(source,{designer:true});
  assertRoutedWithoutOverlap(source,positions);assert.equal(positions.nodes.size,3);assert.deepEqual(source,before);
});
