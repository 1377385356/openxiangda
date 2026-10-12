import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRuntimeReadCapability } from '../src/browser/runtime-capabilities';
const member = { isAppSuperAdmin: false, capabilityCodes: ['list', 'own'] };
const declared = { capabilityCodes: ['list', 'manage'] };
test('a declared multi-role perspective cannot give a limited member another role capability', () => {
  assert.equal(hasRuntimeReadCapability(member, declared, 'manage'), false);
  assert.equal(hasRuntimeReadCapability(member, declared, 'list'), true);
});
test('a perspective narrows actual grants while union reads and governance remain unchanged', () => {
  assert.equal(hasRuntimeReadCapability(member, declared, 'own'), false);
  assert.equal(hasRuntimeReadCapability(member, null, 'own'), true);
  assert.equal(hasRuntimeReadCapability(member, null, 'manage'), false);
  assert.equal(hasRuntimeReadCapability({isAppSuperAdmin:true,capabilityCodes:[]}, declared, 'manage'), true);
});
test('revocation applies even while a formerly valid perspective remains selected', () => {
  assert.equal(hasRuntimeReadCapability({...member,capabilityCodes:[]}, declared, 'list'), false);
  assert.equal(hasRuntimeReadCapability(member, {capabilityCodes:[]}, 'list'), false);
});
