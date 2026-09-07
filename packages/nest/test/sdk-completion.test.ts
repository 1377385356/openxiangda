import assert from 'node:assert/strict';
import test from 'node:test';
import { Logger } from '@nestjs/common';
import { OpenXiangdaLoggerService, OpenXiangdaPlatformClient, OpenXiangdaPlatformError, OpenXiangdaTodoService } from '../src/index.js';
import type { OpenXiangdaHttpRequest } from '../src/types.js';

function request(): OpenXiangdaHttpRequest {
  return { headers: { authorization: 'private-token', 'x-request-id': 'request-17' }, openxiangda: {
    authorization: 'verified-invocation', perspectiveCode: null,
    principal: { principalType: 'user', appCode: 'extension-app', environmentKey: 'preproduction', userId: 'actor-1' },
    operation: { code: 'submit', requiredCapability: 'submit' },
  } } as OpenXiangdaHttpRequest;
}

test('todo SDK uses verified current caller and existing platform projections', async () => {
  const calls: unknown[] = [];
  const context = request();
  const todo = new OpenXiangdaTodoService(context, {
    applicationTodos: async (...args: unknown[]) => { calls.push(args); return { items: [] }; },
    recordApplicationTodoInteraction: async (...args: unknown[]) => { calls.push(args); return { accepted: true, duplicate: false }; },
  } as unknown as OpenXiangdaPlatformClient);
  await todo.list({ view: 'completed', keyword: 'review' });
  await todo.markRead('message-1');
  await todo.recordClick('message-1');
  assert.deepEqual(calls, [
    ['verified-invocation', { view: 'completed', keyword: 'review' }],
    ['verified-invocation', 'message-1', 'read'],
    ['verified-invocation', 'message-1', 'click'],
  ]);
  delete context.openxiangda;
  await assert.rejects(() => todo.list(), /TODO_USER_CONTEXT_REQUIRED/);
  assert.equal(calls.length, 3);
});

test('structured logs correlate action and request without serializing request secrets or arbitrary fields', () => {
  const entries: unknown[] = [];
  Logger.overrideLogger({ log: value => entries.push(value), error: value => entries.push(value), warn: value => entries.push(value) });
  try {
    const logger = new OpenXiangdaLoggerService(request());
    logger.log('Submission committed', { step: 'commit', code: 'SAVED', authorization: 'secret', data: { password: 'secret' } } as any);
    assert.equal(entries.length, 1);
    const entry = entries[0] as Record<string, unknown>;
    assert.equal(entry.actionCode, 'submit');
    assert.equal(entry.requestId, 'request-17');
    assert.equal(entry.appCode, 'extension-app');
    assert.doesNotMatch(JSON.stringify(entry), /secret|token|authorization|password/);
  } finally { Logger.overrideLogger(new Logger()); }
});

test('platform failures carry request correlation and safe endpoint metadata without retrying a mutation', async () => {
  let count = 0;
  let requestId: string | null = null;
  const platform = new OpenXiangdaPlatformClient({
    appCode: 'extension-app', environmentKey: 'preproduction', platformBaseUrl: 'https://platform.example',
    fetch: async (_url, init) => {
      count += 1;
      requestId = new Headers(init?.headers).get('x-request-id');
      throw new Error('connection interrupted');
    },
  });
  await assert.rejects(() => platform.createData('private-invocation', null, 'requests', { title: 'private-title' }, {
    code: 'submit', requiredCapability: 'submit', requestId: 'request-17',
  }), error => {
    assert.ok(error instanceof OpenXiangdaPlatformError);
    assert.equal(error.code, 'PLATFORM_UNAVAILABLE');
    assert.deepEqual(error.request, {
      requestId: 'request-17', method: 'POST', path: '/openxiangda-api/v2/applications/extension-app/native/data/requests/records',
    });
    assert.doesNotMatch(JSON.stringify(error.request), /private-invocation|private-title/);
    return true;
  });
  assert.equal(requestId, 'request-17');
  assert.equal(count, 1);
});
