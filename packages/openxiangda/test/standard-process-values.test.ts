import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import { namedProcessFormValues, standardProcessFormValues } from '../src/browser/components/workflow/standard-process-values.js';

test('named create encodes only its own child whitelist even when no ordinary child field is writable', () => {
  const child: any = { fields: { date: { type: 'date', widget: 'date' }, score: { type: 'number.integer', widget: 'number' },
    evidence: { type: 'file', widget: 'file' }, initialScore: { type: 'number.integer', widget: 'number' }, parentId: { type: 'uuid' }, position: { type: 'number.integer' } } };
  const parent: any = { fields: { items: { type: 'subtable', subtable: { resourceCode: 'items', foreignKey: 'parentId', orderField: 'position' } } } };
  const grant = { mode: 'create' as const, resourceCode: 'requests', subtables: [{ fieldCode: 'items', fieldCodes: ['date', 'score', 'evidence'] }] };
  const file = { id: 'file-id', name: 'example.pdf', size: 10, contentType: 'application/pdf' };
  const row = { key: 'row-id', state: 'created' as const, data: { date: dayjs('2026-10-06'), score: 0, evidence: [file], initialScore: 100, parentId: 'injected', position: 99 } };
  assert.deepEqual(namedProcessFormValues({ items: [row] }, parent, { items: { surface: child } }, grant), {
    items: [{ key: 'row-id', state: 'created', data: { date: '2026-10-06', score: 0, evidence: [file] } }],
  });
  assert.throws(() => namedProcessFormValues({ items: [row] }, parent, { items: { surface: child } }), /NAMED_OWNED_CREATE_REQUIRED/);
  for (const extra of [{ state: 'persisted', id: 'foreign', revision: 1 }, { state: 'deleted' }, { id: 'foreign' }])
    assert.throws(() => namedProcessFormValues({ items: [{ ...row, ...extra }] }, parent, { items: { surface: child } }, grant), /NAMED_OWNED_CREATE_REQUIRED/);
});

test('standard launch encodes all child dates and zero values without sending snapshots or forbidden fields', () => {
  const child: any = { fields: {
    date: { type: 'date', widget: 'date', label: '日期' }, quantity: { type: 'number.integer', widget: 'number', label: '数量' },
    locked: { type: 'text.short', widget: 'readonly', label: '锁定' }, hidden: { type: 'text.short', hidden: true, label: '内部' },
    restricted: { type: 'text.short', widget: 'text', label: '受限' }, parentId: { type: 'uuid', widget: 'text' }, position: { type: 'number.integer', widget: 'number' },
  } };
  const parent: any = { fields: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`items${i}`, { type: 'subtable', subtable: { resourceCode: 'items', foreignKey: 'parentId', orderField: 'position' } }])) };
  const values = Object.fromEntries(Object.keys(parent.fields).map(code => [code, Array.from({ length: 50 }, (_, i) => ({ key: `${code}-${i}`, state: 'created',
    data: { date: dayjs('2026-10-03'), quantity: 0, locked: 'readonly', hidden: 'private', restricted: 'deny', parentId: 'foreign', position: 999 },
    snapshot: { hidden: 'private' }, originalData: { restricted: 'deny' },
  }))]));
  const result: any = standardProcessFormValues(values, parent, { items: { surface: child } }, field => field.key !== 'restricted');
  assert.equal(Object.values(result).flat().length, 350);
  assert.deepEqual(result.items6[49], { key: 'items6-49', state: 'created', data: { date: '2026-10-03', quantity: 0 } });
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.ok(values.items6[49].snapshot);
});
