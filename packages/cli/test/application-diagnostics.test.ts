import assert from 'node:assert/strict';
import test from 'node:test';
import Logs, { resolveLogQuery } from '../src/commands/logs.js';

test('logs retains deployment mode and chooses an explicit diagnostic scope and visible default window', () => {
  assert.equal(resolveLogQuery({}), null); assert.equal(resolveLogQuery({}, 'old-deployment'), null);
  assert.equal(Logs.args.deploymentId.required, undefined);
  const query = resolveLogQuery({ 'request-id': 'request-1' }, undefined, new Date('2026-09-26T10:00:00Z'));
  assert.deepEqual(query, { kind: 'requestId', id: 'request-1', environmentKey: 'preproduction', from: '2026-09-26T09:00:00.000Z', to: '2026-09-26T10:00:00.000Z' });
  assert.equal(resolveLogQuery({ 'command-id': 'fe2f7bac-8e0a-4d47-a3aa-3df77e9776a4', environment: 'production' })?.environmentKey, 'production');
});
test('ambiguous, partial and misleading flags fail before a platform request', () => {
  for (const flags of [{ 'request-id': 'r', 'file-id': 'f' }, { from: '2026-09-26T09:00:00Z' }, { 'request-id': 'r', from: '2026-09-26T09:00:00Z' }, { 'file-id': 'fe2f7bac-8e0a-4d47-a3aa-3df77e9776a4', from: '2026-09-26T09:00:00Z', to: '2026-09-26T10:00:00Z' }, { environment: 'production' }]) assert.throws(() => resolveLogQuery(flags), { code: 'OPENXIANGDA_DIAGNOSTIC_QUERY_INVALID' });
  assert.throws(() => resolveLogQuery({ 'request-id': 'r' }, 'deployment'), { code: 'OPENXIANGDA_DIAGNOSTIC_QUERY_INVALID' });
});
