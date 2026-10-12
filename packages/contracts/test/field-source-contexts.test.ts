import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { dataFieldSourceQuerySchema, dataFieldSourcePageSchema, nativeScopeValuePageSchema } from '../src/schemas.js';
import { parseNativeDataFieldsV2 } from '../src/native-compiler/data-field.js';

const require = createRequire(new URL('../../devkit-core/package.json', import.meta.url));
const Ajv = require('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false });
require('ajv-formats')(ajv);
const validate = ajv.compile(dataFieldSourceQuerySchema);
const base = { schemaVersion: 'openxiangda.data-field-source-query/v2', operation: 'filter' };
const record = { id: '11111111-1111-4111-8111-111111111111', expectedRevision: 3 };

test('read-filter intent cannot acquire any write or saved-row context', () => {
  assert.equal(validate({ ...base, keyword: '历史客户' }), true);
  for (const patch of [{ bindings: {} }, { record }, { launch: { workflowCode: 'visit', operationCode: 'visit.create' } },
    { action: { operationCode: 'visit.edit', recordId: record.id, expectedRevision: 3 } }, { task: {} }]) {
    assert.equal(validate({ ...base, ...patch }), false, JSON.stringify(patch));
  }
  assert.equal(ajv.compile(dataFieldSourcePageSchema)({ schemaVersion: 'openxiangda.data-field-source-page/v2',
    environment: { id: 'environment', key: 'preproduction', activeAppVersionId: 'version', headRevision: 1,
      authzRevisionId: 'authz', authzVersion: 1, scopeDataVersion: '1' }, resourceCode: 'visits', fieldCode: 'area',
    sourceResourceCode: 'areas', operation: 'filter', items: [], nextCursor: null }), true);
});

test('ordinary update lookup is versioned and incompatible with named or task contexts', () => {
  const update = { ...base, operation: 'update', record, bindings: { department: null } };
  assert.equal(validate(update), true);
  for (const patch of [{ operation: 'create' }, { record: { ...record, expectedRevision: 0 } },
    { record: { ...record, expectedRevision: Number.MAX_SAFE_INTEGER + 1 } },
    { record: { ...record, id: 'forged' } }, { record: { ...record, saved: 'secret' } },
    { launch: { workflowCode: 'visit', operationCode: 'visit.create' } },
    { action: { operationCode: 'visit.edit', recordId: record.id, expectedRevision: 3 } }]) {
    assert.equal(validate({ ...update, ...patch }), false, JSON.stringify(patch));
  }
});

test('read-filter declarations admit bounded constants without current-record bindings', () => {
  const source = { kind: 'resource', resourceCode: 'areas', labelField: 'name',
    filterWhere: [{ field: 'kind', operator: 'eq', value: 'building' }] };
  assert.deepEqual(parseNativeDataFieldsV2([{ code: 'area', type: 'resource-ref.single', source }], '/fields')[0]!.source, source);
  for (const filterWhere of [[{ field: 'kind', operator: 'eq', binding: { kind: 'field', field: 'kind' } }],
    [{ field: 'kind', operator: 'contains', value: 'building' }], Array.from({ length: 21 }, () => ({ field: 'kind', operator: 'eq', value: 'building' }))]) {
    assert.throws(() => parseNativeDataFieldsV2([{ code: 'area', type: 'resource-ref.single', source: { ...source, filterWhere } }], '/fields'));
  }
});

test('scope filter responses carry inactive identity without changing the saved label', () => {
  assert.equal(ajv.compile(nativeScopeValuePageSchema)({ schemaVersion: 'openxiangda.native-scope-value-page/v2',
    environment: { id: 'environment', key: 'preproduction', activeAppVersionId: 'version', headRevision: 1,
      authzRevisionId: 'authz', authzVersion: 1, scopeDataVersion: '1' }, resourceCode: 'visits', fieldCode: 'area',
    dimensionCode: 'area', operation: 'filter', items: [{ value: record.id, label: '旧办公区', selectable: true, inactive: true }], nextCursor: null }), true);
});
