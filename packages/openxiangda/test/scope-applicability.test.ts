import assert from 'node:assert/strict';
import test from 'node:test';
import type { NativeScopeDimensionApplicability } from 'openxiangda-contracts/browser';
import { scopeAppliesToRole } from '../src/browser/components/administration/scope-applicability';

test('candidate duties and policy OR remain independent in the membership selector', () => {
  const dimension: NativeScopeDimensionApplicability = {
    dimensionCode: 'college', allRoles: true, roleCodes: ['leader'], unrestrictedRoleCodes: ['leader', 'manager'],
    rules: [{ policyCode: 'all', allRoles: true, roleCodes: [], unrestrictedRoleCodes: ['leader', 'manager'] }],
  };
  assert.equal(scopeAppliesToRole(dimension, 'leader'), false);
  assert.equal(scopeAppliesToRole(dimension, 'reader'), true);
  dimension.candidateFields = [{ dataLogicalRevisionId: 'revision', resourceCode: 'requests', fieldCode: 'leaders', roleCode: 'leader', operation: 'approve' }];
  assert.equal(scopeAppliesToRole(dimension, 'leader'), true);
  assert.equal(scopeAppliesToRole(dimension, 'manager'), false);
  dimension.rules.push({ policyCode: 'specific', allRoles: false, roleCodes: ['manager'], unrestrictedRoleCodes: [] });
  assert.equal(scopeAppliesToRole(dimension, 'manager'), true);
  dimension.rules = [];
  assert.equal(scopeAppliesToRole(dimension, 'reader'), false);
  assert.equal(scopeAppliesToRole(dimension, 'leader'), true);
});

test('Workflow-only duties remain editable while unrelated policy exclusions stay enforced', () => {
  const dimension: NativeScopeDimensionApplicability = {
    dimensionCode: 'college', allRoles: true, roleCodes: ['secretary'], unrestrictedRoleCodes: ['secretary', 'manager'],
    rules: [{ policyCode: 'all', allRoles: true, roleCodes: [], unrestrictedRoleCodes: ['secretary', 'manager'] }],
    workflowBindings: [{ workflowCode: 'return', nodeId: 'review', roleCode: 'secretary', definitionVersion: 1,
      bindingVersion: 1, configurationRevision: 0, source: 'default_binding', contexts: ['active'] }],
  };
  assert.equal(scopeAppliesToRole(dimension, 'secretary'), true);
  assert.equal(scopeAppliesToRole(dimension, 'manager'), false);
  assert.equal(scopeAppliesToRole(dimension, 'reader'), true);
  dimension.rules = [];
  assert.equal(scopeAppliesToRole(dimension, 'reader'), false);
  assert.equal(scopeAppliesToRole(dimension, 'secretary'), true);
  delete dimension.workflowBindings;
  assert.equal(scopeAppliesToRole(dimension, 'secretary'), false);
});
