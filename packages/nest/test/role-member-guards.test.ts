import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataTransactionRequest } from 'openxiangda-contracts';
import { OpenXiangdaBusinessDataApiService, OpenXiangdaDataApiService, OpenXiangdaApplicationDataApiService } from '../src/index.js';

test('只有显式声明的受信业务动作发送角色条件，普通用户和后台凭据在网络前拒绝', async () => {
  const request: any = { headers: {}, openxiangda: {
    authorization: 'Bearer invocation', perspectiveCode: null,
    principal: { principalType: 'user', userId: 'actor' },
    operation: { code: 'job.assign', requiredCapability: 'app:dispatch:job:assign',
      platformAccess: { roleAssertions: { roleCodes: ['repair_tech'] } } },
  } };
  const input: DataTransactionRequest = {
    schemaVersion: 'openxiangda.data-transaction-request/v2', idempotencyKey: 'assign-1',
    guards: [{ kind: 'role-member', userId: 'repairer', roleCode: 'repair_tech', errorCode: 'OPENXIANGDA_ASSIGNEE_INVALID' }],
    operations: [{ operation: 'create', resourceCode: 'jobs', data: {} }],
  };
  const calls: unknown[][] = [];
  const platform: any = { transactData: async (...args: unknown[]) => {
    calls.push(args); return { replayed: false, items: [] };
  } };
  const business = new OpenXiangdaBusinessDataApiService(request, platform);
  await business.transaction(input);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]![2], input);
  assert.equal((calls[0]![3] as any).code, 'job.assign');
  delete request.openxiangda.operation.platformAccess;
  await assert.rejects(business.transaction(input), /OPENXIANGDA_ROLE_ASSERTION_NOT_DECLARED/);
  request.headers['x-openxiangda-business-action'] = 'job.assign';
  delete request.openxiangda.operation;
  await assert.rejects(business.transaction(input), /OPENXIANGDA_BUSINESS_ACTION_OPERATION_REQUIRED/);
  await assert.rejects(new OpenXiangdaDataApiService(request, platform).transaction(input), /OPENXIANGDA_ROLE_ASSERTION_ACTION_REQUIRED/);
  const credentials: any = { withAuthorization: () => { throw new Error('凭据不应被读取'); } };
  await assert.rejects(new OpenXiangdaApplicationDataApiService(platform, credentials).transaction(input), /OPENXIANGDA_ROLE_ASSERTION_ACTION_REQUIRED/);
  assert.equal(calls.length, 1);
});
