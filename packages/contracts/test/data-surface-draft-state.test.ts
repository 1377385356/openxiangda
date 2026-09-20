import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNativeDataResourceSurfaceV2 } from '../src/native-compiler/data-surface.js';
import type { NativeDataFieldV2 } from '../src/types.js';

const fields: NativeDataFieldV2[] = [
  { code: 'title', type: 'text.short', label: '标题', nullable: false },
];

const valid = () => ({
  mutationOwner: 'readonly',
  fields: {
    title: {
      label: '标题',
      type: 'text.short',
      widget: 'text',
      readCapabilities: [],
      createCapabilities: [],
      updateCapabilities: [],
    },
  },
  form: {
    fieldOrder: ['title'],
    draftState: {
      version: 3,
      maxBytes: 196_608,
      fields: {
        mode: { type: 'string', required: true, maxLength: 32, enum: ['template', 'custom'] },
        templateVersion: { type: 'integer' },
        variables: { type: 'json.object', maxBytes: 65_536 },
      },
    },
  },
});

const validate = (surface: unknown) =>
  validateNativeDataResourceSurfaceV2(surface, fields, '/surface');

test('draft-only state accepts bounded typed fields without adding business fields', () => {
  const surface = valid();
  assert.doesNotThrow(() => validate(surface));
  assert.deepEqual(Object.keys(surface.fields), ['title']);
});

test('draft-only state rejects unknown options and every bounded edge', () => {
  const invalid = [
    (surface: any) => { surface.form.draftState.extra = true; },
    (surface: any) => { surface.form.draftState.version = 0; },
    (surface: any) => { surface.form.draftState.maxBytes = 196_609; },
    (surface: any) => { surface.form.draftState.fields = {}; },
    (surface: any) => { surface.form.draftState.fields['bad-key'] = { type: 'boolean' }; },
    (surface: any) => { surface.form.draftState.fields.mode.maxLength = 0; },
    (surface: any) => { surface.form.draftState.fields.mode.enum = ['custom', 'custom']; },
    (surface: any) => { surface.form.draftState.fields.mode.enum = ['x'.repeat(256)]; },
    (surface: any) => { surface.form.draftState.fields.variables.maxBytes = 65_537; },
    (surface: any) => { surface.form.draftState.fields.variables.maxLength = 12; },
  ];
  for (const mutate of invalid) {
    const surface = valid();
    mutate(surface);
    assert.throws(() => validate(surface));
  }
});
