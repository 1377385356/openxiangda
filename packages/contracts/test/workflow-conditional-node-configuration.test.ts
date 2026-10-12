import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowNodeConfigurationPatch } from '../src/native-compiler/workflow-node-administration.js';
import type { WorkflowDefinition, WorkflowNodeConfigurationPatch } from '../src/types.js';

const fixture = () => {
  const definition: WorkflowDefinition = {
    schemaVersion: 'openxiangda.workflow-definition/v2', code: 'review', title: 'Review', startAt: 'review',
    acceptedCommandDeactivationPolicy: 'finish-pinned',
    inputSchema: { type: 'object', required: ['amount'], properties: { amount: { type: 'number' } } },
    nodes: { review: { id: 'review', kind: 'approval', title: 'Review', binding: 'people', mode: 'single', onApprove: 'done', onReject: 'done',
      administration: { assigneeProviders: ['fixed_users', 'app_role'], modes: ['single', 'sequence'] } },
      done: { id: 'done', kind: 'end', title: 'Done', outcome: 'approved' } },
  };
  const binding = { provider: 'fixed_users', users: ['default'] } as const;
  const patch: WorkflowNodeConfigurationPatch = { assignee: { provider: 'conditional', cases: [{ label: 'Large',
    when: { op: 'gte', left: { op: 'path', path: 'amount' }, right: { op: 'literal', value: 1000 } },
    assignee: { provider: 'app_role', roleCode: 'finance' } }], otherwise: { provider: 'fixed_users', users: ['manager'] } } };
  const context = { definition, nodeId: 'review', releasedSources: {} };
  const run = () => validateWorkflowNodeConfigurationPatch(definition.nodes.review, binding, patch, undefined, context);
  return { definition, binding, patch, context, run };
};

test('whole conditional configuration requires explicit version context while flat calls keep working', () => {
  const h = fixture();
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(h.definition.nodes.review, h.binding, h.patch), ['WORKFLOW_V2_NODE_CONFIGURATION_CONDITIONAL_CONTEXT_REQUIRED']);
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(h.definition.nodes.review, h.binding, { assignee: { provider: 'fixed_users', users: ['other'] } }), []);
  const before = JSON.stringify(h);
  assert.deepEqual(h.run(), []); assert.equal(JSON.stringify(h), before);
});

test('unmatched leaves, otherwise, facts and source ceilings are validated before selection', () => {
  for (const variant of ['otherwise', 'optional', 'unknown', 'ceiling', 'nested', 'mixed', 'limit']) {
    const h = fixture(), entry = h.patch.assignee as any;
    if (variant === 'otherwise') delete entry.otherwise;
    if (variant === 'optional') h.definition.inputSchema.required = [];
    if (variant === 'unknown') entry.cases[0].when.left.path = 'other';
    if (variant === 'ceiling') entry.otherwise = { provider: 'input_users', inputPath: 'people' };
    if (variant === 'nested') entry.otherwise = structuredClone(entry);
    if (variant === 'mixed') entry.min = 1;
    if (variant === 'limit') entry.cases = Array.from({ length: 21 }, () => entry.cases[0]);
    assert.ok(h.run().length, variant);
  }
});

test('mode edits apply before every frozen complex leaf is checked', () => {
  const h = fixture();
  const chain = { provider: 'supervisor_chain' as const, from: 'initiator' as const, until: { level: 2 }, continuous: true };
  h.context.releasedSources = { chain } as any;
  (h.patch.assignee as any).otherwise = chain;
  h.definition.organizationContext = { department: { source: 'user_primary_department' } };
  assert.ok(h.run().includes('WORKFLOW_SUPERVISOR_CHAIN_SEQUENCE_REQUIRED:review'));
  h.patch.mode = 'sequence'; assert.deepEqual(h.run(), []);
});

test('CC, skip and a different graph node cannot authorize the same rule', () => {
  for (const variant of ['cc', 'skip', 'node']) {
    const h = fixture();
    if (variant === 'cc') (h.definition.nodes.review as any).kind = 'cc';
    if (variant === 'skip') (h.definition.nodes.review as any).emptyPolicy = 'skip';
    if (variant === 'node') h.context.nodeId = 'done';
    assert.ok(h.run().length, variant);
  }
});


test('a presentation copy cannot widen the contextual published node permissions or empty policy', () => {
  const h = fixture();
  const presentation: any = structuredClone(h.definition.nodes.review);
  (h.definition.nodes.review as any).administration.assigneeProviders = ['fixed_users'];
  assert.ok(validateWorkflowNodeConfigurationPatch(presentation, h.binding, h.patch, undefined, h.context).some(error => error.startsWith('WORKFLOW_CONDITIONAL_LEAF_UNRELEASED')));
  (h.definition.nodes.review as any).administration.assigneeProviders = ['fixed_users', 'app_role'];
  (h.definition.nodes.review as any).emptyPolicy = 'skip';
  assert.ok(validateWorkflowNodeConfigurationPatch(presentation, h.binding, h.patch, undefined, h.context).includes('WORKFLOW_APPROVAL_EMPTY_PROVIDER_UNSUPPORTED'));
  delete (h.definition.nodes.review as any).emptyPolicy;
  h.patch.mode = 'sequence';
  (h.definition.nodes.review as any).administration.modes = ['single'];
  assert.ok(validateWorkflowNodeConfigurationPatch(presentation, h.binding, h.patch, undefined, h.context).includes('WORKFLOW_V2_NODE_CONFIGURATION_MODE_READONLY'));
});
