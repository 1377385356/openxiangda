import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { nativePrincipalSchema, runtimeAuthorizationSchema, subjectProfileSchema } from '../src/schemas.js';

const Ajv = createRequire(new URL('../../devkit-core/package.json', import.meta.url))('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false, validateFormats: false });
ajv.addSchema(subjectProfileSchema);
const native = ajv.compile(nativePrincipalSchema);
const runtime = ajv.compile({ ...runtimeAuthorizationSchema, properties: { ...runtimeAuthorizationSchema.properties, subjectProfile: subjectProfileSchema } });
const principal = { schemaVersion: 'openxiangda.native-principal/v2', tenantId: 'tenant', appCode: 'app',
  environmentId: 'environment', environmentKey: 'preproduction', activeAppVersionId: 'version', environmentHeadRevision: 1,
  principalType: 'user', subjectId: 'user', userId: 'user', displayName: '测试用户', loginSessionId: 'login',
  subjectKind: 'role_union', roleCodes: ['teacher'], authzRevisionId: 'revision', authzVersion: 1,
  scopeDataVersion: '1', authorizationDigest: 'a'.repeat(64), isAppSuperAdmin: false, capabilities: ['publish'], expiresAt: null };

test('verified Native principals retain optional working organization without accepting alternate authority fields', () => {
  for (const input of [principal, { ...principal, activeOrganizationId: 'organization-a' }]) assert.equal(native(input), true, JSON.stringify(native.errors));
  for (const activeOrganizationId of ['', null, 1, {}, []]) assert.equal(native({ ...principal, activeOrganizationId }), false);
  assert.equal(native({ ...principal, organizationId: 'caller-selected' }), false);
});

test('current authorization schemas preserve the platform organization projection on both sides', () => {
  const base = { schemaVersion: 'openxiangda.runtime-authorization/v2', state: 'active',
    environment: { id: 'environment', key: 'preproduction', activeAppVersionId: 'version', headRevision: 1 },
    subjectProfile: { schemaVersion: 'openxiangda.subject-profile/v2', userId: 'user', displayName: '测试用户', avatarUrl: null, jobNumber: null, affiliatedDepartment: null },
    roles: [], principal: { type: 'user_union', userId: 'user', roleCodes: ['teacher'], capabilityCodes: ['publish'], isAppSuperAdmin: false, identityScope: 'verified' } };
  assert.equal(runtime(base), true, JSON.stringify(runtime.errors));
  assert.equal(runtime({ ...base, environment: { ...base.environment, activeOrganizationId: 'organization-a' }, principal: { ...base.principal, activeOrganizationId: 'organization-a' } }), true, JSON.stringify(runtime.errors));
  assert.equal(runtime({ ...base, principal: { ...base.principal, activeOrganizationId: 123 } }), false);
});
