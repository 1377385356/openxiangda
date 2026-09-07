import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  configureApplicationIdentity,
  createRoleManagementGrant,
  createRoleMembership,
  listRoleManagementGrants,
} from '../src/core';

const source = readFileSync(
  new URL('../src/browser/platform-client.ts', import.meta.url),
  'utf8',
);

test('publishes one current-user role management browser SDK', () => {
  assert.match(source, /function roleManagementBase\(\)/);
  assert.match(source, /\/authz\/management/);
  assert.match(source, /purpose: 'authorization-management'/);
  assert.match(source, /export async function createRoleMembership/);
  assert.match(source, /export async function createRoleManagementGrant/);
  assert.match(source, /export async function loadAuthorizationMutationReceipt/);
  assert.doesNotMatch(source, /actorUserId:\s*input/);
  assert.doesNotMatch(source, /tenantId:\s*input/);
  assert.doesNotMatch(source, /activeRole/);
});

test('requires idempotency, reason and CAS in mutation input types', () => {
  assert.match(
    source,
    /interface CreateRoleMembershipInput[\s\S]*operationId: string;[\s\S]*reason: string;/,
  );
  assert.match(
    source,
    /interface UpdateRoleMembershipInput[\s\S]*expectedRevision: number;/,
  );
  assert.match(
    source,
    /interface SetRoleManagementGrantInput[\s\S]*operationId: string;[\s\S]*reason: string;/,
  );
  assert.match(source, /expectedRevision: number/);
});

test('sends current-user role management requests through the mounted application environment', async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const metadata: Record<string, string> = {
    'openxiangda-runtime-base': '/dev/role-management-test',
    'openxiangda-app-code': 'role-management-test',
    'openxiangda-environment': 'preproduction',
  };
  configureApplicationIdentity({
    appCode: 'role-management-test',
    appName: 'Role Management Test',
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector(selector: string) {
        const name = /meta\[name="([^"]+)"\]/.exec(selector)?.[1];
        return name && metadata[name] ? { content: metadata[name] } : null;
      },
    },
  });
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        code: 200,
        data: { schemaVersion: 'test', items: [], total: 0, limit: 20, offset: 0 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    await listRoleManagementGrants({ subjectRoleCode: 'business-owner' });
    await createRoleMembership({
      operationId: 'd2f38c3a-df86-428f-9586-f626c7a33212',
      reason: '安排场地管理员',
      userId: 'user-1001',
      roleCode: 'venue-manager',
    });
    await createRoleManagementGrant({
      operationId: '7d883fed-e895-485d-b147-f0921bfbd374',
      reason: '允许业务负责人维护场地角色',
      subjectRoleCode: 'business-owner',
      manageAllRoles: false,
      managedRoleCodes: ['venue-manager'],
      actions: ['membership.read', 'membership.assign'],
    });

    const base =
      '/service/openxiangda-api/v2/applications/role-management-test/native/authz/management';
    assert.equal(
      requests[0]?.url,
      `${base}/role-management-grants?environmentKey=preproduction&subjectRoleCode=business-owner`,
    );
    assert.equal(requests[0]?.init?.credentials, 'include');
    assert.equal(requests[1]?.url, `${base}/memberships`);
    assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
      operationId: 'd2f38c3a-df86-428f-9586-f626c7a33212',
      reason: '安排场地管理员',
      userId: 'user-1001',
      roleCode: 'venue-manager',
      environmentKey: 'preproduction',
    });
    assert.equal(requests[2]?.url, `${base}/role-management-grants`);
    assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
      operationId: '7d883fed-e895-485d-b147-f0921bfbd374',
      reason: '允许业务负责人维护场地角色',
      subjectRoleCode: 'business-owner',
      manageAllRoles: false,
      managedRoleCodes: ['venue-manager'],
      actions: ['membership.read', 'membership.assign'],
      environmentKey: 'preproduction',
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) {
      delete (globalThis as { document?: Document }).document;
    } else {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      });
    }
  }
});
