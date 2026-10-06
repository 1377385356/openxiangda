import assert from 'node:assert/strict';
import test from 'node:test';
import { resourceReferenceBindingPatch } from '../src/browser/components/platform-fields/reference-binding-change';

const fields: any[] = [
  { key: 'scope', type: 'resource-ref.single' },
  { key: 'items', type: 'resource-ref.multiple', source: { clearOnBindingChange: true,
    filters: [{ field: 'scope', operator: 'eq', binding: { kind: 'field', field: 'scope' } }] } },
  { key: 'recipient', type: 'resource-ref.single', source: { clearOnBindingChange: true,
    filters: [{ field: 'items', operator: 'in', binding: { kind: 'field', field: 'items' } }] } },
];
const previous = { scope: { value: 'scope-1', label: '旧标签' }, items: [{ value: 'item-1', label: '信息项' }], recipient: { value: 'user-1' }, phone: '13800138000' };
test('an explicit row dependency change clears multiple and downstream single choices without changing input', () => {
  const next = { ...previous, scope: { value: 'scope-2' } };
  assert.deepEqual(resourceReferenceBindingPatch(fields, { scope: next.scope }, next, previous), { items: [], recipient: undefined });
  assert.deepEqual(next.items, previous.items); assert.equal(next.phone, previous.phone);
});
test('the default, unchanged identity, label refresh, and unrelated edits preserve choices', () => {
  const next = { ...previous, scope: { value: 'scope-1', label: '新标签' }, phone: '13800138001' };
  assert.deepEqual(resourceReferenceBindingPatch(fields, { scope: next.scope, phone: next.phone }, next, previous), {});
  const defaults = fields.map(field => ({ ...field, source: field.source ? { ...field.source, clearOnBindingChange: false } : undefined }));
  assert.deepEqual(resourceReferenceBindingPatch(defaults, { scope: 'other' }, { ...previous, scope: 'other' }, previous), {});
  assert.deepEqual(resourceReferenceBindingPatch(fields, {}, next, previous), {}, 'programmatic restores provide no user event');
});
test('only writable fields supplied by the owner clear; dependency cycles terminate', () => {
  const next = { ...previous, scope: 'other' };
  assert.deepEqual(resourceReferenceBindingPatch(fields.filter(field => field.key !== 'items'), { scope: 'other' }, next, previous), {});
  const cyclic = [fields[0], fields[1], { ...fields[2], key: 'scope' }];
  assert.deepEqual(resourceReferenceBindingPatch(cyclic, { scope: 'other' }, next, previous), { items: [], scope: undefined });
});
