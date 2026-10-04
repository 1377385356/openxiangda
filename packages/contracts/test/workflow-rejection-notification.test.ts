import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkflowRejectionNotificationSnapshot,
  validateWorkflowRejectionNotification,
  WORKFLOW_REJECTION_NOTIFICATION_SCHEMA,
} from '../src/native-compiler/workflow-rejection-notification.js';

const policy = { recipient: 'record_last_modifier' as const, title: '审批拒绝', summary: '您有一个审批被拒绝，请查看' };
const definition = { subject: { resourceCode: 'requests' }, rejectionNotification: policy };
const ready = { schemaVersion: WORKFLOW_REJECTION_NOTIFICATION_SCHEMA, ...policy, status: 'ready', userId: 'writer-b', sourceRevision: 3 };

test('policy is optional, closed, bounded, and tied to a business subject', () => {
  assert.deepEqual(validateWorkflowRejectionNotification({}), []);
  assert.deepEqual(validateWorkflowRejectionNotification(definition), []);
  assert.deepEqual(validateWorkflowRejectionNotification({ rejectionNotification: policy }), ['WORKFLOW_REJECTION_NOTIFICATION_SUBJECT_REQUIRED']);
  for (const patch of [{ recipient: 'initiator' }, { recipients: ['caller'] }, { title: '' }, { summary: '  ' },
    { title: 'a'.repeat(161) }, { summary: 'b'.repeat(501) }, { fallbackUserId: 'caller' }, { enabled: false }]) {
    assert.ok(validateWorkflowRejectionNotification({ ...definition, rejectionNotification: { ...policy, ...patch } }).length);
  }
  for (const value of [null, [], 'notification']) assert.ok(validateWorkflowRejectionNotification({ ...definition, rejectionNotification: value }).length);
});

test('only complete Workflow snapshots are usable; arbitrary send payloads and internal facts stay excluded', () => {
  assert.equal(isWorkflowRejectionNotificationSnapshot(ready), true);
  for (const patch of [{ schemaVersion: 'wrong' }, { status: 'pending' }, { userId: '' }, { userId: 'x'.repeat(256) },
    { sourceRevision: 0 }, { sourceRevision: '3' }, { sourceRevision: 1.1 }, { userIds: ['extra'] }, { token: 'private' }, { facts: {} }]) {
    assert.equal(isWorkflowRejectionNotificationSnapshot({ ...ready, ...patch }), false);
  }
});

test('skipped snapshots preserve a specific reason and never contain a guessed recipient', () => {
  const skipped = { schemaVersion: WORKFLOW_REJECTION_NOTIFICATION_SCHEMA, ...policy, status: 'skipped', reason: 'record_missing', sourceRevision: null };
  assert.equal(isWorkflowRejectionNotificationSnapshot(skipped), true);
  for (const reason of ['modifier_missing', 'modifier_ineligible']) {
    assert.equal(isWorkflowRejectionNotificationSnapshot({ ...skipped, reason, sourceRevision: 4 }), true);
    assert.equal(isWorkflowRejectionNotificationSnapshot({ ...skipped, reason }), false);
  }
  assert.equal(isWorkflowRejectionNotificationSnapshot({ ...skipped, userId: 'initiator' }), false);
  assert.equal(isWorkflowRejectionNotificationSnapshot({ ...skipped, reason: 'use_initiator' }), false);
  assert.equal(isWorkflowRejectionNotificationSnapshot({ ...skipped, sourceRevision: 1 }), false);
});
