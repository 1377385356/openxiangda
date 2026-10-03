import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import { standardProcessFormValues } from '../src/browser/components/workflow/standard-process-values.js';

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
