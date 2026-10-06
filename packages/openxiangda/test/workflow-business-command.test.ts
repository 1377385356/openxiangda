import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApplicationLoginSurface, loadWorkflowTaskSurface, executeWorkflowOperation, logoutCurrentUser } from '../src/browser/platform-client';

test('fixed handler dispatch preserves the original Workflow CSRF, subject and unknown-result key', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document;
  const meta: Record<string, string> = { 'openxiangda-runtime-base': '/dev/command-review', 'openxiangda-app-code': 'command-review', 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: meta[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  const operation = { key: 'approve', kind: 'workflow_command', visible: true, enabled: true, execute: { method: 'POST', href: '/must-not-dispatch', operationCode: 'decide-request' } };
  const token = 'A'.repeat(43); let csrf = 'original-csrf', issuedCsrf = '', writes = 0, deny = false;
  const bodies: any[] = [];
  const response = (data: unknown) => Response.json({ code: 200, data });
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('/auth/surface')) return response({ csrfToken: csrf });
    if (path.endsWith('/auth/logout')) return response({});
    if (path.includes('/workflow/tasks/')) {
      issuedCsrf = new Headers(init?.headers).get('x-openxiangda-csrf-token')!;
      return response({ commandToken: token, commandTokenExpiresAt: new Date(Date.now() + 60000).toISOString(),
        instance: { id: 'instance', workflowCode: 'request-approval', dataRef: { resourceCode: 'requests', id: 'record' } }, task: { id: 'task' },
        presentation: { businessDetail: { status: 'ready', sourceRevision: 3, record: {}, subtables: {} } }, operations: [operation] });
    }
    if (path.includes('/operation-surfaces/decide-request/execute')) {
      writes++; assert.equal(new Headers(init?.headers).get('x-openxiangda-csrf-token'), issuedCsrf);
      bodies.push(JSON.parse(String(init?.body)));
      if (writes === 1) throw new TypeError('response lost');
      return response({ result: { status: 'approved', dataRevision: 4 } });
    }
    if (path.includes('/operation-surfaces')) return response({ operations: deny ? [] : [{ code: 'decide-request', appVersionId: 'version',
      environmentHeadRevision: 9, method: 'POST', behavior: 'controlled', idempotency: 'required', subject: { resourceCode: 'requests', inputField: 'recordId' } }] });
    throw new Error(`Unexpected path ${path}`);
  };
  try {
    await loadApplicationLoginSurface({ device: 'desktop', returnTo: '/' });
    const surface = await loadWorkflowTaskSurface('task');
    csrf = 'rotated-csrf'; await loadApplicationLoginSurface({ device: 'desktop', returnTo: '/' });
    const input = { comment: '同意', form: { expectedRevision: 3, values: { leader: 'leader' } } };
    await assert.rejects(() => executeWorkflowOperation(surface, surface.operations[0]!, input, { idempotencyKey: 'original' }), /未取得确定响应/);
    assert.equal(writes, 1, 'uncertain writes must not automatically retry');
    const result = await executeWorkflowOperation(surface, surface.operations[0]!, input, { idempotencyKey: 'original' });
    assert.equal(result.dataRevision, 4); assert.deepEqual(bodies[0], bodies[1]);
    assert.deepEqual(bodies[0].input, { workflowCode: 'request-approval', target: { kind: 'task', id: 'task', command: 'approve' },
      recordId: 'record', expectedRevision: 3, commandToken: token, idempotencyKey: 'original', input });
    surface.operations[0]!.key = 'resubmit';
    const correctionInput = { form: { expectedRevision: 3, values: { leader: 'changed-leader' } } };
    await executeWorkflowOperation(surface, surface.operations[0]!, correctionInput, { idempotencyKey: 'original-correction' });
    assert.deepEqual(bodies[2].input.target, { kind: 'task', id: 'task', command: 'resubmit' });
    assert.equal(bodies[2].input.idempotencyKey, 'original-correction');
    assert.deepEqual(bodies[2].input.input, correctionInput);
    deny = true;
    await assert.rejects(() => executeWorkflowOperation(surface, surface.operations[0]!, input, { idempotencyKey: 'original' }), /BUSINESS_OPERATION_UNAVAILABLE/);
    assert.equal(writes, 3, 'missing action must not fall back to a standard Workflow command');
    await logoutCurrentUser();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete (globalThis as any).document; else globalThis.document = originalDocument;
  }
});
