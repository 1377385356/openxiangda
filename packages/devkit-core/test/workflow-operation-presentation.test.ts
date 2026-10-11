import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import { workflowSurfaceSchema } from 'openxiangda-contracts';
const validate = new Ajv({ strict: false }).compile(workflowSurfaceSchema.properties.operations);
test('accepts old descriptors and bounded additive server presentation', () => {
  for (const item of [{ key: 'approve' }, { prominence: 1, consequence: '继续流程' }, { prominence: null }]) assert.equal(validate([item]), true);
});
test('rejects ambiguous or unbounded operation presentation', () => {
  for (const item of [{ prominence: 0 }, { prominence: 1.2 }, { prominence: '1' }, { prominence: 1001 }, { consequence: '' }, { consequence: 'x'.repeat(1001) }]) assert.equal(validate([item]), false);
});
