import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSIONS, type WorkflowBinding, type WorkflowDefinition } from 'openxiangda-contracts';
import {
  WorkflowCompilationError,
  compileWorkflow,
  defineWorkflow,
  defineWorkflowBinding,
  expr,
  planApprovalDecision,
  planWorkflow,
  insertApprovalParticipant,
  replaceApprovalParticipant,
  selectWorkflowDelegation,
  workflowDelegationWindowsOverlap,
} from '../src/internal/workflow.js';

function fixture() {
  const definition = defineWorkflow({
    schemaVersion: SCHEMA_VERSIONS.workflowDefinition,
    code: 'reservation-approval',
    title: '预约审批',
    acceptedCommandDeactivationPolicy: 'finish-pinned',
    subject: {
      resourceCode: 'reservations',
      factProjection: { amount: 'amount' },
    },
    startAt: 'amount-branch',
    inputSchema: { type: 'object', additionalProperties: false },
    nodes: {
      'amount-branch': {
        id: 'amount-branch',
        kind: 'condition',
        branches: [
          {
            when: expr.gt(expr.path('amount'), expr.literal(50000)),
            target: 'platform-review',
          },
        ],
        otherwise: 'college-review',
      },
      'college-review': {
        id: 'college-review',
        kind: 'approval',
        title: '学院审批',
        binding: 'collegeReviewer',
        mode: 'any',
        onApprove: 'approved',
        onReject: 'rejected',
      },
      'platform-review': {
        id: 'platform-review',
        kind: 'approval',
        title: '平台主管审批',
        binding: 'platformReviewer',
        mode: 'single',
        onApprove: 'approved',
        onReject: 'rejected',
      },
      approved: { id: 'approved', kind: 'end', title: '通过', outcome: 'approved' },
      rejected: { id: 'rejected', kind: 'end', title: '拒绝', outcome: 'rejected' },
    },
  } satisfies WorkflowDefinition);
  const binding = defineWorkflowBinding({
    schemaVersion: SCHEMA_VERSIONS.workflowBinding,
    workflowCode: definition.code,
    bindings: {
      collegeReviewer: {
        provider: 'app_role_in_scope',
        roleCode: 'college_admin',
        scope: { dimension: 'college', valueFrom: 'collegeId' },
      },
      platformReviewer: { provider: 'fixed_users', users: ['reviewer-1'] },
    },
  } satisfies WorkflowBinding);
  return { definition, binding };
}

test('compiles immutable topology and bindings with stable digests', () => {
  const { definition, binding } = fixture();
  assert.deepEqual(definition.subject.summaryFields, []);
  const compiled = compileWorkflow(definition, binding);
  assert.match(compiled.definitionDigest, /^[0-9a-f]{64}$/);
  assert.match(compiled.bindingDigest, /^[0-9a-f]{64}$/);
});

test('rejects duplicate and oversized workflow summary declarations', () => {
  const { definition, binding } = fixture();
  assert.throws(
    () =>
      compileWorkflow(
        {
          ...definition,
          subject: {
            ...definition.subject,
            summaryFields: [
              ...Array.from({ length: 17 }, (_, index) => `field_${index}`),
            ],
          },
        },
        binding,
      ),
    (error) =>
      error instanceof WorkflowCompilationError &&
      error.diagnostics.includes('WORKFLOW_SUMMARY_FIELDS_LIMIT_EXCEEDED'),
  );
  assert.throws(
    () =>
      compileWorkflow(
        {
          ...definition,
          subject: {
            ...definition.subject,
            summaryFields: ['amount', 'amount'],
          },
        },
        binding,
      ),
    (error) =>
      error instanceof WorkflowCompilationError &&
      error.diagnostics.includes('WORKFLOW_SUMMARY_FIELDS_DUPLICATE'),
  );
});

test('uses the same pure planner for preview and runtime', () => {
  const { definition } = fixture();
  assert.equal(planWorkflow(definition, { amount: 60000 }).activeNode?.id, 'platform-review');
  assert.equal(planWorkflow(definition, { amount: 1000 }).activeNode?.id, 'college-review');
});

test('rejects cycles and unsupported arbitrary nodes', () => {
  const { definition, binding } = fixture();
  const invalid = structuredClone(definition) as WorkflowDefinition;
  (invalid.nodes['college-review'] as any).onApprove = 'amount-branch';
  assert.throws(() => compileWorkflow(invalid, binding), WorkflowCompilationError);
  const unsafe = structuredClone(definition) as any;
  unsafe.nodes.script = { id: 'script', kind: 'js_code', source: 'danger()' };
  unsafe.nodes['college-review'].onApprove = 'script';
  assert.throws(() => compileWorkflow(unsafe, binding), WorkflowCompilationError);
});

test('rejects open workflow facts and invalid provider candidate limits', () => {
  const { definition, binding } = fixture();
  const openFacts = structuredClone(definition) as WorkflowDefinition;
  openFacts.inputSchema = { type: 'object' } as WorkflowDefinition['inputSchema'];
  assert.throws(
    () => compileWorkflow(openFacts, binding),
    (error: unknown) =>
      error instanceof WorkflowCompilationError &&
      error.diagnostics.includes('WORKFLOW_INPUT_SCHEMA_ROOT_NOT_CLOSED')
  );

  const invalidLimits = structuredClone(binding) as WorkflowBinding;
  invalidLimits.bindings.collegeReviewer = {
    ...invalidLimits.bindings.collegeReviewer!,
    min: 2,
    max: 201,
  };
  assert.throws(
    () => compileWorkflow(definition, invalidLimits),
    (error: unknown) =>
      error instanceof WorkflowCompilationError &&
      error.diagnostics.includes(
        'WORKFLOW_BINDING_CANDIDATE_LIMIT_INVALID:collegeReviewer'
      )
  );
});

test('plans single, any, all and sequence without quorum or claim states', () => {
  const base = [
    { id: 'a', status: 'active' as const, required: true },
    { id: 'b', status: 'pending' as const, required: true },
  ];
  assert.equal(
    planApprovalDecision({ mode: 'any', participants: base, participantId: 'a', decision: 'approved' }).completed,
    true
  );
  assert.equal(
    planApprovalDecision({ mode: 'all', participants: base, participantId: 'a', decision: 'approved' }).completed,
    false
  );
  const sequence = planApprovalDecision({
    mode: 'sequence',
    participants: base,
    participantId: 'a',
    decision: 'approved',
  });
  assert.equal(sequence.nextParticipantId, 'b');
  assert.equal(sequence.participants[1]?.status, 'active');
});

test('inserts before/after participants and replaces the active participant immutably', () => {
  const primary = [{ id: 'primary', status: 'active' as const, required: true, kind: 'primary' as const }];
  const before = insertApprovalParticipant({
    participants: primary,
    relativeToId: 'primary',
    participant: { id: 'before', status: 'pending', required: true, kind: 'add_sign' },
    position: 'before',
  });
  assert.deepEqual(before.map(item => [item.id, item.status]), [
    ['before', 'active'],
    ['primary', 'pending'],
  ]);
  assert.equal(primary[0]?.status, 'active');

  const after = insertApprovalParticipant({
    participants: primary,
    relativeToId: 'primary',
    participant: { id: 'after', status: 'pending', required: true, kind: 'add_sign' },
    position: 'after',
  });
  assert.deepEqual(after.map(item => [item.id, item.status]), [
    ['primary', 'active'],
    ['after', 'pending'],
  ]);

  const replaced = replaceApprovalParticipant({
    participants: primary,
    participantId: 'primary',
    replacement: { id: 'delegate', status: 'pending', required: true, kind: 'delegate' },
  });
  assert.deepEqual(replaced.map(item => [item.id, item.status, item.required]), [
    ['primary', 'cancelled', false],
    ['delegate', 'active', true],
  ]);

  const twoAfter = insertApprovalParticipant({
    participants: after,
    relativeToId: 'primary',
    participant: { id: 'after-2', status: 'pending', required: true, kind: 'add_sign' },
    position: 'after',
  });
  assert.deepEqual(twoAfter.map(item => item.id), ['primary', 'after', 'after-2']);

  const afterDecision = planApprovalDecision({
    mode: 'any',
    participants: after,
    participantId: 'primary',
    decision: 'approved',
  });
  assert.equal(afterDecision.completed, false);
  assert.equal(afterDecision.nextParticipantId, 'after');
  assert.deepEqual(afterDecision.participants.map(item => [item.id, item.status]), [
    ['primary', 'approved'],
    ['after', 'active'],
  ]);

  const beforeDecision = planApprovalDecision({
    mode: 'single',
    participants: before,
    participantId: 'before',
    decision: 'approved',
  });
  assert.equal(beforeDecision.completed, false);
  assert.equal(beforeDecision.nextParticipantId, 'primary');
  assert.deepEqual(beforeDecision.participants.map(item => [item.id, item.status]), [
    ['before', 'approved'],
    ['primary', 'active'],
  ]);
});

test('selects one active half-open delegation and rejects ambiguous windows', () => {
  const base = {
    schemaVersion: SCHEMA_VERSIONS.workflowDelegation,
    appCode: 'instrument-center',
    environmentKey: 'local',
    delegatorUserId: 'owner',
    delegateUserId: 'delegate',
    delegatorRoleSubjectKey: 'membership:00000000-0000-4000-8000-000000000001',
    delegateRoleSubjectKey: 'membership:00000000-0000-4000-8000-000000000002',
    status: 'active' as const,
    reason: 'leave',
    createdBy: 'owner',
    createdAt: '2026-08-01T00:00:00.000Z',
    revokedAt: null,
  };
  const global = {
    ...base,
    id: 'global',
    workflowCode: null,
    validFrom: '2026-08-13T00:00:00.000Z',
    validTo: '2026-08-20T00:00:00.000Z',
  };
  assert.equal(selectWorkflowDelegation({
    delegations: [global],
    workflowCode: 'reservation-approval',
    delegatorRoleSubjectKey: 'membership:00000000-0000-4000-8000-000000000001',
    at: global.validFrom,
  })?.id, 'global');
  assert.equal(selectWorkflowDelegation({
    delegations: [global],
    workflowCode: 'reservation-approval',
    delegatorRoleSubjectKey: 'membership:00000000-0000-4000-8000-000000000001',
    at: global.validTo,
  }), null);
  const scoped = {
    ...global,
    id: 'scoped',
    workflowCode: 'reservation-approval',
  };
  assert.equal(workflowDelegationWindowsOverlap(global, scoped), true);
  assert.throws(() => selectWorkflowDelegation({
    delegations: [global, scoped],
    workflowCode: 'reservation-approval',
    delegatorRoleSubjectKey: 'membership:00000000-0000-4000-8000-000000000001',
    at: '2026-08-14T00:00:00.000Z',
  }), /WORKFLOW_DELEGATION_AMBIGUOUS/);
  assert.equal(workflowDelegationWindowsOverlap(scoped, {
    ...scoped,
    workflowCode: 'another-workflow',
  }), false);
});
