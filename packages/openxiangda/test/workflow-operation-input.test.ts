import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkflowOperationSurface, WorkflowSurface } from 'openxiangda-contracts/browser';
import { retainedWorkflowOperation, workflowOperationSignature, workflowOperationStringError, workflowOperationInputFailure } from '../src/browser/workflow-operation-input';

const schema = { minLength: 1, maxLength: 4000, pattern: '\\S' };
const operation = {
  key: 'transfer', kind: 'workflow_command', label: '转交', visible: true, enabled: true,
  inputSchema: { type: 'object', required: ['reason'], properties: { reason: schema } },
  uiSchema: {}, execute: { method: 'POST', href: '/tasks/task-a/commands/transfer', idempotencyRequired: true }, refresh: ['surface'],
} as WorkflowOperationSurface;
const surface = { instance: { id: 'instance-a' }, task: { id: 'task-a', version: 3 }, instanceSequence: 9,
  commandToken: 'old-token', operations: [operation] } as unknown as WorkflowSurface;
const selected = { operation, surface, operationSignature: workflowOperationSignature(operation) };

test('required opinion and reason reject missing, whitespace, wrong types and values over the bound', () => {
  for (const value of [undefined, null, '', ' \t\r\n ', 123, {}, 'a'.repeat(4001)]) {
    assert.ok(workflowOperationStringError(schema, value, true, '原因'));
  }
  assert.equal(workflowOperationStringError(schema, '合成转交原因', true, '原因'), null);
  assert.equal(workflowOperationStringError(schema, 'a'.repeat(4000), true, '原因'), null);
});

test('optional fields distinguish absence from a provided value that violates its schema', () => {
  assert.equal(workflowOperationStringError(schema, undefined, false, '意见'), null);
  assert.equal(workflowOperationStringError({ maxLength: 4000 }, '', false, '意见'), null);
  assert.ok(workflowOperationStringError(schema, '', false, '意见'));
  assert.ok(workflowOperationStringError({ minLength: 3 }, 'ab', false, '说明'));
});

test('optional operation reasons accept blank input while retaining string and length bounds', () => {
  const optional = { maxLength: 4000 };
  for (const value of [undefined, '', ' \t\n ', '合成说明', 'a'.repeat(4000)]) {
    assert.equal(workflowOperationStringError(optional, value, false, '原因'), null);
  }
  for (const value of [null, 123, {}, 'a'.repeat(4001)]) {
    assert.ok(workflowOperationStringError(optional, value, false, '原因'));
  }
});

test('platform patterns are enforced and an invalid pattern cannot silently enable submission', () => {
  assert.ok(workflowOperationStringError({ pattern: '^ABC$' }, 'ABD', true, '说明'));
  assert.equal(workflowOperationStringError({ pattern: '^ABC$' }, 'ABC', true, '说明'), null);
  assert.ok(workflowOperationStringError({ pattern: '[' }, 'valid text', true, '说明'));
});

test('a definitive refusal keeps the Form operation object across an otherwise identical read refresh', () => {
  const fresh = { ...surface, commandToken: 'new-token', operations: [structuredClone(operation)] };
  assert.equal(retainedWorkflowOperation(selected, surface, surface.operations, false), operation);
  assert.equal(retainedWorkflowOperation(selected, fresh, fresh.operations, false), null);
  assert.equal(retainedWorkflowOperation(selected, fresh, fresh.operations, true), operation);
});

for (const [name, changed] of Object.entries({
  instance: { ...surface, instance: { ...surface.instance!, id: 'another-instance' } },
  task: { ...surface, task: { ...surface.task!, id: 'another-task' } },
  taskVersion: { ...surface, task: { ...surface.task!, version: 4 } },
  instanceSequence: { ...surface, instanceSequence: 10 },
})) {
  test(`refused opinion cannot be rebound across changed ${name}`, () => {
    assert.equal(retainedWorkflowOperation(selected, changed as WorkflowSurface, surface.operations, true), null);
  });
}

for (const [name, changed] of Object.entries({
  hidden: { ...operation, visible: false }, disabled: { ...operation, enabled: false },
  schema: { ...operation, inputSchema: { type: 'object', required: ['different'] } },
  target: { ...operation, execute: { ...operation.execute, href: '/tasks/another-task/commands/transfer' } },
})) {
  test(`refused opinion cannot be reused with a ${name} operation`, () => {
    assert.equal(retainedWorkflowOperation(selected, { ...surface }, [changed as WorkflowOperationSurface], true), null);
  });
}

test('known opinion refusals have user-facing recovery guidance and unknown errors remain available to the existing decoder', () => {
  for (const code of ['WORKFLOW_V2_REASON_INVALID', 'WORKFLOW_V2_OPERATION_COMMENT_REQUIRED',
    'WORKFLOW_V2_REJECT_COMMENT_REQUIRED', 'WORKFLOW_V2_TRANSFER_SELF_FORBIDDEN']) {
    const message = workflowOperationInputFailure({ code });
    assert.ok(message); assert.doesNotMatch(message, /WORKFLOW_V2/);
  }
  assert.equal(workflowOperationInputFailure({ code: 'NETWORK_UNKNOWN' }), null);
});
