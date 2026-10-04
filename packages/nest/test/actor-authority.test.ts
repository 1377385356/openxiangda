import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { type DataTransactionRequest } from 'openxiangda-contracts';
import { OpenXiangdaBusinessDataApiService, OpenXiangdaDataApiService, OpenXiangdaApplicationDataApiService } from '../src/index.js';
import { validateManagedCommandPlan } from '../src/managed-command-plan.js';

test('queue plans cannot acquire named current-actor management authority', () => {
  const execution: any = { kind: 'backend-plan', handlerCode: 'claim', timeoutMs: 1000,
    resources: [{ resourceCode: 'jobs', readFields: ['title'], writeFields: ['title'], writeOperations: ['create'] }] };
  const plan: any = { schemaVersion: 'openxiangda.managed-command-plan/v1',
    guards: [{ kind: 'actor-authority', anyOf: [{ roleCode: 'college-admin' }], errorCode: 'OPENXIANGDA_SCOPE_DENIED' }],
    operations: [{ operation: 'create', resourceCode: 'jobs', data: { title: 'manage' } }], result: {} };
  assert.throws(() => validateManagedCommandPlan(plan, execution), /PLAN_INVALID/);
});

test('only opted-in verified named actions can submit current-actor authority guards', async () => {
  const request: any = { headers: {}, openxiangda: { authorization: 'Bearer verified', perspectiveCode: null,
    principal: { principalType: 'user', userId: 'actor' }, operation: { code: 'job.manage', requiredCapability: 'app:demo:manage',
      platformAccess: { roleAssertions: { roleCodes: ['college-admin'], actorAuthority: true } } } } };
  const input: DataTransactionRequest = { schemaVersion: 'openxiangda.data-transaction-request/v2', idempotencyKey: 'manage-1',
    guards: [{ kind: 'actor-authority', anyOf: [{ roleCode: 'college-admin', scope: { dimensionCode: 'college', value: 'c1', operation: 'manage' } }],
      errorCode: 'OPENXIANGDA_SCOPE_DENIED' }], operations: [{ operation: 'create', resourceCode: 'jobs', data: {} }] };
  let calls = 0;
  const platform: any = { transactData: async () => { calls++; return { replayed: false, items: [] }; } };
  const business = new OpenXiangdaBusinessDataApiService(request, platform);
  await business.transaction(input);
  for (const change of [
    () => { delete request.openxiangda.operation.platformAccess.roleAssertions.actorAuthority; },
    () => { request.openxiangda.operation.platformAccess.roleAssertions = { roleCodes: ['other'], actorAuthority: true }; },
    () => { request.openxiangda.operation.platformAccess.roleAssertions = { roleCodes: ['college-admin'], actorAuthority: true };
      (input.guards![0] as any).userId = 'forged'; },
  ]) { change(); await assert.rejects(business.transaction(input), /OPENXIANGDA_ACTOR_AUTHORITY_NOT_DECLARED/); }
  delete (input.guards![0] as any).userId;
  request.openxiangda.principal.principalType = 'application';
  await assert.rejects(business.transaction(input), /OPENXIANGDA_BUSINESS_ACTION_USER_CONTEXT_REQUIRED/);
  await assert.rejects(new OpenXiangdaDataApiService(request, platform).transaction(input), /OPENXIANGDA_ROLE_ASSERTION_ACTION_REQUIRED/);
  const credentials: any = { withAuthorization: () => { throw new Error('credentials must not be loaded'); } };
  await assert.rejects(new OpenXiangdaApplicationDataApiService(platform, credentials).transaction(input), /OPENXIANGDA_ROLE_ASSERTION_ACTION_REQUIRED/);
  assert.equal(calls, 1);
});
