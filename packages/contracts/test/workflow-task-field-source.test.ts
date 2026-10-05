import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { workflowTaskFieldSourceQuerySchema } from '../src/schemas.js';

const Ajv = createRequire(new URL('../../devkit-core/package.json', import.meta.url))('ajv/dist/2020.js').default;
const validate = new Ajv({ strict: false }).compile(workflowTaskFieldSourceQuerySchema);
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
