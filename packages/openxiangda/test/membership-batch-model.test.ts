import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  NativeAuthorizationMutationReceipt,
  NativeRoleMembership,
  NativeRoleMembershipBatchItemResult,
} from 'openxiangda-contracts/browser';
import {
  membershipBatchItems,
  membershipBatchMerge,
  membershipBatchPending,
  membershipBatchReceiptMatches,
  type MembershipBatchSettings,
} from '../src/browser/components/administration/membership-batch-model';

const member: NativeRoleMembership = {
  id: 'member-1',
  environmentId: 'test-env',
  userId: 'synthetic-a',
  roleCode: 'reviewer',
  roleSource: 'manual',
  sourceCode: 'administration',
  maintainable: true,
  immutableReason: null,
  revision: 4,
  status: 'active',
  scopeGrants: [
    { dimensionCode: 'college', values: ['design'], operations: ['read'] },
    { dimensionCode: 'campus', values: ['main'], operations: ['*'] },
  ],
  validFrom: '2026-10-01T00:00:00.000Z',
  validTo: '2026-11-01T00:00:00.000Z',
};
const settings: MembershipBatchSettings = {
  reason: ' 合成核对 ',
  scopeMode: 'keep',
  scopeValues: [],
  fromMode: 'keep',
  toMode: 'keep',
};

test('a dimension replacement preserves other scopes, operation ceilings and individual validity', () => {
  const other = {
    ...member,
    id: 'member-2',
    userId: 'synthetic-b',
    revision: 7,
    validTo: '2026-12-01T00:00:00.000Z',
  };
  let key = 0;
  const draft = membershipBatchItems(
    'update',
    [member, other],
    [],
    '',
    {
      ...settings,
      scopeMode: 'replace_dimension',
      dimensionCode: 'college',
      scopeValues: ['art'],
    },
    () => `op-${++key}`
  );
  assert.deepEqual(
    draft.map((item) =>
      item.operation === 'update'
        ? [
            item.expectedRevision,
            item.scopeGrants,
            item.validFrom,
            item.validTo,
          ]
        : null
    ),
    [
      [
        4,
        [
          member.scopeGrants[1],
          { dimensionCode: 'college', values: ['art'], operations: ['read'] },
        ],
        member.validFrom,
        member.validTo,
      ],
      [
        7,
        [
          member.scopeGrants[1],
          { dimensionCode: 'college', values: ['art'], operations: ['read'] },
        ],
        other.validFrom,
        other.validTo,
      ],
    ]
  );
  assert.equal(draft[0]!.reason, '合成核对');
  assert.equal(member.scopeGrants[0]!.values[0], 'design');
});

test('missing dates and a range invalid for any member block the entire draft before keys are submitted', () => {
  assert.throws(
    () =>
      membershipBatchItems('update', [member], [], '', {
        ...settings,
        toMode: 'set',
      }),
    /有效/
  );
  assert.throws(
    () =>
      membershipBatchItems('update', [member], [], '', {
        ...settings,
        toMode: 'set',
        validTo: 'invalid',
      }),
    /有效/
  );
  assert.throws(
    () =>
      membershipBatchItems(
        'update',
        [member, { ...member, validFrom: '2026-10-20T00:00:00.000Z' }],
        [],
        '',
        { ...settings, toMode: 'set', validTo: '2026-10-10T00:00:00.000Z' }
      ),
    /必须晚于/
  );
  assert.equal(
    membershipBatchItems('update', [member], [], '', {
      ...settings,
      toMode: 'clear',
    })[0]!.operation,
    'update'
  );
});

test('partial success keeps unknown and failed intents without replaying confirmed items', () => {
  let key = 0;
  const items = membershipBatchItems(
    'revoke',
    [member, { ...member, id: 'member-2' }, { ...member, id: 'member-3' }],
    [],
    '',
    settings,
    () => `op-${++key}`
  );
  const unknown: NativeRoleMembershipBatchItemResult = {
    index: 1,
    operationId: 'op-2',
    operation: 'revoke',
    status: 'unconfirmed',
    error: { code: 'UNKNOWN', status: 503, pointer: '', retryable: true },
  };
  const failed: NativeRoleMembershipBatchItemResult = {
    index: 2,
    operationId: 'op-3',
    operation: 'revoke',
    status: 'failed',
    error: { code: 'CONFLICT', status: 409, pointer: '', retryable: false },
  };
  const receipt: NativeAuthorizationMutationReceipt = {
    schemaVersion: 'openxiangda.native-authorization-mutation-receipt/v2',
    operationId: 'op-1',
    operationKind: 'membership.revoke',
    requestDigest: 'a'.repeat(64),
    actorUserId: 'synthetic-admin',
    reason: '合成核对',
    replayed: false,
    createdAt: '2026-10-02T00:00:00.000Z',
    result: { membership: { ...member, status: 'revoked' } },
  };
  const committed: NativeRoleMembershipBatchItemResult = {
    index: 0,
    operationId: 'op-1',
    operation: 'revoke',
    status: 'committed',
    result: {
      membership: { ...member, status: 'revoked' },
      roleSubjectSetVersion: '1',
      receipt,
    },
  };
  const outcomes = membershipBatchMerge(items, {}, [
    committed,
    unknown,
    failed,
  ]);
  assert.deepEqual(
    membershipBatchPending(items, outcomes, {}).map((item) => item.operationId),
    ['op-2', 'op-3']
  );
  assert.deepEqual(
    membershipBatchPending(items, {}, { 'op-1': receipt }).map(
      (item) => item.operationId
    ),
    ['op-2', 'op-3']
  );
  assert.equal(
    membershipBatchPending(items, outcomes, {})[0],
    items[1],
    'unknown recovery retains the original payload and key'
  );
  assert.throws(
    () => membershipBatchMerge(items, {}, [committed, unknown, unknown]),
    /不一致/
  );
  assert.throws(
    () =>
      membershipBatchMerge(items, {}, [
        committed,
        { ...unknown, index: 2 },
        failed,
      ]),
    /不一致/
  );
  assert.throws(
    () => membershipBatchMerge(items, {}, [committed, unknown]),
    /不一致/
  );
  assert.equal(
    membershipBatchReceiptMatches(items[0]!, {
      ...receipt,
      operationId: 'different',
    }),
    false
  );
  assert.equal(
    membershipBatchReceiptMatches(items[0]!, {
      ...receipt,
      result: { membership: { ...member, status: 'active' } },
    }),
    false
  );
});

test('a recovered receipt must match the member, reason, scope and time intent', () => {
  const item = membershipBatchItems(
    'update',
    [member],
    [],
    '',
    settings,
    () => 'original'
  )[0]!;
  const receipt: NativeAuthorizationMutationReceipt = {
    schemaVersion: 'openxiangda.native-authorization-mutation-receipt/v2',
    operationId: 'original',
    operationKind: 'membership.update',
    requestDigest: 'b'.repeat(64),
    actorUserId: 'synthetic-admin',
    reason: '合成核对',
    replayed: true,
    createdAt: '2026-10-02T00:00:00.000Z',
    result: {
      membership: {
        ...member,
        scopeGrants: [...member.scopeGrants].reverse(),
        validFrom: '2026-10-01T00:00:00+00:00',
      },
    },
  };
  assert.equal(membershipBatchReceiptMatches(item, receipt), true);
  for (const result of [
    { ...member, id: 'different' },
    { ...member, validTo: null },
    { ...member, scopeGrants: [] },
  ])
    assert.equal(
      membershipBatchReceiptMatches(item, {
        ...receipt,
        result: { membership: result },
      }),
      false
    );
  assert.equal(
    membershipBatchReceiptMatches(item, { ...receipt, reason: 'different' }),
    false
  );
});
