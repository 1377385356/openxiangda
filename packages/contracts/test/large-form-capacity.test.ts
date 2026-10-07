import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { validateDataResource } from '../src/validation.js';
import { applyWorkflowTaskPageValues, validateWorkflowTaskPages, type WorkflowTaskPage } from '../src/native-compiler/workflow-task-page.js';
import { DATA_RECORD_EVENT_DATA_SCHEMA_V2 } from '../src/event-catalog.js';
import { requiresExtendedFieldCapacity } from '../src/native-compiler/data-capacity.js';
import * as esm from '../dist/native-compiler/index.js';
const cjs = createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof esm;
const corpus = JSON.parse(readFileSync(new URL('./fixtures/configuration-compatibility-corpus.json', import.meta.url), 'utf8'));
const fields = (count: number) => Array.from({ length: count }, (_, index) => ({ code: `value${index}`, type: 'text.short', nullable: true, maxLength: 80 }));

test('200 fields pass the Native resource schema while 201 fail; duplicate fields remain invalid', () => {
  const resource = JSON.parse(corpus.configuration.canonical).data.resources[0];
  resource.schema.fields = fields(200);
  resource.fieldPolicies = {};
  assert.deepEqual(validateDataResource(resource), []);
  resource.schema.fields.push(fields(201)[200]);
  assert.ok(validateDataResource(resource).some(d => d.code === 'DATA_RESOURCE_FIELDS_INVALID'));
  resource.schema.fields = [...fields(199), fields(1)[0]];
  assert.ok(validateDataResource(resource).some(d => /DUPLICATE/.test(d.code)));
});

test('large task pages retain readonly and conditional required checks at the capacity boundary', () => {
  const page: WorkflowTaskPage = { title: 'Full budget', fields: fields(200).map(field => ({ code: field.code })) };
  assert.deepEqual(validateWorkflowTaskPages({ taskPages: { budget: page } }), []);
  assert.deepEqual(applyWorkflowTaskPageValues(page, {}, { value199: 'last field' }, true), { value199: 'last field' });
  page.fields[199]!.readonly = true;
  assert.throws(() => applyWorkflowTaskPageValues(page, { value199: 'original' }, { value199: 'forged' }, true), /WORKFLOW_TASK_FORM_FIELD_NOT_EDITABLE/);
  page.fields[198]!.requiredWhen = { op: 'eq', left: { op: 'path', path: 'values.value0' }, right: { op: 'literal', value: 'required' } };
  assert.throws(() => applyWorkflowTaskPageValues(page, {}, { value0: 'required' }, true), /REQUIRED/);
  page.fields.push({ code: 'overflow' });
  assert.ok(validateWorkflowTaskPages({ taskPages: { budget: page } }).some(d => /PAGE_INVALID/.test(d)));
});

test('old boundaries stay capability-free and only large resource/task declarations opt in', () => {
  assert.equal(requiresExtendedFieldCapacity([{ schema: { fields: fields(100) } }]), false);
  assert.equal(requiresExtendedFieldCapacity([{ schema: { fields: fields(101) } }]), true);
  assert.equal(requiresExtendedFieldCapacity([], [{ definition: { taskPages: { fill: { fields: fields(65) } } } }]), true);
  for (const implementation of [esm, cjs]) {
    const config = JSON.parse(corpus.configuration.canonical);
    assert.equal(implementation.compileRequiredPlatformCapabilitiesV3(config).some(c => c.code === 'data.extended-field-capacity'), false);
    config.data.resources[0].schema.fields = fields(200);
    assert.equal(implementation.compileRequiredPlatformCapabilitiesV3(config).find(c => c.code === 'data.extended-field-capacity')?.contractVersion, '1.0.0');
  }
  assert.equal(DATA_RECORD_EVENT_DATA_SCHEMA_V2.properties.changedFields.maxItems, 200);
  assert.equal(DATA_RECORD_EVENT_DATA_SCHEMA_V2.properties.changes.maxProperties, 200);
});
