import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkflowCommandHandlers } from '../src/native-compiler/workflow-business-command.js';

const fixture = (): any => ({
  code: 'request-approval', subject: { resourceCode: 'requests', factProjection: { reviewer: 'reviewer' } },
  commandHandlers: { resubmit: { operationCode: 'requests.resubmit', derivedSubjectFields: ['reviewer'] } },
  taskPages: { correction: { fields: [{ code: 'reviewer', readonly: true }] } },
  nodes: { correct: { kind: 'correction' } },
});

test('bounded derived facts are declared only by the fixed resubmit handler', () => {
  assert.deepEqual(validateWorkflowCommandHandlers(fixture()), []);
  const original = fixture(); delete original.commandHandlers.resubmit.derivedSubjectFields;
  assert.deepEqual(validateWorkflowCommandHandlers(original), []);
  for (const command of ['approve', 'reject', 'withdraw']) {
    const value = fixture(); value.commandHandlers = { [command]: value.commandHandlers.resubmit };
    assert.ok(validateWorkflowCommandHandlers(value).includes('WORKFLOW_CORRECTION_DERIVED_SUBJECT_FIELDS_INVALID'));
  }
});

for (const [name, change] of [
  ['empty', (value: any) => value.commandHandlers.resubmit.derivedSubjectFields = []],
  ['duplicate', (value: any) => value.commandHandlers.resubmit.derivedSubjectFields = ['reviewer', 'reviewer']],
  ['unknown projection', (value: any) => value.commandHandlers.resubmit.derivedSubjectFields = ['other']],
  ['owned path', (value: any) => { value.subject.factProjection.people = 'items.person'; value.commandHandlers.resubmit.derivedSubjectFields = ['items.person']; }],
  ['system', (value: any) => { value.subject.factProjection.owner = 'createdBy'; value.commandHandlers.resubmit.derivedSubjectFields = ['createdBy']; }],
  ['native system', (value: any) => { value.subject.factProjection.owner = 'created_by'; value.commandHandlers.resubmit.derivedSubjectFields = ['created_by']; }],
  ['editable correction', (value: any) => delete value.taskPages.correction.fields[0].readonly],
  ['editable other page', (value: any) => value.taskPages.other = { fields: [{ code: 'reviewer', readonly: false }] }],
  ['null', (value: any) => value.commandHandlers.resubmit.derivedSubjectFields = null],
  ['non-string', (value: any) => value.commandHandlers.resubmit.derivedSubjectFields = [1]],
  ['budget', (value: any) => { const fields = Array.from({ length: 33 }, (_, i) => `field${i}`); value.subject.factProjection = Object.fromEntries(fields.map(field => [field, field])); value.commandHandlers.resubmit.derivedSubjectFields = fields; }],
] as const) test(`reject derived fact declaration: ${name}`, () => {
  const value = fixture(); change(value);
  assert.ok(validateWorkflowCommandHandlers(value).includes('WORKFLOW_CORRECTION_DERIVED_SUBJECT_FIELDS_INVALID'));
});

test('accepts the exact 32-field bound without expanding task edit permission', () => {
  const value = fixture(); const fields = Array.from({ length: 32 }, (_, i) => `field${i}`);
  value.subject.factProjection = Object.fromEntries(fields.map(field => [field, field]));
  value.commandHandlers.resubmit.derivedSubjectFields = fields;
  assert.deepEqual(validateWorkflowCommandHandlers(value), []);
});
