import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256Digest } from '../src/canonical.js';
import { projectWorkflowGraph, formatWorkflowExpression, validateWorkflowReadability, workflowExpressionPaths, type WorkflowGraphDefinitionSource } from '../src/native-compiler/workflow-graph.js';

function fixture(): WorkflowGraphDefinitionSource {
  return { code: 'amount', title: '金额申请', startAt: 'route',
    subject: { resourceCode: 'requests', factProjection: { amount: 'amountCents', reason: 'reason' } },
    inputSchema: { type: 'object', additionalProperties: false, required: ['amount'], properties: {
      amount: { type: 'integer' }, reason: { type: 'object', properties: { value: { type: 'string' } } },
    } }, readability: { variables: { amount: { label: '申请金额', unit: '分' }, 'reason.value': { label: '休学原因值' } } },
    nodes: { route: { id: 'route', kind: 'condition', branches: [
      { label: '较高阈值先判断', when: { op: 'gt', left: { op: 'path', path: 'amount' }, right: { op: 'literal', value: 200000 } }, target: 'high' },
      { when: { op: 'gt', left: { op: 'path', path: 'amount' }, right: { op: 'literal', value: 100000 } }, target: 'low' },
    ], otherwise: 'end' }, high: { id: 'high', kind: 'approval', title: '高级审批', mode: 'single', onApprove: 'end', onReject: 'end' },
    low: { id: 'low', kind: 'approval', title: '普通审批', mode: 'single', onApprove: 'end', onReject: 'end' }, end: { id: 'end', kind: 'end', title: '结束' } } };
}

test('graph exposes the declared Kernel grant and request source even without app-authored explanation', () => {
  const definition = fixture(); delete definition.readability;
  definition.approvedDelegation = { confirmationNodeId: 'high', confirmer: 'delegate', requestsField: 'requests', maxRequests: 500 };
  (definition.inputSchema.properties as Record<string, unknown>).requests = { type: 'array', maxItems: 500, items: { type: 'object' } };
  definition.subject!.factProjection.requests = 'delegationRequests';
  const before = JSON.stringify(definition);
  const graph = projectWorkflowGraph(definition, sha256Digest(definition));
  assert.equal(graph.logic.length, 1);
  assert.equal(graph.logic[0]!.phase, 'completion');
  assert.match(graph.logic[0]!.description, /所选代理人.*当前退回周期.*人工确认/);
  assert.match(graph.logic[0]!.description, /任一行失败.*一起回滚/);
  assert.deepEqual(graph.variables.find(item => item.path === 'requests')!.source,
    { kind: 'subject_field', resourceCode: 'requests', fieldPath: 'delegationRequests' });
  assert.equal(graph.nodes.length, Object.keys(definition.nodes).length);
  assert.equal(JSON.stringify(definition), before);
  definition.readability = { logic: [{ code: 'kernel-approved-delegation', title: '伪说明', description: '不能覆盖平台真实逻辑', phase: 'completion', inputPaths: ['requests'] }] };
  assert.ok(validateWorkflowReadability(definition).includes('WORKFLOW_LOGIC_PLATFORM_CODE_RESERVED'));
});

test('graph preserves executable branch priority/default and cannot create annotation nodes', () => {
  const definition = fixture();
  definition.readability!.logic = [{ code: 'submission-validation', title: '核验申请', description: '提交校验，不会在流转途中再次执行', phase: 'submission', inputPaths: ['amount'] }];
  const graph = projectWorkflowGraph(definition, sha256Digest(definition));
  assert.equal(graph.definitionDigest, sha256Digest(definition));
  assert.equal(graph.branchStrategy, 'first_match');
  assert.deepEqual(graph.edges.filter(edge => edge.from === 'route').map(edge => [edge.kind, edge.to, edge.priority]), [['branch', 'high', 1], ['branch', 'low', 2], ['default', 'end', undefined]]);
  assert.equal(graph.nodes.length, Object.keys(definition.nodes).length);
  assert.equal(graph.logic[0]!.phase, 'submission');
  const previous = graph.definitionDigest;
  definition.readability!.variables!.amount!.label = '总额';
  assert.notEqual(previous, sha256Digest(definition), 'explanation is versioned together with execution');
});

test('variable provenance follows actual fact projection, nested schema and requiredness', () => {
  const graph = projectWorkflowGraph(fixture(), 'digest');
  const amount = graph.variables.find(variable => variable.path === 'amount')!;
  assert.deepEqual(amount.source, { kind: 'subject_field', resourceCode: 'requests', fieldPath: 'amountCents' });
  assert.equal(amount.type, 'integer'); assert.equal(amount.required, true);
  assert.deepEqual(amount.usedBy, ['route']);
  assert.deepEqual(graph.variables.find(variable => variable.path === 'reason.value')!.source, { kind: 'subject_field', resourceCode: 'requests', fieldPath: 'reason.value' });
  assert.equal(formatWorkflowExpression(graph.edges[0]!.expression!, graph.variables), '申请金额 > 200000 分');
});

test('unresolved variables are diagnosed in legacy read and rejected for annotated definitions', () => {
  const definition = fixture();
  definition.nodes.route!.branches![0]!.when = { op: 'exists', value: { op: 'path', path: 'missing' } };
  assert.ok(validateWorkflowReadability(definition).includes('WORKFLOW_VARIABLE_SOURCE_UNKNOWN:route:missing'));
  delete definition.readability;
  assert.deepEqual(validateWorkflowReadability(definition), []);
  assert.ok(projectWorkflowGraph(definition, 'digest').diagnostics.some(item => item.path === 'missing'));
});

test('logic annotations reject fake node anchors, source escapes and undeclared output', () => {
  const definition = fixture();
  definition.readability!.logic = [{ code: 'bad-logic', title: '说明', description: '说明', phase: 'node_input', nodeId: 'missing', inputPaths: ['amount'], outputPaths: ['unwritten'], source: { path: '../secret', digest: 'sha256:' + 'a'.repeat(64) } }];
  const errors = validateWorkflowReadability(definition);
  assert.ok(errors.includes('WORKFLOW_LOGIC_ANCHOR_INVALID:bad-logic'));
  assert.ok(errors.includes('WORKFLOW_LOGIC_SOURCE_UNKNOWN:bad-logic:unwritten'));
  assert.ok(errors.includes('WORKFLOW_LOGIC_SOURCE_REFERENCE_INVALID:bad-logic'));
});

test('metadata and expression budgets fail without unbounded traversal', () => {
  const definition = fixture();
  definition.readability!.variables = Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`v${index}`, { label: '字段' }]));
  assert.ok(validateWorkflowReadability(definition).includes('WORKFLOW_VARIABLE_LIMIT_EXCEEDED'));
  let expression: unknown = { op: 'path', path: 'amount' };
  for (let index = 0; index < 25; index++) expression = { op: 'not', value: expression };
  assert.ok(workflowExpressionPaths(expression).errors.includes('WORKFLOW_EXPRESSION_BUDGET_EXCEEDED'));
  assert.ok(workflowExpressionPaths({ op: 'path', path: 'reason.constructor' }).errors.includes('WORKFLOW_EXPRESSION_PATH_INVALID'));
});


test('correction graph shows fixed return/replay paths without inventing approvals', () => {
  const definition = fixture(); definition.nodes.high!.returnTargets = ['correct'];
  definition.nodes.correct = { id: 'correct', kind: 'correction', title: '发起人补正', next: definition.startAt };
  const graph = projectWorkflowGraph(definition, sha256Digest(definition));
  assert.equal(graph.nodes.find(node => node.id === 'correct')!.kind, 'correction');
  assert.deepEqual(graph.edges.filter(edge => ['return', 'resubmit'].includes(edge.kind)).map(edge => [edge.id, edge.from, edge.to]),
    [['high:return:correct', 'high', 'correct'], ['correct:resubmit', 'correct', 'route']]);
  assert.equal(graph.edges.filter(edge => edge.from === 'correct' && edge.kind === 'approve').length, 0);
});
