import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateWorkflowAutomaticCc } from '../src/native-compiler/workflow-automatic-cc.js';
import { validateWorkflowAdministration, validateWorkflowNodeConfigurationPatch } from '../src/native-compiler/workflow-node-administration.js';
import { projectWorkflowGraph } from '../src/native-compiler/workflow-graph.js';

function fixture() {
  return {
    definition: { code: 'cc-review', title: '抄送审批', startAt: 'copy', inputSchema: { type: 'object' }, nodes: {
      copy: { id: 'copy', kind: 'cc', title: '抄送', binding: 'recipients', next: 'end', emptyPolicy: 'block', administration: { assigneeProviders: ['app_role', 'fixed_users'] } },
      end: { id: 'end', kind: 'end', title: '完成', outcome: 'approved' },
    } },
    binding: { bindings: { recipients: { provider: 'app_role', roleCode: 'reader' } } },
  } as any;
}

test('cc is an executable fixed next edge with code-owned empty and notification policies', () => {
  const { definition, binding } = fixture();
  assert.deepEqual(validateWorkflowAutomaticCc(definition, binding), []);
  const graph = projectWorkflowGraph(definition, 'frozen');
  assert.deepEqual(graph.edges.map(edge => [edge.id, edge.kind, edge.to]), [['copy:next', 'next', 'end']]);
  assert.equal(graph.nodes[0]!.notify, true);
  assert.equal(graph.nodes[0]!.emptyPolicy, 'block');
  definition.nodes.copy.notify = false;
  definition.nodes.copy.emptyPolicy = 'skip';
  assert.deepEqual(validateWorkflowAutomaticCc(definition, binding), []);
  assert.equal(projectWorkflowGraph(definition, 'new').nodes[0]!.notify, false);
});

test('cc rejects unavailable providers, limits and unknown node controls', () => {
  for (const provider of ['application_provider', 'initiator_select', 'business_relation', 'department_supervisor']) {
    const f = fixture(); f.binding.bindings.recipients.provider = provider;
    assert.ok(validateWorkflowAutomaticCc(f.definition, f.binding).includes('WORKFLOW_CC_PROVIDER_INVALID:copy'));
  }
  for (const patch of [{ next: 'missing' }, { emptyPolicy: 'pass' }, { notify: 'false' }, { mode: 'any' }, { fieldPolicy: {} }, { operationPolicy: undefined }]) {
    const f = fixture(); Object.assign(f.definition.nodes.copy, patch);
    assert.ok(validateWorkflowAutomaticCc(f.definition, f.binding).includes('WORKFLOW_CC_NODE_INVALID:copy'));
  }
  for (const entry of [{ max: 21 }, { min: 0 }, { min: 3, max: 2 }, { provider: 'fixed_users', users: Array.from({ length: 21 }, (_, i) => `u${i}`) }]) {
    const f = fixture(); Object.assign(f.binding.bindings.recipients, entry);
    assert.ok(validateWorkflowAutomaticCc(f.definition, f.binding).includes('WORKFLOW_CC_RECIPIENT_LIMIT_INVALID:copy'));
  }
});

test('cc only opens explicitly declared recipient sources, with no approval or topology controls', () => {
  const f = fixture(); const node = f.definition.nodes.copy, entry = f.binding.bindings.recipients;
  assert.deepEqual(validateWorkflowAdministration(f.definition, f.binding), []);
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(node, entry, { assignee: { provider: 'fixed_users', users: ['one'] } }), []);
  assert.ok(validateWorkflowNodeConfigurationPatch(node, entry, { mode: 'any' }).length);
  assert.ok(validateWorkflowNodeConfigurationPatch(node, entry, { operations: { approve: { label: '通过' } } }).length);
  assert.ok(validateWorkflowNodeConfigurationPatch(node, entry, { next: 'end' }).length);
  delete node.administration;
  assert.ok(validateWorkflowNodeConfigurationPatch(node, entry, { assignee: { provider: 'app_role', roleCode: 'another' } }).includes('WORKFLOW_V2_NODE_CONFIGURATION_PROVIDER_READONLY'));
  assert.deepEqual(validateWorkflowNodeConfigurationPatch(node, entry, { title: '抄送校务负责人' }), []);
});
