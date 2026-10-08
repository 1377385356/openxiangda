import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowGraphProjection } from 'openxiangda-contracts/browser';
import { workflowDiagramProjection, workflowNodeIsReadable, workflowNodeSummaries } from '../src/browser/components/workflow/workflow-graph-presentation';

test('diagram hides common operation paths without changing canonical business branches or history', () => {
  const graph: WorkflowGraphProjection = {
    schemaVersion: 'openxiangda.workflow-graph/v2', workflowCode: 'test', definitionDigest: 'fixed', startAt: 'review',
    fixedTopology: true, branchStrategy: 'first_match', variables: [], logic: [], diagnostics: [],
    nodes: [{ id: 'review', kind: 'approval', title: '审批' }, { id: 'fix', kind: 'correction', title: '补正' },
      { id: 'no', kind: 'end', title: '拒绝', outcome: 'rejected' }, { id: 'legacy-no', kind: 'end', title: '未知终态' },
      { id: 'business', kind: 'action', title: '拒绝原因计算' }, { id: 'done', kind: 'end', title: '完成', outcome: 'approved' }],
    edges: [
      { id: 'approve', from: 'review', to: 'business', kind: 'approve', label: '通过', variablePaths: [] },
      { id: 'reject', from: 'review', to: 'no', kind: 'reject', label: '拒绝', variablePaths: [] },
      { id: 'legacy-reject', from: 'review', to: 'legacy-no', kind: 'reject', label: '拒绝', variablePaths: [] },
      { id: 'return', from: 'review', to: 'fix', kind: 'return', label: '退回', variablePaths: [] },
      { id: 'resubmit', from: 'fix', to: 'review', kind: 'resubmit', label: '重提', variablePaths: [] },
      { id: 'branch', from: 'business', to: 'done', kind: 'branch', label: '有效条件', variablePaths: [] },
    ],
  };
  const original = structuredClone(graph);
  const result = workflowDiagramProjection(graph);
  assert.deepEqual(result.nodes.map(n => n.id), ['review', 'business', 'done']);
  assert.deepEqual(result.edges.map(e => e.id), ['approve', 'branch']);
  assert.ok(result.edges.every(e => result.nodes.some(n => n.id === e.from) && result.nodes.some(n => n.id === e.to)));
  assert.deepEqual(graph, original);
  assert.deepEqual(workflowDiagramProjection(result), result);
});

test('node summaries follow actual branch references and declared step outputs', () => {
  const graph: WorkflowGraphProjection = {
    schemaVersion: 'openxiangda.workflow-graph/v2', workflowCode: 'test', definitionDigest: 'fixed', startAt: 'calculate',
    fixedTopology: true, branchStrategy: 'first_match', logic: [], diagnostics: [],
    nodes: [
      { id: 'calculate', kind: 'action', title: '不能从这个标题猜公式', businessStep: { handler: { code: 'calc', version: 1, mode: 'pure' }, inputs: {}, outputPaths: ['steps.calculate.amount', 'steps.calculate.unknown'] } },
      { id: 'route', kind: 'condition', title: '金额分流' }, { id: 'done', kind: 'end', title: '结束' },
    ],
    edges: [
      { id: 'r1', from: 'route', to: 'done', kind: 'branch', label: '超过门槛', variablePaths: ['steps.calculate.amount'] },
      { id: 'r2', from: 'route', to: 'done', kind: 'branch', label: '另一门槛', variablePaths: ['steps.calculate.amount'] },
      { id: 'otherwise', from: 'route', to: 'done', kind: 'default', label: '默认', variablePaths: [] },
    ],
    variables: [
      { path: 'steps.calculate.amount', label: '核算金额', type: 'number', required: true, source: { kind: 'step_output', nodeId: 'calculate', handlerCode: 'calc', handlerVersion: 1 }, usedBy: ['route'] },
      { path: 'unused', label: '节点注释引用但不参与分支的变量', type: 'string', required: false, source: { kind: 'input' }, usedBy: ['route'] },
    ],
  };
  const before = structuredClone(graph);
  const summaries = workflowNodeSummaries(graph);
  assert.equal(summaries.route, '核算金额 · 2 条条件 + 默认');
  assert.equal(summaries.calculate, '产出：核算金额、steps.calculate.unknown');
  assert.equal(summaries.done, undefined);
  assert.deepEqual(graph, before);
});

test('selection remains stable inside a readable viewport and locates clipped or tiny nodes', () => {
  const node = { x: 1000, y: 2000, width: 288, height: 112 };
  const size = { width: 900, height: 600 };
  const viewport = { x: -900, y: -1900, zoom: 1 };
  assert.equal(workflowNodeIsReadable(node, viewport, size), true);
  assert.equal(workflowNodeIsReadable(node, { ...viewport, x: -1000 }, size), false);
  assert.equal(workflowNodeIsReadable(node, { ...viewport, y: -1990 }, size), false);
  assert.equal(workflowNodeIsReadable(node, { ...viewport, x: -300 }, size), false);
  assert.equal(workflowNodeIsReadable(node, { ...viewport, y: -1500 }, size), false);
  assert.equal(workflowNodeIsReadable(node, { x: -100, y: -200, zoom: .18 }, size), false);
});
