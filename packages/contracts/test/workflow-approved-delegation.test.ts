import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateWorkflowApprovedDelegation, workflowApprovedDelegationRequests } from '../src/native-compiler/workflow-approved-delegation.js';

const subject = 'membership:00000000-0000-4000-8000-000000000001';
const delegateSubject = 'membership:00000000-0000-4000-8000-000000000002';
const request = () => ({ delegatorRoleSubjectKey: subject, delegatorRoleSubjectRevision: 1,
  delegate: { value: 'delegate-user', label: '代理人' }, delegateRoleSubjectKey: delegateSubject,
  expectedDelegateRevision: 1, workflowCode: 'ordinary-flow', nodeId: 'review',
  validFrom: '2040-01-01T00:00:00Z', validTo: '2040-01-02T00:00:00Z', reason: '合成代理' });
const definition = () => ({ startAt: 'confirm', subject: { factProjection: { requests: 'requests' } },
  approvedDelegation: { confirmationNodeId: 'confirm', confirmer: 'initiator' as 'initiator' | 'delegate', requestsField: 'requests', maxRequests: 500 },
  inputSchema: { properties: { requests: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false } } } },
  nodes: { confirm: { id: 'confirm', kind: 'approval', mode: 'single', onApprove: 'done', onReject: 'rejected' },
    done: { id: 'done', kind: 'end', outcome: 'approved' }, rejected: { id: 'rejected', kind: 'end', outcome: 'rejected' } } as Record<string, any> });

test('manual initiator and delegate contracts require an owned, bounded request collection', () => {
  const flow = definition(); assert.deepEqual(validateWorkflowApprovedDelegation(flow), []);
  flow.approvedDelegation.confirmer = 'delegate'; assert.deepEqual(validateWorkflowApprovedDelegation(flow), []);
  delete (flow as any).approvedDelegation; assert.deepEqual(validateWorkflowApprovedDelegation(flow), []);
});
for (const [name, patch] of Object.entries({ skip: { emptyPolicy: 'skip' }, automatic: { initiatorApprovalPolicy: 'auto_approve' },
  multi: { mode: 'all' }, deadline: { completionDeadline: {} }, transfer: { allowedOperations: ['approve', 'transfer'] },
  adminAssignee: { administration: { assigneeProviders: ['fixed_users'] } } })) {
  test(`${name} cannot substitute for a direct confirmation`, () => {
    const flow = definition(); Object.assign(flow.nodes.confirm, patch);
    assert.ok(validateWorkflowApprovedDelegation(flow).includes('WORKFLOW_APPROVED_DELEGATION_CONFIRMATION_INVALID'));
  });
}
test('a condition branch or rejected path that bypasses confirmation is refused', () => {
  const flow = definition(); flow.startAt = 'choice';
  flow.nodes.choice = { kind: 'condition', otherwise: 'confirm', branches: [{ target: 'done' }] };
  assert.ok(validateWorkflowApprovedDelegation(flow).includes('WORKFLOW_APPROVED_DELEGATION_CONFIRMATION_BYPASS'));
});
test('open, unprojected or unbounded request schemas are refused', () => {
  for (const change of ['open', 'unprojected', 'unbounded']) {
    const flow = definition();
    if (change === 'open') (flow.inputSchema.properties.requests.items as any).additionalProperties = true;
    if (change === 'unprojected') delete (flow.subject.factProjection as any).requests;
    if (change === 'unbounded') delete (flow.inputSchema.properties.requests as any).maxItems;
    assert.ok(validateWorkflowApprovedDelegation(flow).includes('WORKFLOW_APPROVED_DELEGATION_REQUEST_SCHEMA_INVALID'));
  }
});
test('same workflow and membership on distinct nodes stays as two requests', () => {
  const flow = definition(); const rows = [request(), { ...request(), nodeId: 'final' }];
  const before = JSON.stringify(rows); const parsed = workflowApprovedDelegationRequests(flow.approvedDelegation, { data: { requests: rows } });
  assert.deepEqual(parsed.map(row => row.nodeId), ['review', 'final']); assert.equal(JSON.stringify(rows), before);
});
test('500 bounded rows parse;501 or more than256KiB cannot enter a grant transaction', () => {
  const flow = definition(); const rows = Array.from({ length: 500 }, request);
  assert.equal(workflowApprovedDelegationRequests(flow.approvedDelegation, { data: { requests: rows } }).length, 500);
  assert.throws(() => workflowApprovedDelegationRequests(flow.approvedDelegation, { data: { requests: [...rows, request()] } }));
  assert.throws(() => workflowApprovedDelegationRequests(flow.approvedDelegation, { data: { requests: rows.map(row => ({ ...row, reason: 'x'.repeat(4000) })) } }));
});
test('delegate-confirmed batch cannot contain another delegate', () => {
  const flow = definition(); flow.approvedDelegation.confirmer = 'delegate';
  assert.throws(() => workflowApprovedDelegationRequests(flow.approvedDelegation, { data: { requests: [request(), { ...request(), delegate: { value: 'other', label: '其他人' } }] } }));
});
for (const patch of [{ actorUserId: 'forged' }, { approved: true }, { delegatorRoleSubjectRevision: '1' },
  { delegateRoleSubjectKey: 'user:delegate' }, { workflowCode: null, nodeId: 'review' },
  { validTo: '2040-01-01T00:00:00Z' }, { validFrom: 'invalid' }, { reason: ' ' }]) {
  test(`malformed scope/authority input is refused: ${Object.keys(patch)[0]}`, () => {
    assert.throws(() => workflowApprovedDelegationRequests(definition().approvedDelegation, { data: { requests: [{ ...request(), ...patch }] } }));
  });
}

test('invalid calendar dates and clock values cannot silently roll into a different grant window', () => {
  for (const validFrom of ['2040-02-30T00:00:00Z', '2041-02-29T00:00:00Z', '2040-04-31T00:00:00Z',
    '2040-01-01T24:00:00Z', '2040-01-01T00:60:00Z', '2040-01-01T00:00:00+24:00']) {
    assert.throws(() => workflowApprovedDelegationRequests(definition().approvedDelegation,
      { data: { requests: [{ ...request(), validFrom, validTo: '2042-01-01T00:00:00Z' }] } }));
  }
  const rows = workflowApprovedDelegationRequests(definition().approvedDelegation,
    { data: { requests: [{ ...request(), validFrom: '2040-02-29T08:00:00+08:00', validTo: '2040-03-01T08:00:00+08:00' }] } });
  assert.equal(rows[0].validFrom, '2040-02-29T00:00:00.000Z');
});
