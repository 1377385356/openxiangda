import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeWorkflowDefinitions } from '../src/react';

const subject = {
  resourceCode: 'requests',
  factProjection: { applicant: 'applicant' },
} as const;

test('accepts compiler-owned standard process operations without application callbacks', () => {
  const definitions = normalizeWorkflowDefinitions([
    {
      code: 'record-approval',
      title: '记录审批',
      launch: { mode: 'work-center-only' },
      subject,
    },
    {
      code: 'request-submit',
      title: '申请提交',
      launch: { mode: 'standalone' },
      subject,
      processOperationCode: 'openxiangda.workflow.request-submit.submit',
    },
  ]);
  assert.equal(definitions.get('record-approval')?.title, '记录审批');
  assert.equal(definitions.get('request-submit')?.launch.mode, 'standalone');
  assert.equal(
    definitions.get('request-submit')?.processOperationCode,
    'openxiangda.workflow.request-submit.submit',
  );
});

test('accepts readonly summary fields emitted by generated as-const definitions', () => {
  const readonlySummaryFields = ['applicant'] as const;
  const definitions = normalizeWorkflowDefinitions([
    {
      code: 'record-summary',
      title: '记录摘要',
      launch: { mode: 'work-center-only' },
      subject: {
        resourceCode: 'requests',
        factProjection: { applicant: 'applicant' },
        summaryFields: readonlySummaryFields,
      },
    },
  ]);
  const summaryFields = definitions.get('record-summary')?.subject.summaryFields;
  assert.deepEqual(summaryFields, ['applicant']);
  assert.notEqual(summaryFields, readonlySummaryFields);
});

test('fails closed for missing or self-reported process operation identity', () => {
  assert.throws(
    () =>
      normalizeWorkflowDefinitions([
        {
          code: 'record-approval',
          title: 'record-approval',
          launch: { mode: 'work-center-only' },
          subject,
        },
      ]),
    /OPENXIANGDA_WORKFLOW_TITLE_INVALID/,
  );
  assert.throws(
    () =>
      normalizeWorkflowDefinitions([
        {
          code: 'record-approval',
          title: '记录审批',
          launch: { mode: 'standalone' },
          subject,
        } as never,
      ]),
    /OPENXIANGDA_WORKFLOW_PROCESS_OPERATION_INVALID/,
  );
  assert.throws(
    () =>
      normalizeWorkflowDefinitions([
        {
          code: 'record-approval',
          title: '记录审批',
          launch: { mode: 'standalone' },
          subject,
          processOperationCode: 'application.claimed.operation',
        },
      ]),
    /OPENXIANGDA_WORKFLOW_PROCESS_OPERATION_INVALID/,
  );
});
