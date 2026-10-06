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
