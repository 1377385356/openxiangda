import {
  SCHEMA_VERSIONS,
  validateDataTransactionRequest,
  type DataTransactionGuard,
  type DataTransactionOperation,
  type DataTransactionOperationReference,
  type DataTransactionRequest,
} from 'openxiangda-contracts';

/** Uses the platform's public validator; never includes record values in diagnostics. */
export function diagnoseDataTransaction(value: unknown) {
  return validateDataTransactionRequest(value).map(item => {
    const path = item.path || '';
    const operation = /^operations\[(\d+)\]/.exec(path);
    const guard = /^guards\[(\d+)\]/.exec(path);
    return { ...item,
      ...(operation ? { operationIndex: Number(operation[1]) } : {}),
      ...(guard ? { guardIndex: Number(guard[1]) } : {}),
      ...(item.code === 'DATA_TRANSACTION_RECORD_ASSERT_MUTATION_REQUIRED' ? {
        remediation: '只读条件使用 record-match；同一记录的字段变更合成一次带 expectedRevision 的 update。',
      } : {}),
    };
  });
}

export class DataTransactionBuildError extends Error {
  readonly code = 'OPENXIANGDA_TRANSACTION_BUILD_INVALID';
  constructor(readonly diagnostics: ReturnType<typeof diagnoseDataTransaction>) {
    super(diagnostics.map(item => `${item.path}: ${item.message}`).join('; '));
    this.name = 'DataTransactionBuildError';
  }
}

/** Builds a detached request. No merging, retries, network access or state writes. */
export function createDataTransaction(idempotencyKey: string) {
  const request: DataTransactionRequest = {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey, operations: [], guards: [],
  };
  const builder = {
    operation(operation: DataTransactionOperation): number {
      if (request.operations.length >= 100) throw new RangeError('事务最多包含 100 个操作');
      request.operations.push(structuredClone(operation));
      return request.operations.length - 1;
    },
    guard(guard: DataTransactionGuard) {
      if (request.guards!.length >= 20) throw new RangeError('事务最多包含 20 个约束');
      request.guards!.push(structuredClone(guard));
      return builder;
    },
    reference(operationIndex: number): DataTransactionOperationReference {
      if (!Number.isSafeInteger(operationIndex) || request.operations[operationIndex]?.operation !== 'create')
        throw new RangeError('只能引用当前事务已添加的 create 操作');
      return { operationIndex, field: 'id' };
    },
    decimalReservation(value: NonNullable<DataTransactionRequest['decimalReservation']>) {
      request.decimalReservation = structuredClone(value);
      return builder;
    },
    diagnose() { return diagnoseDataTransaction(request); },
    build(): DataTransactionRequest {
      const diagnostics = diagnoseDataTransaction(request);
      if (diagnostics.length) throw new DataTransactionBuildError(diagnostics);
      return structuredClone(request);
    },
  };
  return builder;
}
