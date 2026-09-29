import assert from 'node:assert/strict';
import test from 'node:test';
import { createDataTransaction, DataTransactionBuildError } from '../src/transaction-builder.js';

test('build preserves order and detaches input and output', () => {
  const builder = createDataTransaction('operation-1');
  const data = { name: 'original' };
  const index = builder.operation({ operation: 'create', resourceCode: 'parents', data });
  builder.operation({ operation: 'create', resourceCode: 'children', data: { parent: builder.reference(index) } });
  data.name = 'changed';
  const first = builder.build();
  assert.equal((first.operations[0] as any).data.name, 'original');
  first.operations.length = 0;
  assert.equal(builder.build().operations.length, 2);
  assert.throws(() => builder.reference(5), RangeError);
});

test('record-assert mistakes expose guard index before network submission', () => {
  const builder = createDataTransaction('operation-2');
  builder.guard({ kind: 'record-assert', resourceCode: 'items', id: 'one', lockKey: 'item-one', errorCode: 'OPENXIANGDA_CONFLICT', assertions: [{ kind: 'value', field: 'count', operator: 'gte', value: 0 }] });
  builder.operation({ operation: 'create', resourceCode: 'other', data: {} });
  assert.throws(() => builder.build(), (error: any) => error instanceof DataTransactionBuildError && error.diagnostics.some(item => item.guardIndex === 0 && item.remediation?.includes('record-match')));
  for (let i = 0; i < 2; i++) builder.operation({ operation: 'increment', resourceCode: 'items', id: 'one', field: 'count', amount: 1 });
  assert.throws(() => builder.build(), DataTransactionBuildError);
});

test('single multi-field CAS and read-only guard remain valid', () => {
  const builder = createDataTransaction('operation-3');
  builder.guard({ kind: 'record-match', resourceCode: 'items', id: 'one', lockKey: 'item-one', errorCode: 'OPENXIANGDA_CONFLICT', assertions: [{ kind: 'value', field: 'active', operator: 'eq', value: true }] });
  builder.operation({ operation: 'update', resourceCode: 'items', id: 'one', expectedRevision: 3, data: { count: 2, status: 'ready' } });
  assert.equal(builder.build().operations.length, 1);
  builder.operation({ operation: 'update', resourceCode: 'items', id: 'two', expectedRevision: 0, data: {} });
  assert.equal(builder.diagnose().find(item => item.code === 'DATA_TRANSACTION_REVISION_INVALID')?.operationIndex, 1);
});
