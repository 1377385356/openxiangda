import assert from 'node:assert/strict';
import test from 'node:test';
import { APPLICATION_DIAGNOSTICS_SCHEMA, parseApplicationDiagnosticQuery as query, parseApplicationDiagnosticResult as result } from '../src/application-diagnostics.js';

const id = 'fe2f7bac-8e0a-4d47-a3aa-3df77e9776a4';
const expected = { appCode: 'example', environmentKey: 'preproduction' as const, kind: 'commandId' as const, id };
const fixture = () => ({ schemaVersion: APPLICATION_DIAGNOSTICS_SCHEMA, observedAt: '2026-09-26T10:00:00.000Z', scope: { appCode: 'example', environmentKey: 'preproduction', environmentId: id }, locator: { kind: 'commandId', id }, window: null, state: 'observed', reason: null, truncated: false, facts: [{ kind: 'process_command', id, occurredAt: '2026-09-26T09:00:00.000Z', status: 'completed' }], nextActions: [{ code: 'PRESERVE_ORIGINAL_OPERATION', message: '保留原操作' }] });

test('query bounds all four exact locators and normalizes the request window', () => {
  for (const kind of ['commandId', 'fileId', 'deploymentRunId']) assert.equal(query({ kind, id, environmentKey: 'production' }).id, id);
  const input = { kind: 'requestId', id: 'original-request.123', environmentKey: 'preproduction', from: '2026-09-25T10:00:00Z', to: '2026-09-26T10:00:00Z' };
  assert.equal(query(input).from, '2026-09-25T10:00:00.000Z');
  for (const patch of [{ to: input.from }, { from: '2026-09-25T09:59:59Z' }, { to: undefined }, { id: '../secret' }, { environmentKey: 'all' }, { tenantId: 'other' }]) assert.throws(() => query({ ...input, ...patch }), /QUERY_INVALID/);
  assert.throws(() => query({ kind: 'fileId', id, environmentKey: 'production', from: input.from, to: input.to }), /QUERY_INVALID/);
});

test('diagnostic response is exact-scope metadata, stripping additive and private fields', () => {
  const raw = fixture();
  const parsed = result({ ...raw, token: 'private', data: { value: 'private' }, scope: { ...raw.scope, tenantId: 'private' }, facts: [{ ...raw.facts[0], recordId: id, revision: 3, fileName: 'private', values: { password: 'private' } }], nextActions: [{ ...raw.nextActions[0], url: 'https://private' }] }, expected);
  assert.equal(JSON.stringify(parsed).includes('private'), false);
  assert.equal(parsed.facts[0]?.revision, 3);
  for (const rawPatch of [{ schemaVersion: 'v1' }, { scope: { ...raw.scope, appCode: 'other' } }, { scope: { ...raw.scope, environmentKey: 'production' } }, { locator: { kind: 'fileId', id } }, { locator: { kind: 'commandId', id: 'de2f7bac-8e0a-4d47-a3aa-3df77e9776a4' } }, { window: {} }, { facts: Array(51).fill(raw.facts[0]) }, { facts: [{ ...raw.facts[0], errorCode: 'raw SQL detail' }] }]) assert.throws(() => result({ ...raw, ...rawPatch }, expected), /RESPONSE_INVALID/);
});

test('absent evidence and unavailable queries cannot become a successful original operation', () => {
  for (const state of ['not_observed', 'unavailable']) {
    const parsed = result({ ...fixture(), state, facts: [], reason: state === 'unavailable' ? 'DIAGNOSTIC_TIMEOUT' : null }, expected);
    assert.equal(parsed.state, state); assert.deepEqual(parsed.facts, []);
  }
  assert.throws(() => result({ ...fixture(), state: 'not_observed' }, expected), /RESPONSE_INVALID/);
  const q = query({ kind: 'requestId', id: 'request', environmentKey: 'preproduction', from: '2026-09-26T09:00:00Z', to: '2026-09-26T10:00:00Z' });
  const raw = { ...fixture(), locator: { kind: q.kind, id: q.id }, window: { from: q.from, to: q.to } };
  assert.equal(result(raw, { ...q, appCode: 'example' }).locator.id, 'request');
  assert.throws(() => result({ ...raw, window: { from: '2026-09-26T08:00:00.000Z', to: q.to } }, { ...q, appCode: 'example' }), /RESPONSE_INVALID/);
});
