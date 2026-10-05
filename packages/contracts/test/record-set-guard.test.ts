import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDataTransactionRequest, ContractValidationError, contractSchemas,
  isDataTransactionRecordSetMatchGuard } from '../src/index.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const guard = (count = 50) => ({ kind: 'record-set-match', resourceCode: 'countries',
  errorCode: 'OPENXIANGDA_MASTER_CHANGED',
  records: Array.from({ length: count }, (_, n) => ({ id: id(n), expectedRevision: n + 1 })),
  where: { field: 'enabled', operator: 'eq', value: true } });
const request = (guards: unknown[] = [guard()]) => ({ schemaVersion: 'openxiangda.data-transaction-request/v2',
  idempotencyKey: 'original', guards, operations: [{ operation: 'create', resourceCode: 'trips', data: { title: '合成行程' } }] });

test('set guard accepts bounded read preconditions while keeping the 20 guard budget', () => {
  assert.doesNotThrow(() => assertDataTransactionRequest(request([guard(500)])));
  assert.equal(isDataTransactionRecordSetMatchGuard(guard(500)), true);
  assert.equal(contractSchemas.dataTransactionRequest.properties.guards.maxItems, 20);
  assert.throws(() => assertDataTransactionRequest(request(Array.from({ length: 21 }, () => guard(1)))), ContractValidationError);
});

test('set guards reject duplicates, per-set and total overflow, fabricated authority and SQL', () => {
  const upperId = 'ABCDEF00-0000-4000-8000-000000000001';
  for (const value of [guard(0), guard(501), { ...guard(1), records: [{ id: id(1), expectedRevision: 0 }] },
    { ...guard(1), records: [{ id: 'not-a-uuid', expectedRevision: 1 }] },
    { ...guard(1), records: [{ id: upperId, expectedRevision: 1 }, { id: upperId.toLowerCase(), expectedRevision: 2 }] },
    { ...guard(1), actorUserId: id(1) }, { ...guard(1), sql: 'true' },
    { ...guard(1), where: { and: [] } }, { ...guard(1), where: { sql: 'true' } },
    { ...guard(1), records: [{ id: id(1), expectedRevision: Number.MAX_SAFE_INTEGER + 1 }] }]) {
    assert.throws(() => assertDataTransactionRequest(request([value])), ContractValidationError);
  }
  assert.throws(() => assertDataTransactionRequest(request([guard(250), { ...guard(251), resourceCode: 'departments' }])), ContractValidationError);
  assert.throws(() => assertDataTransactionRequest(request([guard(1), guard(1)])), ContractValidationError);
});

test('set match cannot replace the mutation assertion required by increment', () => {
  assert.throws(() => assertDataTransactionRequest({ ...request([guard(1)]), operations: [
    { operation: 'increment', resourceCode: 'countries', id: id(0), field: 'used', amount: 1 },
  ] }), ContractValidationError);
});
