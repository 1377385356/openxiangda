import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalDataBusinessIntent } from 'openxiangda-contracts';
import { OpenXiangdaBusinessDataApiService } from '../src/data-api.js';
import { OpenXiangdaPlatformClient } from '../src/platform-client.js';

const id = '11111111-1111-4111-8111-111111111111';
const input = { idempotencyKey: 'original-edit', intent: { id, expectedRevision: 2, reason: '修正', value: '甲' },
  data: { operations: [{ operation: 'update' as const, resourceCode: 'requests', id, expectedRevision: 2, data: { name: '甲' } }] } };
const identity = { idempotencyKey: input.idempotencyKey, intent: input.intent };
function request(): any { return { headers: {}, openxiangda: {
  authorization: 'Bearer verified-invocation', perspectiveCode: null,
  principal: { principalType: 'user', userId: 'actor' },
  operation: { code: 'record.edit', requiredCapability: 'app:example:edit', platformAccess: { dataCommands: { mode: 'recoverable-native' } } },
} }; }
function resolution(committed = false): any { return {
  schemaVersion: 'openxiangda.data-business-command-resolution/v1', appCode: 'example', environmentKey: 'preproduction',
  operationCode: 'record.edit', idempotencyKey: input.idempotencyKey,
  intentDigest: createHash('sha256').update(canonicalDataBusinessIntent(input.intent)).digest('hex'), observedAt: '2026-10-04T00:00:00Z',
  outcome: committed ? 'committed' : 'not_observed', receipt: committed ? {
    id, appVersionId: id, environmentHeadRevision: 1, completedAt: '2026-10-04T00:00:00Z', transaction: {
      schemaVersion: 'openxiangda.data-transaction-result/v2', idempotencyKey: input.idempotencyKey, replayed: false,
      items: [{ index: 0, operation: 'update', resourceCode: 'requests', id, revision: 3 }],
    },
  } : null,
}; }
function harness(reply: () => unknown | Promise<unknown>) {
  const calls: any[] = [];
  const platform = new OpenXiangdaPlatformClient({ appCode: 'example', environmentKey: 'preproduction', platformBaseUrl: 'https://example.invalid',
    fetch: async (url: any, init: any) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ code: 200, data: await reply() })); },
  } as any);
  const req = request();
  return { service: new OpenXiangdaBusinessDataApiService(req, platform), req, calls };
}

test('a declared stage needs its observed instance and matching source guard; no caller may opt out or inject a stage', async () => {
  const h = harness(() => resolution(true));
  const policy = { workflowCode: 'approval', resourceCode: 'requests', actor: 'initiator', runningNodeIds: ['confirm'], allowedStatuses: ['approved'] };
  h.req.openxiangda.operation.platformAccess.workflowStage = policy;
  await assert.rejects(() => h.service.commitCommand(input), /GUARD_INVALID/);
  const guarded: any = { ...input, data: { ...input.data, workflowStage: { instanceId: id, subjectRecordId: id, expectedInstanceSequence: 2 } } };
  await assert.rejects(() => h.service.commitCommand(guarded), /SOURCE_GUARD_REQUIRED/);
  guarded.data.guards = [{ kind: 'record-match', resourceCode: 'requests', id, lockKey: 'subject', errorCode: 'SUBJECT_CHANGED',
    assertions: [{ kind: 'value', field: 'revision', operator: 'eq', value: 2 }] }];
  await h.service.commitCommand(guarded);
  assert.deepEqual(JSON.parse(h.calls[0].init.body).data.workflowStage, guarded.data.workflowStage);
  delete h.req.openxiangda.operation.platformAccess.workflowStage;
  await assert.rejects(() => h.service.commitCommand(guarded), /NOT_DECLARED/);
  assert.equal(h.calls.length, 1);
});

test('commit/resolve inherit the original proof and key; resolve sends no data and no second write', async () => {
  let committed = true;
  const h = harness(() => resolution(committed));
  assert.equal((await h.service.commitCommand(input)).receipt?.transaction.items[0]?.operation, 'update');
  committed = false;
  assert.equal((await h.service.resolveOriginalCommand(identity)).outcome, 'not_observed');
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls[0].url.endsWith('/native/data/business-commands/commit'));
  assert.ok(h.calls[1].url.endsWith('/native/data/business-commands/resolve'));
  for (const call of h.calls) {
    assert.equal(call.init.headers.authorization, 'Bearer verified-invocation');
    assert.equal(call.init.headers['x-openxiangda-business-action-code'], 'record.edit');
    assert.equal(JSON.parse(call.init.body).idempotencyKey, identity.idempotencyKey);
    assert.equal(JSON.parse(call.init.body).environmentKey, 'preproduction');
  }
  assert.equal('data' in JSON.parse(h.calls[1].init.body), false);
});

test('missing declaration, worker principal and fabricated headers do not reach HTTP', async () => {
  const h = harness(() => resolution(true));
  delete h.req.openxiangda.operation.platformAccess;
  await assert.rejects(() => h.service.commitCommand(input), /NOT_DECLARED/);
  h.req.openxiangda.principal.principalType = 'application';
  await assert.rejects(() => h.service.resolveOriginalCommand(identity), /USER_CONTEXT_REQUIRED/);
  h.req.headers['x-openxiangda-business-action-code'] = 'record.edit';
  delete h.req.openxiangda.operation;
  await assert.rejects(() => h.service.resolveOriginalCommand(identity), /OPERATION_REQUIRED/);
  assert.equal(h.calls.length, 0);
});

test('unknown ACK and invalid correlation never trigger automatic writes', async () => {
  const h = harness(() => { throw new Error('response lost'); });
  await assert.rejects(() => h.service.commitCommand(input), /response lost/);
  assert.equal(h.calls.length, 1);
  for (const mutate of [
    (x: any) => { x.idempotencyKey = 'other'; }, (x: any) => { x.intentDigest = '0'.repeat(64); },
    (x: any) => { x.operationCode = 'other'; }, (x: any) => { x.receipt.transaction.items = []; },
    (x: any) => { x.receipt.transaction.items[0].revision = 0; },
    (x: any) => { x.outcome = 'not_observed'; x.receipt = null; },
  ]) {
    const bad = resolution(true); mutate(bad);
    const client = harness(() => bad);
    await assert.rejects(() => client.service.commitCommand(input), /RESPONSE_INVALID/);
    assert.equal(client.calls.length, 1);
  }
});
