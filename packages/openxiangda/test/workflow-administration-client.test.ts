import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configureApplicationIdentity,
  loadApplicationAdministrationContext,
  loadWorkflowNodeConfigurations,
  saveWorkflowNodeConfiguration,
} from '../src/core';

test('node configuration SDK consumes the existing admin controller and mounted environment', async () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const metadata: Record<string, string> = {
    'openxiangda-runtime-base': '/dev/workflow-administration-test',
    'openxiangda-app-code': 'workflow-administration-test',
    'openxiangda-environment': 'preproduction',
  };
  configureApplicationIdentity({ appCode: 'workflow-administration-test', appName: '流程配置' });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { querySelector(selector: string) {
      const name = /meta\[name="([^"]+)"\]/.exec(selector)?.[1];
      return name && metadata[name] ? { content: metadata[name] } : null;
    } },
  });
  let failureMode: 'forbidden' | 'conflict' | undefined;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(failureMode
      ? failureMode === 'conflict'
        ? { code: 409, data: { errorCode: 'WORKFLOW_V2_NODE_CONFIGURATION_REVISION_CONFLICT' }, message: '配置已被其他管理员修改' }
        : { code: 403, data: { errorCode: 'OPENXIANGDA_ADMINISTRATION_FORBIDDEN' }, message: '无管理权限' }
      : { code: 200, data: { revision: 4, replayed: false } }), {
      status: failureMode === 'conflict' ? 409 : failureMode === 'forbidden' ? 403 : 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await loadApplicationAdministrationContext();
    await loadWorkflowNodeConfigurations('requests');
    const mutation = {
      expectedHeadRevision: 3, expectedRevision: 4,
      operationId: 'd2f38c3a-df86-428f-9586-f626c7a33212',
      reason: '调整复审方式', patch: { mode: 'all' as const },
    };
    await saveWorkflowNodeConfiguration('requests', 'review', mutation);
    const base = '/service/openxiangda-api/v2/applications/workflow-administration-test/admin';
    assert.equal(requests[0].url, `${base}/context?environmentKey=preproduction`);
    assert.equal(requests[1].url, `${base}/workflows/requests/node-configurations?environmentKey=preproduction`);
    assert.equal(requests[2].url, `${base}/workflows/requests/node-configurations/review`);
    assert.ok(requests.every(item => item.init?.credentials === 'include'));
    assert.deepEqual(JSON.parse(String(requests[2].init?.body)), { ...mutation, environmentKey: 'preproduction' });
    failureMode = 'conflict';
    await assert.rejects(saveWorkflowNodeConfiguration('requests', 'review', mutation), error => {
      const failure = error as Error & { status?: number; code?: string };
      return failure.status === 409 && failure.code === 'WORKFLOW_V2_NODE_CONFIGURATION_REVISION_CONFLICT';
    });
    assert.equal(requests.length, 4, 'Writes must not retry after an explicit CAS conflict');
    failureMode = 'forbidden';
    await assert.rejects(loadWorkflowNodeConfigurations('requests'), error => {
      const failure = error as Error & { status?: number; code?: string };
      return failure.status === 403 && failure.code === 'OPENXIANGDA_ADMINISTRATION_FORBIDDEN';
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else delete (globalThis as { document?: Document }).document;
  }
});
