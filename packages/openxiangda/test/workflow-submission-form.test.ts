import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurfaceField } from '../src/browser/components/resource/SurfaceFields.js';
import { workflowSubmissionFormProjection, workflowSubmissionPrefill } from '../src/browser/components/workflow/workflow-submission-form.js';
import { normalizeFormValues, normalizeRecordForForm } from '../src/browser/components/platform-fields/field-form-codec.js';

const field = (key: string, requiredHint = false): SurfaceField => ({ key, label: key, type: 'text.short', widget: 'text',
  requiredHint, readCapabilities: [], createCapabilities: [], updateCapabilities: [] });
const fields = [field('reason', true), field('evidence'), field('reviewer')];

test('hidden stale files and people are cleared in both the view and submitted input', () => {
  const value = workflowSubmissionFormProjection(fields, { reason: 'personal', evidence: [{ id: 'old' }], reviewer: { value: 'old' }, identity: 'injected' },
    { evidence: { visible: false, hiddenValue: [] }, reviewer: { visible: false, hiddenValue: null } });
  assert.deepEqual(value.fields.map(f => f.key), ['reason']);
  assert.deepEqual(value.values, { reason: 'personal', evidence: [], reviewer: null });
  assert.deepEqual(value.hiddenValues, { evidence: [], reviewer: null });
  assert.equal(fields.length, 3);
});
test('conditional requirements add to original validation without changing the declaration', () => {
  const value = workflowSubmissionFormProjection(fields, {}, { reason: { required: false }, evidence: { required: true } });
  assert.equal(value.fields[0].requiredHint, true);
  assert.equal(value.fields[1].requiredHint, true);
  assert.equal(fields[1].requiredHint, false);
  assert.throws(() => workflowSubmissionFormProjection(fields, {}, { reason: { visible: false } }), /REQUIRED_FIELD_HIDDEN/);
});
test('rules and prefill cannot add fields outside matched launch inputs', () => {
  assert.throws(() => workflowSubmissionFormProjection(fields, {}, { applicant: { visible: true } }), /FIELD_UNAVAILABLE/);
  const applied = new Set<string>();
  assert.throws(() => workflowSubmissionPrefill(fields, { reason: 'illness', applicant: 'forged' }, applied, () => false), /FIELD_UNAVAILABLE/);
  assert.equal(applied.size, 0, 'Failed prefill cannot partially consume the initializer');
});
test('late or repeated prefill preserves edits, including an intentionally cleared value', () => {
  const applied = new Set<string>();
  assert.deepEqual(workflowSubmissionPrefill(fields, { reason: 'illness', reviewer: 'suggested' }, applied, key => key === 'reason'), { reviewer: 'suggested' });
  assert.deepEqual(workflowSubmissionPrefill(fields, { reason: 'personal', reviewer: 'replacement' }, applied, () => false), {});
  assert.deepEqual(workflowSubmissionPrefill(fields, { evidence: [] }, applied, () => true), {});
});
test('prefill and field conditions consume canonical closed date ranges through the shared codec', () => {
  const range: SurfaceField = { ...field('leavePeriod'), type: 'date-range', widget: 'date-range', rangeBoundary: 'closed' };
  const surface = { fields: { leavePeriod: range } };
  const canonical = { leavePeriod: { start: '2026-02-01', end: '2026-09-01' } };
  const initial = workflowSubmissionPrefill([range], canonical, new Set(), () => false);
  const form = normalizeRecordForForm(initial, surface);
  assert.deepEqual(normalizeFormValues(form, surface), canonical);
  assert.deepEqual(workflowSubmissionFormProjection([range], normalizeFormValues(form, surface)).values, canonical);
});
test('hidden optional fields without a replacement are excluded from submission', () => {
  assert.deepEqual(workflowSubmissionFormProjection(fields, { reviewer: 'stale' }, { reviewer: { visible: false } }).values, {});
});
