import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseAcceptedTime } from '../src/nest.js';
import type { DataTransactionAcceptedTimeValue } from '../src/nest.js';
test('application-facing Nest entry exposes the accepted-time value and its public type', () => {
  const requestedAt: DataTransactionAcceptedTimeValue = databaseAcceptedTime();
  const nextAllowedAt: DataTransactionAcceptedTimeValue = databaseAcceptedTime(1800000);
  assert.deepEqual(requestedAt, { kind: 'database-accepted-time', offsetMilliseconds: 0 });
  assert.deepEqual(nextAllowedAt, { kind: 'database-accepted-time', offsetMilliseconds: 1800000 });
  assert.throws(() => databaseAcceptedTime(0.5));
});
