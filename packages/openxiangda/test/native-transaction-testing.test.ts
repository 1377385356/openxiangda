import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCHEMA_VERSIONS, validateDataTransactionRequest } from '../dist/testing.js';

test('unified testing API validates Native business guards using the shared contract', () => {
  const request = {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey: 'original-submission',
    guards: [{ kind: 'record-match', resourceCode: 'student-profiles',
      id: '00000000-0000-4000-8000-000000000001', lockKey: 'student-profile:1',
      errorCode: 'OPENXIANGDA_STUDENT_PROFILE_CHANGED',
      assertions: [{ kind: 'value', field: 'revision', operator: 'eq', value: 4 }] }],
    operations: [{ operation: 'create', resourceCode: 'requests', data: { reason: 'personal' } }],
  };
  assert.deepEqual(validateDataTransactionRequest(request), []);
  request.guards[0]!.errorCode = 'STUDENT_PROFILE_CHANGED';
  assert.deepEqual(validateDataTransactionRequest(request).map(item => ({ code: item.code, path: item.path })),
    [{ code: 'DATA_TRANSACTION_GUARD_ERROR_CODE_INVALID', path: 'guards[0].errorCode' }]);
});
