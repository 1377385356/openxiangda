import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowBusinessDetailUnavailable, type WorkflowBusinessDetail, type DataResourceSurface } from 'openxiangda-contracts/browser';
import { workflowDetailGroups } from '../src/browser/components/workflow/workflow-detail-fields';

const context = { workflowCode: 'application', definitionVersion: 2, bindingVersion: 3 };
const detail = (record: Record<string, unknown>): WorkflowBusinessDetail => ({
  ...workflowBusinessDetailUnavailable(), status: 'ready', resourceCode: 'applications', record,
  surface: { detail: { fieldOrder: ['name', 'budget', 'attachment'] }, fields: {
    name: { label: '项目名称', type: 'text.short', section: '申请' },
    budget: { label: '预算', type: 'decimal', section: '预算' },
    attachment: { label: '材料', type: 'subtable', section: '材料' },
  } } as unknown as DataResourceSurface,
});
const codes = (value: ReturnType<typeof workflowDetailGroups>) => value.flatMap(group => group.fields.map(field => field.key));
const hidden = { context, behavior: { fieldVisibility: () => false } };

test('nonapplicable empty fields and their sections disappear without changing the projected record', () => {
  const source = detail({ name: '项目', budget: null, attachment: [] });
  assert.deepEqual(workflowDetailGroups(source, hidden).map(group => group.section), ['申请']);
  assert.deepEqual(source.record, { name: '项目', budget: null, attachment: [] });
});
test('historical zero, false, text and reference values survive a false condition', () => {
  for (const budget of [0, false, '历史内容', { value: 'old-id', label: '历史选项' }])
    assert.ok(codes(workflowDetailGroups(detail({ budget }), hidden)).includes('budget'));
});
test('subtable rows remain visible even when no value is present on the parent record', () => {
  const source = detail({});
  source.subtables.attachment = { resourceCode: 'application-items', surface: source.surface!, rows: [{ id: 'row-1' }], total: 1 };
  assert.ok(codes(workflowDetailGroups(source, hidden)).includes('attachment'));
});
test('missing, indeterminate and failing presentation rules preserve the existing display', () => {
  const source = detail({});
  for (const presentation of [undefined, { context }, { context, behavior: { fieldVisibility: () => undefined } },
    { context, behavior: { fieldVisibility: () => { throw new Error('unavailable'); } } }])
    assert.deepEqual(codes(workflowDetailGroups(source, presentation)), ['name', 'budget', 'attachment']);
});
test('conditions use the actual pinned versions and cannot restore unprojected fields', () => {
  const source = detail({ unprojected: 'private' });
  const observed: string[] = [];
  const groups = workflowDetailGroups(source, { context, behavior: { fieldVisibility: input => {
    assert.equal(input.definitionVersion, 2); assert.equal(input.bindingVersion, 3);
    assert.equal(input.resourceCode, 'applications'); observed.push(input.fieldCode); return true;
  } } });
  assert.deepEqual(observed, ['name', 'budget', 'attachment']);
  assert.ok(!codes(groups).includes('unprojected'));
});
