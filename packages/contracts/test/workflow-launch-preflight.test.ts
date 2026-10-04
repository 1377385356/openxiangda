import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowLaunchPreflight } from '../src/native-compiler/workflow-launch-preflight.js';

const definition = { nodes: { college: { kind: 'approval', binding: 'staff' }, end: { kind: 'end' } }, launchPreflight: { requiredApprovalNodes: ['college'] } };
test('preflight is closed, bounded and only resolves supported native participants', () => {
  assert.deepEqual(validateWorkflowLaunchPreflight({}), []);
  for (const policy of [null, [], {}, { requiredApprovalNodes: [] }, { requiredApprovalNodes: ['college'], skipEmpty: true }, { requiredApprovalNodes: ['college', 'college'] }, { requiredApprovalNodes: ['missing'] }, { requiredApprovalNodes: ['end'] }, { requiredApprovalNodes: Array.from({ length: 21 }, (_, i) => `n${i}`) }]) {
    assert.ok(validateWorkflowLaunchPreflight({ ...definition, launchPreflight: policy }).length, JSON.stringify(policy));
  }
  for (const provider of ['fixed_users', 'initiator', 'app_role', 'app_role_in_scope']) {
    assert.deepEqual(validateWorkflowLaunchPreflight(definition, { bindings: { staff: { provider } } }), []);
  }
  for (const entry of [{ provider: 'application_provider' }, { provider: 'form_field_users' }, { provider: 'app_role', candidateField: 'future' }]) {
    assert.ok(validateWorkflowLaunchPreflight(definition, { bindings: { staff: entry } }).length);
  }
  assert.ok(validateWorkflowLaunchPreflight(definition, { bindings: {} }).length);
});
