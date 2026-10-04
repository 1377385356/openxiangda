import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as esm from '../dist/native-compiler/index.js';
const cjs = createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof esm;

function fixture() {
  return {
    policy: { code: 'records-read', resourceCode: 'records', publicRead: { fields: ['title'] }, operations: ['read'] },
    resource: { code: 'records', dataPolicyCode: 'records-read', capabilities: { read: 'records:read' },
      schema: { fields: [{ code: 'title', type: 'text.short' }, { code: 'secret', type: 'text.short' }] },
      fieldPolicies: { title: { read: ['records:read'] }, secret: { read: ['records:manage'] },
        ...Object.fromEntries(esm.DATA_AUDIT_METADATA_FIELDS.map(code => [code, { read: ['records:manage'] }])) } },
    baselineRoleCode: 'member', baselineCapabilities: ['records:read'], pointer: '/authz/dataPolicies/0',
  };
}
for (const [name, implementation] of [['esm', esm], ['cjs', cjs]] as const) {
  test(`${name}: public projection proves every private field and history and respects denies`, () => {
    implementation.validateAuthenticatedPublicRead(fixture());
    const denied = fixture();
    denied.baselineCapabilities = ['records:*'];
    implementation.validateAuthenticatedPublicRead({ ...denied, baselineDeniedCapabilities: ['records:manage'] });
    denied.resource.fieldPolicies.secret.read = [];
    for (const code of implementation.DATA_AUDIT_METADATA_FIELDS) denied.resource.fieldPolicies[code].read = [];
    implementation.validateAuthenticatedPublicRead(denied);
    assert.throws(() => implementation.validateAuthenticatedPublicRead({ ...fixture(), baselineDeniedCapabilities: ['records:*'] }), /BASELINE_OR_RESOURCE_INVALID/);
  });
  test(`${name}: invalid public shape, field widening, subtable and unsafe audit fail closed`, () => {
    const cases: Array<[(value: any) => void, string]> = [
      [v => { v.policy.publicRead.fields = []; }, 'FIELDS_INVALID'],
      [v => { v.policy.publicRead.fields = ['title', 'title']; }, 'FIELDS_INVALID'],
      [v => { v.policy.publicRead.roleCode = 'manager'; }, 'FIELDS_INVALID'],
      [v => { v.policy.publicRead.fields = Array(1001).fill('title'); }, 'FIELDS_INVALID'],
      [v => { v.policy.publicRead.fields = ['title.path']; }, 'FIELDS_INVALID'],
      [v => { v.policy.publicRead.fields = ['missing']; }, 'FIELD_NOT_DECLARED'],
      [v => { v.policy.publicRead.fields = ['created_by']; }, 'FIELD_NOT_DECLARED'],
      [v => { v.resource.surface = { fields: { title: { system: true } } }; }, 'FIELD_NOT_DECLARED'],
      [v => { v.resource.schema.fields[0].type = 'subtable'; }, 'SUBTABLE_UNSUPPORTED'],
      [v => { v.resource.fieldPolicies.title.read = []; }, 'FIELD_NOT_BASELINE_READABLE'],
      [v => { delete v.resource.fieldPolicies.secret; }, 'PRIVATE_FIELD_ACCESSIBLE'],
      [v => { v.baselineCapabilities.push('records:manage'); }, 'PRIVATE_FIELD_ACCESSIBLE'],
      [v => { v.baselineCapabilities = ['*']; }, 'PRIVATE_FIELD_ACCESSIBLE'],
      [v => { delete v.resource.fieldPolicies.created_by; }, 'PRIVATE_HISTORY_ACCESSIBLE'],
      [v => { v.resource.fieldPolicies.updated_at.read = ['records:read']; }, 'PRIVATE_HISTORY_ACCESSIBLE'],
      [v => { v.policy.operations = ['read', 'update']; }, 'POLICY_NOT_READ_ONLY'],
      [v => { delete v.policy.operations; }, 'POLICY_NOT_READ_ONLY'],
      [v => { v.policy.readExpression = {}; }, 'POLICY_NOT_READ_ONLY'],
      [v => { v.policy.writeBoundary = 'capability_only'; }, 'POLICY_NOT_READ_ONLY'],
      [v => { v.resource.dataPolicyCode = 'another'; }, 'BASELINE_OR_RESOURCE_INVALID'],
      [v => { delete v.resource.capabilities.read; v.baselineCapabilities = ['*']; }, 'BASELINE_OR_RESOURCE_INVALID'],
      [v => { v.baselineRoleCode = ''; }, 'BASELINE_OR_RESOURCE_INVALID'],
    ];
    for (const [mutate, error] of cases) {
      const value = fixture(); mutate(value);
      assert.throws(() => implementation.validateAuthenticatedPublicRead(value), new RegExp(`AUTHENTICATED_PUBLIC_READ_${error}`));
    }
  });
}
