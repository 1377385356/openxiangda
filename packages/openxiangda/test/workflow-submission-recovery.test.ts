import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSIONS, parseBusinessProcessResolution, parseBusinessProcessCommitResult } from 'openxiangda-contracts/browser';
import { workflowSubmissionScope, readPendingWorkflowSubmission, writePendingWorkflowSubmission, clearPendingWorkflowSubmission, standardProcessWasRejected } from '../src/browser/workflow-submission-recovery.js';

test('刷新和换表单保留原操作；定位器按应用/环境/用户/流程隔离，不保存业务内容或授权', () => {
  const map = new Map<string, string>();
  const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
  const key = workflowSubmissionScope('app', 'preproduction', 'user', 'review');
  const locator = { operationCode: 'submit', workflowCode: 'review', idempotencyKey: 'original-key', requestedAt: '2026-09-26T00:00:00.000Z', kind: 'standard' as const };
  assert.equal(writePendingWorkflowSubmission(storage, key, { ...locator, body: 'private', token: 'secret' } as any), true);
  assert.deepEqual(readPendingWorkflowSubmission(storage, key), locator);
  assert.equal([...map.values()].join('').includes('private'), false);
  assert.equal([...map.values()].join('').includes('secret'), false);
  for (const scope of [['other', 'preproduction', 'user', 'review'], ['app', 'production', 'user', 'review'], ['app', 'preproduction', 'other', 'review'], ['app', 'preproduction', 'user', 'other']]) {
    assert.equal(readPendingWorkflowSubmission(storage, workflowSubmissionScope(scope[0]!, scope[1]!, scope[2]!, scope[3]!)), null);
  }
  clearPendingWorkflowSubmission(storage, key, 'another-key');
  assert.deepEqual(readPendingWorkflowSubmission(storage, key), locator);
  clearPendingWorkflowSubmission(storage, key, locator.idempotencyKey);
  assert.equal(readPendingWorkflowSubmission(storage, key), null);
  assert.equal(writePendingWorkflowSubmission(undefined, key, locator), false);
});

test('未观测不是失败，错误回执不能清除原操作，原提交响应同样校验关联', () => {
  const query = { appCode: 'app', environmentKey: 'preproduction' as const, workflowCode: 'review', operationCode: 'submit', idempotencyKey: 'original-key' };
  const command = { schemaVersion: SCHEMA_VERSIONS.businessProcessCommand, ...query, id: '11111111-1111-4111-8111-111111111111', revision: 1 };
  const absent = { schemaVersion: SCHEMA_VERSIONS.businessProcessResolution, ...query, observedAt: '2026-09-26T00:00:00.000Z', outcome: 'not_observed', receipt: null };
  assert.equal(parseBusinessProcessResolution(absent, query).outcome, 'not_observed');
  const committed = { ...absent, outcome: 'committed', receipt: { schemaVersion: SCHEMA_VERSIONS.businessProcessReceipt,
    receiptId: 'receipt', commandId: command.id, operationCode: 'submit', idempotencyKey: 'original-key', requestDigest: 'a'.repeat(64), command } };
  assert.equal(parseBusinessProcessResolution(committed, query).receipt?.commandId, command.id);
  for (const changed of [{ outcome: 'success' }, { receipt: null }, { environmentKey: 'production' }, { idempotencyKey: 'new-key' }, { workflowCode: 'other' }, { observedAt: 'invalid' }]) {
    assert.throws(() => parseBusinessProcessResolution({ ...committed, ...changed }, query), /RESPONSE_INVALID/);
  }
  assert.throws(() => parseBusinessProcessResolution({ ...committed, receipt: { ...committed.receipt, command: { ...command, appCode: 'other' } } }, query), /RESPONSE_INVALID/);
  assert.equal(parseBusinessProcessCommitResult(command, query).id, command.id);
  assert.throws(() => parseBusinessProcessCommitResult({ ...command, idempotencyKey: 'other' }, query), /RESPONSE_INVALID/);
});

test('网络、服务端异常和幂等冲突继续恢复；标准平台明确拒绝可修改输入', () => {
  for (const error of [new Error('network'), { status: 503, code: 'OPENXIANGDA_BUSINESS_PROCESS_UNAVAILABLE' },
    { status: 409, code: 'OPENXIANGDA_BUSINESS_PROCESS_IDEMPOTENCY_IN_PROGRESS' },
    { status: 409, code: 'OPENXIANGDA_BUSINESS_PROCESS_IDEMPOTENCY_CONFLICT' }, { status: 400, code: 'APP_UNKNOWN_AFTER_WRITE' }]) {
    assert.equal(standardProcessWasRejected(error), false);
  }
  assert.equal(standardProcessWasRejected({ status: 400, code: 'OPENXIANGDA_NATIVE_DATA_FIELD_INVALID' }), true);
  assert.equal(standardProcessWasRejected({ status: 409, code: 'OPENXIANGDA_NATIVE_DATA_REVISION_CONFLICT' }), true);
});
