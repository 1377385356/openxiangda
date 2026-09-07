import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isGeneratedDetailFieldVisible } from '../src/browser/components/resource/detail-field-visibility';
import { selectedSurfaceFields } from '../src/browser/components/resource/resource-field-selection';

test('managed file and image controls always emit the platform array contract', () => {
  const source = readFileSync(
    new URL('../src/browser/components/resource/SurfaceFields.tsx', import.meta.url),
    'utf8'
  );

  assert.match(source, /value\?: DataFileRef\[\]/);
  assert.match(source, /onChange\?: \(value: DataFileRef\[\]\) => void/);
  assert.match(source, /: \[uploaded\]/);
  assert.match(source, /onChange\?\.\(next\)/);
  assert.doesNotMatch(source, /: uploaded;/);
  assert.doesNotMatch(source, /multiple \? next : undefined/);
});

test('details use explicit visibility and allow system-owned business fields to opt in', () => {
  assert.equal(isGeneratedDetailFieldVisible({ key: 'workflowInstanceId', label: '审批流程实例', type: 'uuid', system: true }), false);
  assert.equal(isGeneratedDetailFieldVisible({ key: 'memberUserId', label: '会员用户标识', type: 'text.short', system: true }), false);
  assert.equal(isGeneratedDetailFieldVisible({ key: 'memberDepartmentScopeValue', label: '会员部门范围快照', type: 'text.short', system: true }), false);
  assert.equal(isGeneratedDetailFieldVisible({ key: 'workflowEventSequence', label: '审批事件序列', type: 'number.integer', system: true }), false);
  assert.equal(isGeneratedDetailFieldVisible({ key: 'status', label: '状态', type: 'option.single', system: true, hidden: false }), true);
  assert.equal(isGeneratedDetailFieldVisible({ key: 'applicationNumber', label: '业务编号', type: 'serial-number', system: true, hidden: false }), true);
  assert.equal(isGeneratedDetailFieldVisible({ key: 'businessId', label: '业务识别码', type: 'text.short' }), true);
  assert.equal(isGeneratedDetailFieldVisible({ key: 'businessId', label: '业务识别码', type: 'uuid' }), true);
  assert.equal(isGeneratedDetailFieldVisible({ key: 'technicalValue', label: '信息', type: 'text.short', hidden: true }), false);
});

test('form and detail selection never append other stored fields', () => {
  const field = { list: true, label: '字段', type: 'text.short' as const, widget: 'text' as const, readCapabilities: [], createCapabilities: [], updateCapabilities: [] };
  const surface = {
    fields: { title: field, note: field, internal: { ...field, hidden: true }, status: { ...field, system: true, hidden: false } },
    list: { fieldOrder: ['note', 'title', 'status'] },
    form: { fieldOrder: ['title'] }, detail: { fieldOrder: ['note', 'title', 'internal', 'status'] },
  };
  assert.deepEqual(selectedSurfaceFields(surface, 'form').map(item => item.key), ['title']);
  assert.deepEqual(selectedSurfaceFields(surface, 'detail').map(item => item.key), ['note', 'title', 'status']);
  assert.deepEqual(selectedSurfaceFields({ ...surface, form: { fieldOrder: [] } }, 'form'), []);
  assert.deepEqual(selectedSurfaceFields(surface, 'list').map(item => item.key), ['note', 'title', 'status']);
});
