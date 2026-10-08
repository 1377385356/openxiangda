import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import { assertNamedSubtableReadonlyFields, namedProcessFormValues, standardProcessFormValues } from '../src/browser/components/workflow/standard-process-values.js';

test('readonly source metadata stays in the sealed input, including hidden fields, without granting ordinary child writes', () => {
  const child: any = { fields: { sourceId: { type: 'uuid', hidden: true, widget: 'readonly' }, sourceRevision: { type: 'number.integer', hidden: true, widget: 'readonly' }, decision: { type: 'text.short', widget: 'text' }, derived: { type: 'text.short', widget: 'text' } } };
  const parent: any = { fields: { rows: { type: 'subtable', subtable: { resourceCode: 'source-lines', foreignKey: 'requestId' } } } };
  const grant = { mode: 'create' as const, resourceCode: 'requests', subtables: [{ fieldCode: 'rows', fieldCodes: ['sourceId', 'sourceRevision', 'decision', 'derived'] }] };
  const input = { rows: [{ key: 'original', state: 'created' as const, data: { sourceId: 'source-row', sourceRevision: 7, decision: 'keep', derived: 'server' } }] }, before = structuredClone(input);
  const output = namedProcessFormValues(input, parent, { 'source-lines': { surface: child } }, grant, { rows: ['derived'] }, { rows: ['sourceId', 'sourceRevision'] }) as any;
  assert.deepEqual(output.rows[0].data, { decision: 'keep', sourceId: 'source-row', sourceRevision: 7 });
  assert.deepEqual(input, before);
  assert.doesNotThrow(() => assertNamedSubtableReadonlyFields(parent, grant, {}, ['rows']));
  for (const tables of [['foreign'], ['rows', 'rows']]) assert.throws(() => assertNamedSubtableReadonlyFields(parent, grant, {}, tables), /FIXED_ROWS_INVALID/);
  assert.throws(() => namedProcessFormValues(input, parent, { 'source-lines': { surface: child } }, grant, {}, { rows: ['foreign'] }), /READONLY_FIELDS_INVALID/);
  assert.throws(() => namedProcessFormValues(input, parent, { 'source-lines': { surface: child } }, grant, { rows: ['sourceId'] }, { rows: ['sourceId'] }), /READONLY_INPUT_OVERLAP/);
});

test('named child readonly presentation omits derived input and preserves original per-table values', () => {
  const child: any = {fields:{person:{type:'resource-ref.single',widget:'resource'},employeeNumber:{type:'text.short',widget:'text'},phone:{type:'text.short',widget:'text'}}};
  const parent: any = {fields:{items:{type:'subtable',subtable:{resourceCode:'lines',foreignKey:'parentId'}},other:{type:'subtable',subtable:{resourceCode:'lines',foreignKey:'parentId'}}}};
  const grant={mode:'create' as const,resourceCode:'requests',subtables:['items','other'].map(fieldCode=>({fieldCode,fieldCodes:['person','employeeNumber','phone']}))};
  const row={key:'original-row',state:'created' as const,data:{person:{value:'selected',label:'人物'},employeeNumber:'derived',phone:'manual'}};
  const input={items:[row],other:[structuredClone(row)]},before=structuredClone(input);
  const output=namedProcessFormValues(input,parent,{lines:{surface:child}},grant,{items:['employeeNumber']}) as any;
  assert.deepEqual(output.items[0],{key:row.key,state:'created',data:{person:row.data.person,phone:'manual'}});
  assert.equal(output.other[0].data.employeeNumber,'derived');assert.deepEqual(input,before);
  assert.equal((namedProcessFormValues(input,parent,{lines:{surface:child}},grant) as any).items[0].data.employeeNumber,'derived');
  for(const fields of [{items:['undeclared']},{unknown:['phone']}])assert.throws(()=>assertNamedSubtableReadonlyFields(parent,grant,fields),/READONLY_FIELDS_INVALID/);
  assert.throws(()=>assertNamedSubtableReadonlyFields(parent,undefined,{items:['phone']}),/READONLY_FIELDS_INVALID/);
});

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
