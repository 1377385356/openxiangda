import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { nativeAuthorizationManagementCatalogSchema } from '../src/schemas.js';

const Ajv = createRequire(new URL('../../devkit-core/package.json', import.meta.url))('ajv/dist/2020.js').default;
const validate = new Ajv({ strict: false, validateFormats: false }).compile(nativeAuthorizationManagementCatalogSchema);
const duty = {
  workflowCode: 'return', nodeId: 'secretary', roleCode: 'secretary',
  definitionVersion: 1, bindingVersion: 2, configurationRevision: 3,
  source: 'default_binding', contexts: ['active', 'in_flight'],
};
const catalog = () => ({
  schemaVersion: 'openxiangda.native-authorization-catalog/v2',
  environment: { id: 'environment', key: 'preproduction', activeAppVersionId: 'app-version', headRevision: 2,
    dataLogicalRevisionId: 'data', authzRevisionId: 'authz', authzVersion: 1, scopeDataVersion: '1' },
  roles: [], roleManagement: { unrestricted: false, wildcardActions: [], roles: [] },
  scopeDimensions: [{ code: 'college', name: '学院', resourceCode: null, valueType: null, hierarchyMode: null, valueSource: null,
    applicability: { dimensionCode: 'college', allRoles: false, roleCodes: ['secretary'], unrestrictedRoleCodes: [], rules: [],
      workflowBindings: [duty] } }],
});

test('strict catalog accepts effective scoped Workflow metadata and the existing catalog without it', () => {
  const value = catalog();
  assert.ok(validate(value), JSON.stringify(validate.errors));
  for (const source of ['default_binding', 'node_override', 'routing_source']) {
    value.scopeDimensions[0].applicability.workflowBindings = [{ ...duty, source }];
    assert.ok(validate(value), JSON.stringify(validate.errors));
  }
  const existing: any = catalog();
  delete existing.scopeDimensions[0].applicability.workflowBindings;
  assert.ok(validate(existing), JSON.stringify(validate.errors));
});

test('scope metadata rejects private facts, unknown sources, invalid revisions and unowned contexts', () => {
  for (const invalid of [
    { ...duty, facts: { amount: 10 } }, { ...duty, workflowTitle: 'private' },
    { ...duty, source: 'client' }, { ...duty, contexts: [] }, { ...duty, contexts: ['active', 'active'] },
    { ...duty, contexts: ['terminal'] }, { ...duty, definitionVersion: 0 },
    { ...duty, bindingVersion: 1.5 }, { ...duty, configurationRevision: -1 },
  ]) {
    const value: any = catalog();
    value.scopeDimensions[0].applicability.workflowBindings = [invalid];
    assert.equal(validate(value), false);
  }
  const excessive: any = catalog();
  excessive.scopeDimensions[0].applicability.workflowBindings = Array(10001).fill(duty);
  assert.equal(validate(excessive), false);
});
