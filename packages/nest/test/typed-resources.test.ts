import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts';
import { OpenXiangdaDataApiService, OpenXiangdaBusinessDataApiService, OpenXiangdaApplicationDataApiService } from '../src/data-api.js';
import type { OpenXiangdaPlatformClient } from '../src/platform-client.js';
import type { OpenXiangdaApplicationCredentials } from '../src/application-credentials.js';
import type { OpenXiangdaHttpRequest } from '../src/types.js';

interface Resources {
  requests: { record: { id: string; revision: number; title: string }; create: { title: string }; update: { title?: string } };
}

for (const kind of ['user', 'business', 'application'] as const) {
  test(`resource binding preserves ${kind} authority and never adds a read or mutation retry`, async () => {
    const calls: unknown[][] = [];
    const request = { headers: {}, openxiangda: {
      authorization: 'verified-user', perspectiveCode: 'own',
      principal: { principalType: 'user' }, operation: { code: 'submit', requiredCapability: 'submit' },
    } } as unknown as OpenXiangdaHttpRequest;
    let resourceCode = 'requests';
    const record = () => ({ schemaVersion: SCHEMA_VERSIONS.dataRecord, resourceCode, data: { id: 'record-1', revision: 3 } });
    const platform = Object.fromEntries(['getData', 'createData', 'updateData', 'deleteData', 'queryData'].map(method => [method, async (...args: unknown[]) => {
      calls.push([method, ...args]);
      return method === 'queryData'
        ? { schemaVersion: SCHEMA_VERSIONS.dataPage, resourceCode, items: [record().data], total: 1, limit: 20, offset: 0 }
        : record();
    }])) as unknown as OpenXiangdaPlatformClient;
    const credentials = { withAuthorization: (fn: (value: string) => unknown) => fn('verified-application') } as OpenXiangdaApplicationCredentials;
    const service = kind === 'user' ? new OpenXiangdaDataApiService(request, platform)
      : kind === 'business' ? new OpenXiangdaBusinessDataApiService(request, platform)
      : new OpenXiangdaApplicationDataApiService(platform, credentials);
    const client = service.resources<Resources>()('requests');
    const result = await client.get('record-1');
    assert.equal(result.data.revision, 3);
    assert.equal(result.data.title, undefined, 'permission-hidden fields must remain absent');
    await client.create({ title: 'Created' });
    await client.update('record-1', { expectedRevision: 3, data: { title: 'Updated' } });
    await client.delete('record-1', 3);
    const page = await client.query({ schemaVersion: SCHEMA_VERSIONS.dataQuery, select: ['title'] });
    assert.equal(page.total, 1);
    assert.equal(calls.length, 5);
    for (const call of calls) {
      assert.equal(call[1], kind === 'application' ? 'verified-application' : 'verified-user');
      assert.equal(call[2], kind === 'application' ? null : 'own');
      assert.equal(call[3], 'requests');
      if (kind === 'business') assert.deepEqual(call.at(-1), { code: 'submit', requiredCapability: 'submit' });
    }
    resourceCode = 'other-resource';
    await assert.rejects(() => client.get('record-1'), /RESOURCE_RESPONSE_MISMATCH/);
    if (kind !== 'application') {
      delete request.openxiangda;
      await assert.rejects(() => client.get('record-1'), /CONTEXT_NOT_VERIFIED/);
      assert.equal(calls.length, 6, 'bound client must not cache credentials after the context expires');
    }
  });
}
