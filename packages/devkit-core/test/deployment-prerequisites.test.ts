import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDeploymentPrerequisites } from '../src/deployment-prerequisites.js';

const report = () => ({ schemaVersion: 'openxiangda.deployment-prerequisites/v1', appCode: 'example', backend: true, observedAt: new Date().toISOString(), ready: true,
  checks: ['kernel', 'source', 'registry'].map(key => ({ key, state: 'ready', code: 'READY', remediation: '请平台管理员检查' })) });
test('prerequisites bind exact application and required backend and reject partial reports', () => {
  assertDeploymentPrerequisites(report(), 'example', true);
  assert.throws(() => assertDeploymentPrerequisites(report(), 'other', true));
  assert.throws(() => assertDeploymentPrerequisites(report(), 'example', false));
  const partial = report(); partial.checks.pop();
  assert.throws(() => assertDeploymentPrerequisites(partial, 'example', true));
});
test('failed and contradictory or skipped required checks cannot be ready', () => {
  const failed = report(); failed.checks[2]!.state = 'failed'; failed.ready = false;
  assert.throws(() => assertDeploymentPrerequisites(failed, 'example', true), (error: any) => error.code === 'APPLICATION_PREREQUISITES_FAILED');
  failed.ready = true;
  assert.throws(() => assertDeploymentPrerequisites(failed, 'example', true), (error: any) => error.code === 'APPLICATION_PREREQUISITES_RESULT_INVALID');
  failed.checks[2]!.state = 'skipped';
  assert.throws(() => assertDeploymentPrerequisites(failed, 'example', true));
});
