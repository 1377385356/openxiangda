import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { currentInitiatorDirectorySnapshotSchema } from '../src/schemas.js';

const Ajv = createRequire(new URL('../../devkit-core/package.json', import.meta.url))('ajv/dist/2020.js').default;
const validate = new Ajv({ strict: false, validateFormats: false }).compile(currentInitiatorDirectorySnapshotSchema);
const snapshot = {
  schemaVersion: 'openxiangda.current-initiator-directory-snapshot/v2',
  userId: 'actor', snapshotRevision: 'c'.repeat(64), resolvedAt: '2026-10-04T00:00:00Z',
};

test('current initiator contact snapshot permits absence, null and bounded contact strings', () => {
  for (const value of [snapshot, { ...snapshot, phone: null }, { ...snapshot, phone: '13800000000' }, { ...snapshot, phone: '1'.repeat(80) }]) {
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
  for (const phone of ['', '1'.repeat(81), 13800000000, [], {}]) {
    assert.equal(validate({ ...snapshot, phone }), false, JSON.stringify({ phone }));
  }
});
