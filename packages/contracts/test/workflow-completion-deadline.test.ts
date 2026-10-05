import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowCompletionDeadlines, formatWorkflowCompletionDeadline } from '../src/native-compiler/workflow-completion-deadline.js';
import { validateWorkflowNodeConfigurationPatch } from '../src/native-compiler/workflow-node-administration.js';
import { projectWorkflowGraph } from '../src/native-compiler/workflow-graph.js';

const node = { kind: 'approval', mode: 'all', completionDeadline: { afterSeconds: 600, action: 'approve' as const },
  administration: { operations: ['approve'] as any } };
const validate = (patch: object = {}, extra: object = {}) => validateWorkflowCompletionDeadlines({ nodes: { review: { ...node, ...patch } }, ...extra });

test('deadline declaration is bounded and only applies to approval', () => {
  for (const afterSeconds of [1, 600, 2_592_000]) assert.deepEqual(validate({ completionDeadline: { afterSeconds, action: 'approve' } }), []);
  for (const rule of [null, [], {}, { afterSeconds: 0, action: 'approve' }, { afterSeconds: 2_592_001, action: 'approve' },
    { afterSeconds: 1.5, action: 'approve' }, { afterSeconds: '600', action: 'approve' }, { afterSeconds: 600, action: 'reject' },
    { afterSeconds: 600, action: 'approve', enabled: true }]) assert.ok(validate({ completionDeadline: rule }).includes('WORKFLOW_COMPLETION_DEADLINE_INVALID:review'));
  assert.ok(validate({ kind: 'cc' }).length);
  assert.ok(validate({ allowedOperations: ['reject'] }).includes('WORKFLOW_COMPLETION_DEADLINE_APPROVE_UNAVAILABLE:review'));
});

test('automatic completion cannot bypass required, conditional or malformed inputs', () => {
  assert.deepEqual(validate({ taskPageCode: 'evaluate' }, { taskPages: { evaluate: { fields: [{ code: 'comment' }] } } }), []);
  for (const fields of [null, {}, [null], [{ code: 'comment', required: true }], [{ code: 'comment', requiredWhen: { op: 'literal', value: true } }],
    [{ code: 'rows', subtable: { fields: [{ code: 'comment', required: true }] } }], [{ code: 'rows', subtable: {} }]]) {
    assert.ok(validate({ taskPageCode: 'evaluate' }, { taskPages: { evaluate: { fields } } }).includes('WORKFLOW_COMPLETION_DEADLINE_INPUT_REQUIRED:review'));
  }
  for (const patch of [{ taskPageCode: 'missing' }, { fieldPolicy: { default: 'edit_required' } },
    { fieldPolicy: { fields: { comment: 'edit_required' } } }, { operationPolicy: { approve: { commentRequired: true } } }]) assert.ok(validate(patch).length);
  assert.ok(validate({}, { commandHandlers: { approve: { handler: 'custom' } } }).length);
  assert.deepEqual(validateWorkflowCompletionDeadlines({ nodes: { review: { kind: 'approval' } } }), []);
});

test('administrator cannot require input or edit the immutable deadline', () => {
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(node, undefined, { operations: { approve: { label: '完成评价' } } }), []);
  assert.ok(validateWorkflowNodeConfigurationPatch(node, undefined, { operations: { approve: { commentRequired: true } } }).length);
  assert.ok(validateWorkflowNodeConfigurationPatch(node, undefined, { completionDeadline: { afterSeconds: 1, action: 'approve' } }).length);
});

test('graph and human-readable duration retain the fixed rule', () => {
  const graph = projectWorkflowGraph({ code: 'test', title: 'Test', startAt: 'review', inputSchema: { type: 'object', properties: {} }, nodes: {
    review: { ...node, id: 'review', onApprove: 'end', onReject: 'end' }, end: { id: 'end', kind: 'end', outcome: 'approved' },
  } }, 'digest');
  assert.deepEqual(graph.nodes[0]?.completionDeadline, node.completionDeadline);
  assert.equal(formatWorkflowCompletionDeadline(node.completionDeadline), '进入后 10 分钟未完成，自动同意');
  assert.match(formatWorkflowCompletionDeadline({ afterSeconds: 1, action: 'approve' }), /1 秒/);
});
