import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  validateWorkflowInstanceCommandPolicies,
  workflowInstanceCommandDeadlineError,
  workflowInstanceTerminateCapabilityAllowed,
  workflowPolicyTimestamp,
} from '../src/native-compiler/workflow-instance-policy.js';
import type { WorkflowInstanceCommandPolicies } from '../src/types.js';

const capability = 'app:reservations:meeting:cancel';
const policies: WorkflowInstanceCommandPolicies = {
  withdraw: { beforeFact: 'startsAt' },
  terminate: { capability, beforeFact: 'startsAt' },
};
function fixture() {
  return {
    instanceCommands: structuredClone(policies),
    subject: { factProjection: { startsAt: 'starts_at' } },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['startsAt'],
      properties: { startsAt: { type: 'string', format: 'date-time' } },
    },
  };
}
const context = {
  appCode: 'reservations',
  capabilities: [capability],
  fields: new Map([['starts_at', { type: 'datetime', nullable: false }]]),
};

test('policy contracts are optional and validate the declared owner and required fact', () => {
  assert.deepEqual(validateWorkflowInstanceCommandPolicies({}, context), []);
  assert.deepEqual(
    validateWorkflowInstanceCommandPolicies(fixture(), context),
    []
  );
  for (const invalid of [
    null,
    {},
    [],
    { approve: {} },
    { withdraw: {} },
    {
      withdraw: { beforeFact: 'startsAt', callback: 'http://example.invalid' },
    },
    { terminate: { capability: '*' } },
    { terminate: { capability: 'app:other:cancel' } },
    { terminate: { capability: 'app:reservations:unknown' } },
  ]) {
    assert.ok(
      validateWorkflowInstanceCommandPolicies(
        { ...fixture(), instanceCommands: invalid },
        context
      ).length
    );
  }
  const missing = fixture();
  missing.inputSchema.required = [];
  assert.match(
    validateWorkflowInstanceCommandPolicies(missing, context).join(),
    /DEADLINE_FACT_INVALID/
  );
  for (const field of [
    { type: 'text.short' },
    { type: 'datetime', nullable: true },
  ]) {
    assert.ok(
      validateWorkflowInstanceCommandPolicies(fixture(), {
        ...context,
        fields: new Map([['starts_at', field]]),
      }).length
    );
  }
});

test('database-time deadline is strict at equality, offset-aware, and fails closed', () => {
  const facts = { startsAt: '2026-09-08T09:00:00+08:00' };
  for (const command of ['withdraw', 'terminate'] as const) {
    assert.equal(
      workflowInstanceCommandDeadlineError(
        policies,
        command,
        facts,
        '2026-09-08T00:59:59.999Z'
      ),
      null
    );
    assert.equal(
      workflowInstanceCommandDeadlineError(
        policies,
        command,
        facts,
        '2026-09-08T01:00:00Z'
      ),
      'WORKFLOW_V2_CANCELLATION_DEADLINE_PASSED'
    );
    assert.equal(
      workflowInstanceCommandDeadlineError(
        policies,
        command,
        facts,
        new Date('2026-09-08T01:00:00.001Z')
      ),
      'WORKFLOW_V2_CANCELLATION_DEADLINE_PASSED'
    );
    for (const startsAt of [
      null,
      undefined,
      1788800000000,
      '',
      '2026-09-08',
      '2026-09-08T09:00:00',
      '2026-02-30T09:00:00Z',
      '2026-09-08T24:00:00Z',
    ]) {
      assert.equal(
        workflowInstanceCommandDeadlineError(
          policies,
          command,
          { startsAt },
          '2026-09-08T00:00:00Z'
        ),
        'WORKFLOW_V2_CANCELLATION_DEADLINE_INVALID'
      );
    }
    assert.equal(
      workflowInstanceCommandDeadlineError(
        policies,
        command,
        facts,
        new Date(NaN)
      ),
      'WORKFLOW_V2_CANCELLATION_DEADLINE_INVALID'
    );
  }
  assert.equal(
    workflowInstanceCommandDeadlineError(
      undefined,
      'withdraw',
      {},
      new Date(NaN)
    ),
    null
  );
  assert.equal(
    workflowPolicyTimestamp('2024-02-29T00:00:00Z'),
    Date.parse('2024-02-29T00:00:00Z')
  );
});

test('delegated read/termination authority follows the exact current grant', () => {
  assert.equal(
    workflowInstanceTerminateCapabilityAllowed(policies, [capability]),
    true
  );
  assert.equal(
    workflowInstanceTerminateCapabilityAllowed(policies, [
      capability,
      'app:reservations:read',
    ]),
    true
  );
  assert.equal(workflowInstanceTerminateCapabilityAllowed(policies, []), false);
  assert.equal(
    workflowInstanceTerminateCapabilityAllowed(policies, [
      'app:reservations:*',
    ]),
    false
  );
  assert.equal(
    workflowInstanceTerminateCapabilityAllowed(undefined, [capability]),
    false
  );
});

test('platform CJS and application ESM consume identical policy rules', () => {
  const cjs = createRequire(import.meta.url)(
    '../dist/native-compiler/index.cjs'
  );
  assert.deepEqual(
    cjs.validateWorkflowInstanceCommandPolicies(fixture(), context),
    []
  );
  const args = [
    policies,
    'withdraw',
    { startsAt: '2026-09-08T01:00:00Z' },
    '2026-09-08T01:00:00Z',
  ] as const;
  assert.equal(
    cjs.workflowInstanceCommandDeadlineError(...args),
    workflowInstanceCommandDeadlineError(...args)
  );
});
