import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDataTransactionRequest, contractSchemas, type DataTransactionRequest } from '../src/index.js';

function input(): DataTransactionRequest {
  return { schemaVersion: 'openxiangda.data-transaction-request/v2', idempotencyKey: 'event:original',
    operations: [{ operation: 'update', resourceCode: 'contracts', id: 'child', expectedRevision: 4,
      data: { status: { value: 'draft' } } }],
    decimalReservation: { reservationKey: 'submission:original', transitionKey: 'withdraw:original', childOperationIndex: 0 },
  };
}
test('terminal request keeps authority out of its public DTO', () => {
  assert.doesNotThrow(() => assertDataTransactionRequest(input()));
  assert.equal(contractSchemas.dataTransactionRequest.properties.decimalReservation.additionalProperties, false);
  for (const delta of [{ mode: 'release' }, { commandId: 'forged' }, { amount: '1.00' },
    { reservationKey: '' }, { transitionKey: 'x'.repeat(129) }, { childOperationIndex: -1 }, { childOperationIndex: 1 },
    { childOperationIndex: '0' }]) {
    const request = input(); Object.assign(request.decimalReservation!, delta);
    assert.throws(() => assertDataTransactionRequest(request), (error: any) => error.diagnostics?.some((item: any) => item.code === 'DATA_TRANSACTION_DECIMAL_RESERVATION_INVALID'));
  }
});
test('terminal transition selects exactly one update while ordinary transactions remain unchanged', () => {
  const deleted = input(); (deleted.operations[0] as any).operation = 'delete';
  assert.throws(() => assertDataTransactionRequest(deleted));
  const duplicated = input(); duplicated.operations.push({ ...duplicated.operations[0]! });
  assert.throws(() => assertDataTransactionRequest(duplicated));
  const audit = input(); audit.operations.push({ operation: 'create', resourceCode: 'audit-log', data: {} });
  assert.doesNotThrow(() => assertDataTransactionRequest(audit));
  const ordinary = input(); delete ordinary.decimalReservation;
  assert.doesNotThrow(() => assertDataTransactionRequest(ordinary));
});
