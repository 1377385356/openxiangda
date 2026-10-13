import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowHumanNode, workflowAuthoringCatalog, validateWorkflowCanvasBinding } from '../src/native-compiler/workflow-authoring.js';
import { validateWorkflowDesignerCapabilities } from '../src/native-compiler/workflow-designer.js';
import { validateWorkflowConditionalAssignmentShape } from '../src/native-compiler/workflow-conditional-assignment.js';
import type { WorkflowDefinition, WorkflowBinding, WorkflowBindingEntry } from '../src/types.js';

function fixture() {
  const base: WorkflowDefinition = { schemaVersion: 'openxiangda.workflow-definition/v2', code: 'review', title: 'Review', startAt: 'done', acceptedCommandDeactivationPolicy: 'finish-pinned', inputSchema: { type: 'object', required: ['amount'], properties: { amount: { type: 'number' }, optional: { type: 'boolean' } } }, nodes: { done: { id: 'done', kind: 'end', title: 'Done', outcome: 'approved' } } };
  const original: WorkflowBinding = { schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: 'review', bindings: {} };
  const definition = structuredClone(base); definition.startAt = 'fresh'; definition.nodes.fresh = createWorkflowHumanNode('fresh', 'approval', 'Fresh', 'done');
  const entry: WorkflowBindingEntry = { provider: 'conditional', cases: [{ label: 'Large', when: { op: 'gte', left: { op: 'path', path: 'amount' }, right: { op: 'literal', value: 1000 } }, assignee: { provider: 'app_role', roleCode: 'finance' } }], otherwise: { provider: 'fixed_users', users: ['manager'] } };
  const binding = { ...original, bindings: { canvas_fresh: entry } };
  const catalog = { ...workflowAuthoringCatalog(base, original), conditionalAssignments: true as const };
  const run = (allowIncomplete = false) => validateWorkflowDesignerCapabilities(base, definition, original, binding, { catalog, allowIncomplete });
  return { base, original, definition, entry, binding, catalog, run };
}

test('conditional canvas authoring requires explicit catalog capability and actual graph context', () => {
  const h = fixture(); assert.deepEqual(h.run(), []);
  assert.deepEqual(validateWorkflowCanvasBinding(h.entry, h.catalog), ['WORKFLOW_DESIGNER_CONDITIONAL_ASSIGNMENT_UNAVAILABLE']);
  delete (h.catalog as any).conditionalAssignments;
  assert.ok(h.run().some(error => error.includes('CONDITIONAL_ASSIGNMENT_UNAVAILABLE')));
});

test('blank standard leaves may save as drafts but cannot publish or be iterated as runnable rules', () => {
  for (const leaf of [{ provider: 'fixed_users', users: [] }, { provider: 'app_role' }]) {
    const h = fixture(); h.entry.otherwise = leaf as any;
    const before = JSON.stringify(h.entry);
    assert.deepEqual(h.run(true), []); assert.ok(h.run().length); assert.ok(validateWorkflowConditionalAssignmentShape(h.entry).length);
    assert.equal(JSON.stringify(h.entry), before);
  }
});

test('draft admission does not relax source, condition, field, nested provider, or count ceilings', () => {
  for (const variant of ['source', 'optional', 'unknown', 'nested', 'count', 'fields', 'cc', 'skip']) {
    const h = fixture();
    if (variant === 'source') h.entry.otherwise = { provider: 'initiator' };
    if (variant === 'optional' || variant === 'unknown') h.entry.cases[0]!.when = { op: 'eq', left: { op: 'path', path: variant }, right: { op: 'literal', value: true } };
    if (variant === 'nested') h.entry.otherwise = structuredClone(h.entry) as any;
    if (variant === 'count') h.entry.cases = Array.from({ length: 21 }, () => h.entry.cases[0]!);
    if (variant === 'fields') (h.entry.otherwise as any).delegatable = true;
    if (variant === 'cc') h.definition.nodes.fresh = createWorkflowHumanNode('fresh', 'cc', 'CC', 'done');
    if (variant === 'skip') (h.definition.nodes.fresh as any).emptyPolicy = 'skip';
    assert.ok(h.run(true).length, variant);
  }
});

test('optional presence and exact released references work without authorizing mutable complex parameters', () => {
  const h = fixture(); h.entry.cases[0]!.when = { op: 'exists', value: { op: 'path', path: 'optional' } };
  h.catalog.peopleSources.initiator = { provider: 'initiator' }; h.entry.otherwise = { provider: 'initiator' };
  assert.deepEqual(h.run(), []);
  (h.entry.otherwise as any).min = 1; assert.ok(h.run().some(error => error.includes('LEAF_UNRELEASED')));
});

test('every conditional leaf enforces supervisor sequence even when its case never matches', () => {
  const h = fixture(); const chain = { provider: 'supervisor_chain' as const, from: 'initiator' as const, until: { level: 2 } };
  h.base.organizationContext = h.definition.organizationContext = { department: { source: 'user_primary_department' } };
  h.catalog.peopleSources.chain = chain; h.entry.cases[0]!.assignee = chain; h.entry.cases[0]!.when = { op: 'literal', value: false };
  assert.ok(h.run().some(error => error.includes('SEQUENCE_REQUIRED')));
  (h.definition.nodes.fresh as any).mode = 'sequence'; assert.deepEqual(h.run(), []);
});

test('draft leaf iteration is explicit and strict Array.flatMap consumers cannot accidentally enable it', async () => {
  const { workflowAssignmentLeaves, validateWorkflowConditionalBindingDefinition } = await import('../src/native-compiler/workflow-conditional-assignment.js');
  const h = fixture(); h.entry.otherwise = { provider: 'fixed_users', users: [] };
  assert.throws(() => [h.entry].flatMap(workflowAssignmentLeaves));
  assert.equal(workflowAssignmentLeaves(h.entry, { allowIncomplete: true }).length, 2);
  assert.deepEqual(validateWorkflowConditionalBindingDefinition(h.definition, h.binding, { allowIncomplete: true }), []);
  assert.ok(validateWorkflowConditionalBindingDefinition(h.definition, h.binding).length);
});
