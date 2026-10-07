import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurfaceField } from '../src/browser/components/resource/SurfaceFields.js';
import { workflowSubmissionFormInput, workflowSubmissionFormProjection, workflowSubmissionPrefill, workflowSubmissionValueLinkage } from '../src/browser/components/workflow/workflow-submission-form.js';
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
test('a required source value can be supplied outside the form while a missing value still blocks it', () => {
  const source = [field('businessApplicant', true)];
  const person = { value: 'chosen-person', label: '获授权对象' };
  const projection = workflowSubmissionFormProjection(source, { businessApplicant: 'stale' }, { businessApplicant: { visible: false, hiddenValue: person } });
  assert.deepEqual(projection.fields, []); assert.deepEqual(projection.values, { businessApplicant: person });
  for (const hiddenValue of [null, undefined]) assert.throws(() => workflowSubmissionFormProjection(source, {}, { businessApplicant: { visible: false, hiddenValue } }), /REQUIRED_FIELD_HIDDEN/);
  for (const hiddenValue of [false, 0]) assert.deepEqual(workflowSubmissionFormProjection(source, {}, { businessApplicant: { visible: false, hiddenValue } }).values, { businessApplicant: hiddenValue });
  assert.equal(source[0].requiredHint, true);
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

test('mounted submit controls retain allowlisted hidden text and file values through canonical projection', () => {
  const inputs = [field('reason', true), field('other'), { ...field('evidence'), type: 'file', widget: 'file' } as SurfaceField];
  const material = [{ schemaVersion: 'openxiangda.data-file-ref/v2', id: '00000000-0000-4000-8000-000000000001', name: 'retained.pdf', contentType: 'application/pdf', size: 32 }];
  const stored = { reason: 'old', other: 'retained text', evidence: material, identity: 'unavailable' };
  const entered = workflowSubmissionFormInput(inputs, stored, { reason: 'edited' });
  const encoded = normalizeFormValues(entered, { fields: Object.fromEntries(inputs.map(input => [input.key, input])) });
  const result = workflowSubmissionFormProjection(inputs, encoded, {
    other: { visible: false, hiddenValue: encoded.other }, evidence: { visible: false, hiddenValue: encoded.evidence },
  });
  assert.deepEqual(result.values, { reason: 'edited', other: 'retained text', evidence: material });
  assert.deepEqual(result.fields.map(input => input.key), ['reason']);
  assert.equal(stored.reason, 'old');
});

test('retained controller values cannot bypass explicit clearing or introduce readonly/system/unmatched input', () => {
  const inputs = [...fields, { ...field('readonly'), widget: 'readonly' }, { ...field('system'), system: true }];
  const entered = workflowSubmissionFormInput(inputs, { reason: 'entered', evidence: [{ id: 'old' }], reviewer: { value: 'old' }, readonly: 'private', system: 'private', identity: 'private' }, { reason: '', identity: 'forged' });
  assert.deepEqual(workflowSubmissionFormProjection(inputs, entered, { evidence: { visible: false, hiddenValue: [] }, reviewer: { visible: false, hiddenValue: null } }).values, { reason: '', evidence: [], reviewer: null });
  assert.deepEqual(workflowSubmissionFormProjection(fields, entered, { evidence: { visible: false }, reviewer: { visible: false } }).values, { reason: '' });
});

test('a linked assignee copies on owner edits while independent edits and explicit clear are preserved', () => {
  const people = [field('owner'), field('specialist')];
  const link = (changed: Readonly<Record<string, unknown>>, values: Readonly<Record<string, unknown>>) =>
    Object.hasOwn(changed, 'owner') ? { specialist: values.owner ?? null } : {};
  const a = { value: 'a', label: '甲' }, b = { value: 'b', label: '乙' };
  assert.deepEqual(workflowSubmissionValueLinkage(people, { owner: a }, { owner: a }, link), { specialist: a });
  assert.deepEqual(workflowSubmissionValueLinkage(people, { specialist: b }, { owner: a, specialist: b }, link), {});
  assert.deepEqual(workflowSubmissionValueLinkage(people, { owner: b }, { owner: b, specialist: a }, link), { specialist: b });
  assert.deepEqual(workflowSubmissionValueLinkage(people, { owner: null }, { owner: null }, link), { specialist: null });
});
test('linkage has no access to unmatched fields and cannot mutate original canonical objects', () => {
  const values = { reason: 'personal', reviewer: { value: 'original', label: '原人' }, identity: 'private' };
  const changed = { reviewer: values.reviewer };
  const patch = workflowSubmissionValueLinkage(fields, changed, values, (input, all) => {
    assert.equal(Object.hasOwn(all, 'identity'), false);
    (input.reviewer as { label: string }).label = 'changed';
    return { reviewer: input.reviewer! };
  });
  assert.equal(values.reviewer.label, '原人');
  assert.equal((patch.reviewer as { label: string }).label, 'changed');
});
test('the entire linkage patch rejects hidden, readonly, system and unmatched targets before applying', () => {
  const projected = workflowSubmissionFormProjection(fields, {}, { reviewer: { visible: false } }).fields;
  for (const [active, key] of [[projected, 'reviewer'], [[{ ...field('reviewer'), widget: 'readonly' }], 'reviewer'],
    [[{ ...field('reviewer'), system: true }], 'reviewer'], [fields, 'applicant']] as const) {
    assert.throws(() => workflowSubmissionValueLinkage(active as SurfaceField[], {}, {}, () => ({ reason: 'changed', [key]: 'forged' })), /FIELD_UNAVAILABLE/);
  }
});
test('async, thenable, array and throwing callbacks fail without replacing entered values', () => {
  const values = { reason: 'entered' };
  for (const result of [Promise.resolve({ reason: 'later' }), { then: () => {} }, []]) {
    assert.throws(() => workflowSubmissionValueLinkage(fields, {}, values, (() => result) as any), /LINKAGE_INVALID/);
  }
  assert.throws(() => workflowSubmissionValueLinkage(fields, {}, values, () => { throw new Error('business-rule'); }), /business-rule/);
  assert.deepEqual(values, { reason: 'entered' });
  assert.deepEqual(workflowSubmissionValueLinkage(fields, {}, values), {});
});
test('linked canonical ranges survive the shared codec and touched protection against late prefill', () => {
  const range = { ...field('period'), type: 'date-range', widget: 'date-range', rangeBoundary: 'closed' } as SurfaceField;
  const surface = { fields: { period: range } };
  const patch = workflowSubmissionValueLinkage([range], {}, {}, () => ({ period: { start: '2026-10-01', end: '2026-10-06' } }));
  assert.deepEqual(normalizeFormValues(normalizeRecordForForm(patch, surface), surface), patch);
  assert.deepEqual(workflowSubmissionPrefill([range], { period: { start: '2026-01-01', end: '2026-02-01' } }, new Set(), key => Object.hasOwn(patch, key)), {});
});
