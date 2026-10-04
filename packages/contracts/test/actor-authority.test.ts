import assert from 'node:assert/strict';
import test from 'node:test';
import { isDataTransactionActorAuthorityGuard, matchesDataActorAuthorityMembership } from '../src/native-compiler/actor-authority.js';

const requirement = { roleCode: 'college-admin', scope: { dimensionCode: 'college', value: 'c1', operation: 'manage' } };
const membership = { roleCode: 'college-admin', roleSource: 'package', capabilityCodes: ['maintenance.manage'],
  scopeGrantsJson: JSON.stringify([{ dimensionCode: 'college', values: ['c1'], operations: ['manage'] }]) };

test('membership capability and exact scope must belong to the same package member', () => {
  assert.equal(matchesDataActorAuthorityMembership(requirement, membership, 'maintenance.manage'), true);
  for (const change of [ { roleSource: 'manual' }, { roleCode: 'other' }, { capabilityCodes: [] },
    { scopeGrantsJson: '{' }, { scopeGrantsJson: '{}' },
    { scopeGrantsJson: JSON.stringify([{ dimensionCode: 'college', values: ['c2'], operations: ['manage'] }]) },
    { scopeGrantsJson: JSON.stringify([{ dimensionCode: 'college', values: ['c1'], operations: ['read'] }]) },
    { scopeGrantsJson: JSON.stringify([{ dimensionCode: 'college', values: ['c1'], operations: '*' }]) } ]) {
    assert.equal(matchesDataActorAuthorityMembership(requirement, { ...membership, ...change }, 'maintenance.manage'), false);
  }
  assert.equal(matchesDataActorAuthorityMembership(requirement, membership, ''), false);
  for (const operations of [undefined, null, [], ['*'], ['read', 'manage']]) {
    const candidate = { ...membership, scopeGrantsJson: JSON.stringify([{ dimensionCode: 'college', values: ['c1'], operations }]) };
    assert.equal(matchesDataActorAuthorityMembership(requirement, candidate, 'maintenance.manage'), true);
  }
});

test('actor authority shape rejects identity injection, ambiguous branches and unbounded input', () => {
  const guard = { kind: 'actor-authority', errorCode: 'OPENXIANGDA_SCOPE_DENIED', anyOf: [requirement] };
  assert.equal(isDataTransactionActorAuthorityGuard(guard), true);
  for (const change of [{ userId: 'actor' }, { capability: 'maintenance.manage' }, { membershipId: 'id' },
    { anyOf: [] }, { anyOf: Array(21).fill(requirement) }, { anyOf: [requirement, { scope: requirement.scope, roleCode: requirement.roleCode }] },
    { allowAppSuperAdmin: 1 }, { errorCode: 'BAD' },
    { anyOf: [{ ...requirement, scope: { ...requirement.scope, value: ' c1' } }] },
    { anyOf: [{ ...requirement, scope: { ...requirement.scope, operation: 'manage ' } }] },
    { anyOf: [{ ...requirement, scope: { ...requirement.scope, value: 'x'.repeat(256) } }] }]) {
    assert.equal(isDataTransactionActorAuthorityGuard({ ...guard, ...change }), false);
  }
});
