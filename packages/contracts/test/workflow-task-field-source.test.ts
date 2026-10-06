import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { workflowTaskFieldSourceQuerySchema } from '../src/schemas.js';

const Ajv = createRequire(new URL('../../devkit-core/package.json', import.meta.url))('ajv/dist/2020.js').default;
const addFormats = createRequire(new URL('../../devkit-core/package.json', import.meta.url))('ajv-formats');
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile(workflowTaskFieldSourceQuerySchema);
const input = { schemaVersion: 'openxiangda.workflow-task-field-source-query/v2', expectedRevision: 5, expectedTaskVersion: 2 };

test('task reference source queries require both safe revisions and accept bounded search/bindings', () => {
  assert.equal(validate(input), true);
  assert.equal(validate({ ...input, keyword: '司机', cursor: 'original-cursor', bindings: { college: null } }), true);
  for (const patch of [
    { expectedRevision: undefined }, { expectedTaskVersion: undefined },
    { expectedRevision: 0 }, { expectedTaskVersion: 1.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { keyword: 'x'.repeat(501) }, { cursor: 'x'.repeat(4097) },
    { operation: 'update' }, { actor: 'admin' }, { launch: {} }, { action: {} }, { targetResourceCode: 'private' },
    { bindings: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`field${i}`, 'x'])) },
  ]) assert.equal(validate({ ...input, ...patch }), false, JSON.stringify(patch));
});

test('owned source queries distinguish a revisioned saved row from a bounded local row', () => {
  const persisted = { fieldCode: 'custodians', row: { kind: 'persisted', id: '11111111-1111-4111-8111-111111111111', expectedRevision: 3 } };
  const fresh = { fieldCode: 'custodians', row: { kind: 'new', key: 'local-row-1' } };
  assert.equal(validate({ ...input, subtable: persisted }), true);
  assert.equal(validate({ ...input, subtable: fresh }), true);
  for (const subtable of [
    { ...persisted, resourceCode: 'forged' }, { ...persisted, fieldCode: '' },
    { ...persisted, row: { ...persisted.row, expectedRevision: 0 } },
    { ...persisted, row: { ...persisted.row, id: 'not-a-uuid' } },
    { ...persisted, row: { ...persisted.row, key: 'mixed' } },
    { ...fresh, row: { kind: 'new', key: 'x'.repeat(129) } },
    { ...fresh, row: { kind: 'new', key: 'local-row', id: persisted.row.id } },
    { ...fresh, row: { kind: 'unknown', key: 'local-row' } },
  ]) assert.equal(validate({ ...input, subtable }), false, JSON.stringify(subtable));
});
