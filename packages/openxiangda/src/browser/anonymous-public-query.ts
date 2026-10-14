export interface AnonymousPublicRecord {
  schemaVersion: 'openxiangda.anonymous-public-record/v2';
  resourceCode: string;
  data: Record<string, unknown>;
}
export type AnonymousPublicQueryResult = {
  schemaVersion: 'openxiangda.anonymous-public-query/v2';
  queryCode: string;
} & (
  | {
      kind: 'records';
      items: AnonymousPublicRecord[];
      nextCursor: string | null;
    }
  | {
      kind: 'aggregate';
      items: Record<string, unknown>[];
      nextCursor: string | null;
      value?: never;
    }
  | {
      kind: 'aggregate';
      value: Record<string, unknown>;
      items?: never;
      nextCursor?: never;
    }
);
export interface AnonymousPublicQueryBatchOperation {
  key: string;
  policyCode: string;
  queryCode: string;
  parameters?: Record<string, unknown>;
  cursor?: string;
  limit?: number;
}
export interface AnonymousPublicQueryBatchError {
  status: number;
  code: string;
  errorCode?: string;
  retryable: boolean;
  message: string;
  data?: Record<string, unknown>;
}
export type AnonymousPublicQueryBatchItem = Pick<
  AnonymousPublicQueryBatchOperation,
  'key' | 'policyCode' | 'queryCode'
> &
  (
    | { ok: true; result: AnonymousPublicQueryResult }
    | { ok: false; error: AnonymousPublicQueryBatchError }
  );
export interface AnonymousPublicQueryBatchResult {
  schemaVersion: 'openxiangda.anonymous-public-query-batch/v2';
  items: AnonymousPublicQueryBatchItem[];
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = () => {
  throw new Error('OPENXIANGDA_ANONYMOUS_PUBLIC_QUERY_BATCH_RECEIPT_INVALID');
};

/** Validate transport identity and shape, without reproducing platform authority. */
export function parseAnonymousPublicQueryBatch(
  value: unknown,
  operations: readonly AnonymousPublicQueryBatchOperation[]
): AnonymousPublicQueryBatchResult {
  const requested = new Map(operations.map((item) => [item.key, item]));
  if (
    !object(value) ||
    value.schemaVersion !== 'openxiangda.anonymous-public-query-batch/v2' ||
    !Array.isArray(value.items) ||
    value.items.length !== operations.length ||
    requested.size !== operations.length
  )
    invalid();
  const seen = new Set<string>();
  for (const item of (value as { items: unknown[] }).items) {
    if (!object(item) || typeof item.key !== 'string') invalid();
    const row = item as Record<string, unknown>,
      key = row.key as string,
      expected = requested.get(key);
    if (
      !expected ||
      seen.has(key) ||
      row.policyCode !== expected.policyCode ||
      row.queryCode !== expected.queryCode
    )
      invalid();
    seen.add(key);
    if (row.ok === false) {
      const error = row.error;
      if (
        !object(error) ||
        !Number.isSafeInteger(error.status) ||
        Number(error.status) < 400 ||
        Number(error.status) > 599 ||
        typeof error.code !== 'string' ||
        !error.code ||
        typeof error.retryable !== 'boolean' ||
        typeof error.message !== 'string' ||
        'result' in row
      )
        invalid();
      continue;
    }
    const result = row.result;
    if (
      row.ok !== true ||
      !object(result) ||
      result.schemaVersion !== 'openxiangda.anonymous-public-query/v2' ||
      result.queryCode !== expected!.queryCode ||
      'error' in row
    )
      invalid();
    const receipt = result as Record<string, unknown>;
    if (
      receipt.nextCursor !== undefined &&
      receipt.nextCursor !== null &&
      typeof receipt.nextCursor !== 'string'
    )
      invalid();
    if (
      receipt.kind === 'aggregate' &&
      receipt.items === undefined &&
      object(receipt.value)
    )
      continue;
    if (
      !['records', 'aggregate'].includes(String(receipt.kind)) ||
      !Array.isArray(receipt.items) ||
      receipt.items.length > (expected!.limit ?? 100) ||
      !receipt.items.every(object)
    )
      invalid();
    if (
      receipt.kind === 'records' &&
      (!(
        receipt.nextCursor === null || typeof receipt.nextCursor === 'string'
      ) ||
        !(receipt.items as Record<string, unknown>[]).every(
          (record) =>
            record.schemaVersion === 'openxiangda.anonymous-public-record/v2' &&
            typeof record.resourceCode === 'string' &&
            !!record.resourceCode &&
            object(record.data)
        ))
    )
      invalid();
  }
  return value as unknown as AnonymousPublicQueryBatchResult;
}
