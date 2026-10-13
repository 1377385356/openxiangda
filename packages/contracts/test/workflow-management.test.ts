import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkflowManagementGrantRequest, workflowManagementActions,
  NATIVE_WORKFLOW_MANAGEMENT_ACTIONS, WORKFLOW_DESIGNER_CLIENT_CONTRACT,
} from '../src/native-compiler/workflow-management.js';

const grant = { subjectRoleCode: 'contract-manager', manageAllWorkflows: false,
  managedWorkflowCodes: ['contract-approval'], actions: ['draft.edit'], reason: 'TEST pilot' };

test('workflow write actions imply only definition read; unions never invent publish or edit', () => {
  assert.deepEqual(workflowManagementActions(['draft.edit', 'unknown', 'draft.edit']), ['definition.read', 'draft.edit']);
  assert.deepEqual(workflowManagementActions(['handling.configure']), ['definition.read', 'handling.configure']);
  assert.deepEqual(workflowManagementActions(['unknown', null]), []);
  assert.deepEqual(workflowManagementActions(NATIVE_WORKFLOW_MANAGEMENT_ACTIONS), NATIVE_WORKFLOW_MANAGEMENT_ACTIONS);
  assert.equal(WORKFLOW_DESIGNER_CLIENT_CONTRACT, 2);
});
test('grant is closed and bounded, all targets is explicit, identities cannot be injected', () => {
  assert.equal(isWorkflowManagementGrantRequest(grant), true);
  assert.equal(isWorkflowManagementGrantRequest({ ...grant, manageAllWorkflows: true, managedWorkflowCodes: [] }), true);
  for (const invalid of [
    { ...grant, managedWorkflowCodes: [] }, { ...grant, manageAllWorkflows: true },
    { ...grant, managedWorkflowCodes: ['contract-approval', 'contract-approval'] },
    { ...grant, managedWorkflowCodes: Array.from({ length: 201 }, (_, n) => `workflow_${n}`) },
    { ...grant, actions: [] }, { ...grant, actions: ['app.manage'] },
    { ...grant, actions: ['draft.edit', 'draft.edit'] }, { ...grant, actions: [null] },
    { ...grant, actorUserId: 'other' }, { ...grant, subjectRoleCode: '*' },
    { ...grant, reason: ' ' }, { ...grant, reason: 'x'.repeat(1001) },
  ]) assert.equal(isWorkflowManagementGrantRequest(invalid), false, JSON.stringify(invalid));
});
