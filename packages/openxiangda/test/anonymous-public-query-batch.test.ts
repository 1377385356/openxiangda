import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnonymousPublicClient,
  OpenXiangdaPlatformRequestError,
} from '../src/browser/platform-client';
import {
  parseAnonymousPublicQueryBatch,
  type AnonymousPublicQueryBatchOperation,
  type AnonymousPublicQueryResult,
} from '../src/browser/anonymous-public-query';

const operations: AnonymousPublicQueryBatchOperation[] = [
  {
    key: 'counts',
    policyCode: 'public-counts',
    queryCode: 'summary',
    limit: 1,
  },
  {
    key: 'cards',
    policyCode: 'public-instruments',
    queryCode: 'catalogue',
    limit: 9,
    parameters: { instrument_codes: ['I1'] },
  },
];
const aggregate = (): AnonymousPublicQueryResult => ({
  schemaVersion: 'openxiangda.anonymous-public-query/v2',
  queryCode: 'summary',
  kind: 'aggregate',
  items: [{ count: 473 }],
  nextCursor: null,
});
const record = (): AnonymousPublicQueryResult => ({
  schemaVersion: 'openxiangda.anonymous-public-query/v2',
  queryCode: 'catalogue',
  kind: 'records',
  items: [
    {
      schemaVersion: 'openxiangda.anonymous-public-record/v2',
      resourceCode: 'instruments',
      data: { id: 'one', name: '仪器' },
    },
  ],
  nextCursor: 'signed-continuation',
});
const receipt = () => ({
  schemaVersion: 'openxiangda.anonymous-public-query-batch/v2',
  items: [
    { ...operations[0], ok: true, result: aggregate() },
    { ...operations[1], ok: true, result: record() },
  ],
});

async function transport(
  run: (
    calls: Array<{ url: string; init?: RequestInit }>,
    set: (value: unknown, status?: number) => void
  ) => Promise<void>
) {
  const originalFetch = globalThis.fetch,
    originalDocument = globalThis.document;
  const metadata: Record<string, string> = {
    'openxiangda-runtime-base': '/dev/public-query-test',
    'openxiangda-app-code': 'public-query-test',
    'openxiangda-environment': 'preproduction',
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector(selector: string) {
        const key = /meta\[name="([^"]+)"\]/.exec(selector)?.[1];
        return key && metadata[key] ? { content: metadata[key] } : null;
      },
    },
  });
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let response: unknown = receipt(),
    status = 200;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await run(calls, (value, nextStatus = 200) => {
      response = value;
      status = nextStatus;
    });
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
}

test('official batch transport uses one route/environment and exact keyed policies without a private Data API', async () => {
  await transport(async (calls) => {
    const result = await createAnonymousPublicClient({
      routeCode: 'public-home',
    }).queryBatch(operations);
    assert.equal(calls.length, 1);
    assert(
      calls[0]!.url.endsWith(
        '/applications/public-query-test/anonymous-public/public/query-batch'
      )
    );
    assert.equal(calls[0]!.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
      schemaVersion: 'openxiangda.anonymous-public-query-batch-request/v2',
      routeCode: 'public-home',
      environmentKey: 'preproduction',
      operations,
    });
    const summary = result.items[0]!,
      cards = result.items[1]!;
    assert(summary.ok && summary.result.kind === 'aggregate');
    assert.equal(summary.result.items?.[0]?.count, 473);
    assert(cards.ok && cards.result.kind === 'records');
    assert.equal(cards.result.items[0]?.data.name, '仪器');
  });
});
test('single named query keeps its transport while aggregate rows use their correct discriminant', async () => {
  await transport(async (calls, set) => {
    set(aggregate());
    const result = await createAnonymousPublicClient({
      routeCode: 'public-home',
      policyCode: 'public-counts',
    }).query('summary', { limit: 1 });
    assert.equal(calls.length, 1);
    assert(calls[0]!.url.endsWith('/public/query'));
    assert.equal(result.kind, 'aggregate');
    if (result.kind === 'aggregate')
      assert.equal(result.items?.[0]?.count, 473);
  });
});
test('a denied item remains a typed error beside a successful count', () => {
  const value = receipt();
  value.items[1] = {
    ...operations[1],
    ok: false,
    error: {
      status: 403,
      code: 'ANONYMOUS_PUBLIC_REQUEST_REJECTED',
      retryable: false,
      message: 'denied',
      data: { reasonCode: 'FIELD_FORBIDDEN' },
    },
  } as any;
  const result = parseAnonymousPublicQueryBatch(value, operations);
  const item = result.items[1]!;
  assert.equal(item.ok, false);
  if (!item.ok) assert.equal(item.error.data?.reasonCode, 'FIELD_FORBIDDEN');
});
test('missing, duplicate, mismatched, oversized and malformed receipts cannot become accepted data', () => {
  const changes: Array<(value: any) => void> = [
    (value) => value.items.pop(),
    (value) => value.items.push(value.items[0]),
    (value) => (value.items[1].key = 'counts'),
    (value) => (value.items[1].policyCode = 'other'),
    (value) => (value.items[1].queryCode = 'other'),
    (value) => (value.items[1].result.queryCode = 'other'),
    (value) => (value.items[1].ok = 'true'),
    (value) => (value.items[1].result.items = [{ data: null }]),
    (value) => (value.items[0].result.items = [null]),
    (value) => (value.items[0].result.kind = 'unknown'),
    (value) => (value.items[0].result.items = [{ count: 1 }, { count: 2 }]),
    (value) => (value.items[1].result.nextCursor = 42),
    (value) =>
      (value.items[1] = {
        ...operations[1],
        ok: false,
        error: { status: 200, code: 'bad', retryable: false, message: 'bad' },
      }),
    (value) =>
      (value.items[1] = {
        ...operations[1],
        ok: false,
        error: { status: 403, code: 'bad', retryable: false, message: 'bad' },
        result: record(),
      }),
  ];
  for (const change of changes) {
    const value = receipt();
    change(value);
    assert.throws(
      () => parseAnonymousPublicQueryBatch(value, operations),
      /RECEIPT_INVALID/
    );
  }
});
test('a pre-existing value-only count receipt remains represented without inventing record wrappers', () => {
  const value = receipt();
  value.items[0].result = {
    schemaVersion: 'openxiangda.anonymous-public-query/v2',
    queryCode: 'summary',
    kind: 'aggregate',
    value: { count: 473 },
  };
  const result = parseAnonymousPublicQueryBatch(value, operations);
  const item = result.items[0]!;
  assert(item.ok && item.result.kind === 'aggregate');
  assert.equal(item.result.value?.count, 473);
});
test('HTTP failure is preserved and never triggers individual requests or another API', async () => {
  await transport(async (calls, set) => {
    set({ code: 'ANONYMOUS_PUBLIC_QUERY_NOT_FOUND', message: 'missing' }, 404);
    await assert.rejects(
      createAnonymousPublicClient({ routeCode: 'public-home' }).queryBatch(
        operations
      ),
      (error) =>
        error instanceof OpenXiangdaPlatformRequestError && error.status === 404
    );
    assert.equal(calls.length, 1);
  });
});
