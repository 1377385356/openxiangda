import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts/browser';
import {
  buildWorkflowNamedOperationInput,
  parseWorkflowNamedOperationResult,
  workflowLaunchContractJsonEqual,
  workflowContextScalarValue,
  processStatusReadRetryDelay,
} from '../src/browser/workflow-launch.js';

test('流程上下文单选值从当前枚举恢复显示快照，拒绝未知和已删除选项', () => {
  const field = { type: 'option.single' as const, options: [
    { value: 'JOIN', label: '加入社团', color: 'blue' },
    { value: 'EXIT', label: '退出社团' },
  ] };
  assert.deepEqual(workflowContextScalarValue(field, 'JOIN'), { value: 'JOIN', label: '加入社团', color: 'blue' });
  assert.deepEqual(workflowContextScalarValue(field, 'EXIT'), { value: 'EXIT', label: '退出社团' });
  assert.throws(() => workflowContextScalarValue(field, 'REMOVED'), /CONTEXT_VALUE_INVALID/);
  assert.throws(() => workflowContextScalarValue({ ...field, options: [] }, 'JOIN'), /CONTEXT_VALUE_INVALID/);
  assert.equal(workflowContextScalarValue({ type: 'boolean' }, 'false'), false);
});

test('mounts workflow submission as a standalone user page on both devices', () => {
  const applicationSource = readFileSync(
    new URL('../src/browser/application.tsx', import.meta.url),
    'utf8',
  );
  const pageSource = readFileSync(
    new URL(
      '../src/browser/components/workflow/StandardWorkflowPages.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const submissionSource = pageSource.slice(
    pageSource.indexOf('export function WorkflowSubmissionPage'),
    pageSource.indexOf('interface ProcessSubmissionRendererProps'),
  );

  assert.match(
    applicationSource,
    /<WorkflowSubmissionPage\s+instancePath=\{workflowInstanceRoute\?\.desktop\.path\}/,
  );
  assert.match(
    applicationSource,
    /<WorkflowSubmissionPage\s+instancePath=\{workflowInstanceRoute\?\.mobile\.path\}\s+variant="mobile"/,
  );
  assert.doesNotMatch(submissionSource, /<Shell\b/);
  assert.match(submissionSource, /oxa-workflow-submission-standalone-page/);
  assert.doesNotMatch(submissionSource, /\/admin\/workflows/);
  assert.match(pageSource, /<ResourceFormContent[\s\S]*submitDisabled=\{props\.submitted\} submitLabel="提交审批"/);
  assert.match(pageSource, /props\.processing && <Alert type="info" showIcon title="正在提交申请，请稍候…"/);
  assert.match(pageSource, /definition\.processOperationCode/);
  assert.doesNotMatch(pageSource, /提交状态 ·/);
  assert.doesNotMatch(pageSource, /提交命令已受理/);
  assert.doesNotMatch(pageSource, /命令可安全恢复，页面会按 commandId 自动刷新/);
});

const intent = {
  operationCode: 'reservation.submit',
  method: 'POST' as const,
  href: '/api/reservations/submit',
  requiredCapability: 'app:reference:reservation:submit',
  requestSchemaDigest: 'a'.repeat(64),
  responseSchemaDigest: 'b'.repeat(64),
  inputs: {
    idempotencyKey: { source: 'idempotency-key' as const },
    applicant: { source: 'current-user-reference' as const },
    id: { source: 'subject-id' as const },
    expectedRevision: { source: 'subject-revision' as const },
    requestedAt: { source: 'requested-at' as const },
    purpose: { source: 'field' as const, fieldCode: 'purpose' },
  },
  output: {
    subjectId: 'id',
    subjectRevision: 'revision',
    processCommand: 'processCommand',
  },
};

test('compares JSONB-reordered launch contracts by structure', () => {
  const generated = {
    idempotencyKey: { source: 'idempotency-key' },
    applicant: { source: 'current-user-reference' },
    jobNo: { source: 'field', fieldCode: 'jobNo' },
    name: { source: 'field', fieldCode: 'name' },
    department: { source: 'field', fieldCode: 'department' },
  };
  const runtimeSurface = {
    name: { fieldCode: 'name', source: 'field' },
    jobNo: { fieldCode: 'jobNo', source: 'field' },
    applicant: { source: 'current-user-reference' },
    department: { fieldCode: 'department', source: 'field' },
    idempotencyKey: { source: 'idempotency-key' },
  };

  assert.equal(
    workflowLaunchContractJsonEqual(generated, runtimeSurface),
    true,
  );
  assert.equal(
    workflowLaunchContractJsonEqual(generated, {
      ...runtimeSurface,
      name: { fieldCode: 'displayName', source: 'field' },
    }),
    false,
  );
  assert.equal(
    workflowLaunchContractJsonEqual(
      [
        { queryParameter: 'applicantId', fieldCode: 'applicant' },
        { queryParameter: 'profileId', fieldCode: 'memberProfile' },
      ],
      [
        { queryParameter: 'profileId', fieldCode: 'memberProfile' },
        { queryParameter: 'applicantId', fieldCode: 'applicant' },
      ],
    ),
    false,
  );
});

test('builds a named-operation request only from sealed launch input sources', () => {
  assert.deepEqual(
    buildWorkflowNamedOperationInput(intent, {
      values: { purpose: '技术交流', browserInjected: 'forbidden' },
      idempotencyKey: 'idempotency-1',
      requestedAt: '2026-09-03T00:00:00.000Z',
      subject: { id: 'subject-1', revision: 7 },
      subjectProfile: {
        schemaVersion: SCHEMA_VERSIONS.subjectProfile,
        userId: 'user-1',
        displayName: '张三',
        avatarUrl: null,
        jobNumber: '10001',
        affiliatedDepartment: { id: 'department-1', name: '信息中心' },
      },
    }),
    {
      idempotencyKey: 'idempotency-1',
      applicant: {
        value: 'user-1',
        label: '张三',
        employeeNo: '10001',
        departments: [{ value: 'department-1', label: '信息中心' }],
      },
      id: 'subject-1',
      expectedRevision: 7,
      requestedAt: '2026-09-03T00:00:00.000Z',
      purpose: '技术交流',
    },
  );
});

test('accepts an explicit completed-without-workflow named-operation result', () => {
  assert.deepEqual(
    parseWorkflowNamedOperationResult(
      intent,
      { id: 'subject-1', revision: 8, processCommand: null },
      {
        appCode: 'reference',
        environmentKey: 'production',
        workflowCode: 'reservation-approval',
        resourceCode: 'reservations',
      },
    ),
    {
      kind: 'completed-without-workflow',
      subjectId: 'subject-1',
      subjectRevision: 8,
    },
  );
});

test('accepts only a durable command sealed to the operation subject and workflow', () => {
  const command = {
    schemaVersion: SCHEMA_VERSIONS.businessProcessCommand,
    id: 'command-1',
    appCode: 'reference',
    environmentKey: 'production',
    operationCode: 'reservation.submit',
    workflowCode: 'reservation-approval',
    subject: {
      resourceCode: 'reservations',
      id: 'subject-1',
      dataRevision: 8,
    },
  };
  const expected = {
    appCode: 'reference',
    environmentKey: 'production',
    workflowCode: 'reservation-approval',
    resourceCode: 'reservations',
  };
  assert.equal(
    parseWorkflowNamedOperationResult(
      intent,
      { id: 'subject-1', revision: 8, processCommand: command },
      expected,
    ).kind,
    'workflow-command',
  );
  assert.throws(
    () =>
      parseWorkflowNamedOperationResult(
        intent,
        {
          id: 'subject-1',
          revision: 8,
          processCommand: { ...command, workflowCode: 'another-workflow' },
        },
        expected,
      ),
    /OPENXIANGDA_WORKFLOW_NAMED_OPERATION_COMMAND_MISMATCH/,
  );
});

test('状态恢复只重试暂态读取，并同时受次数和总时限约束', () => {
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(processStatusReadRetryDelay({ status }, 1, 0), 500);
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(processStatusReadRetryDelay({ status }, 1, 0), null);
  assert.equal(processStatusReadRetryDelay(new TypeError('Failed to fetch'), 2, 1000), 1000);
  assert.equal(processStatusReadRetryDelay(new Error('scope mismatch'), 1, 0), null);
  assert.equal(processStatusReadRetryDelay({ status: 503 }, 6, 0), null);
  assert.equal(processStatusReadRetryDelay({ status: 503 }, 1, 59_800), null);
});
