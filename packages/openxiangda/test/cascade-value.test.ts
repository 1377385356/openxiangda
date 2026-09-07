import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataFieldOption } from 'openxiangda-contracts/browser';
import {
  cascadeControlValue,
  cascadeStoredValue,
  cascadeTerminalValues,
} from '../src/browser/components/platform-fields/cascade-value';

const options: DataFieldOption[] = [
  {
    value: 'equipment',
    label: '设备',
    children: [
      {
        value: 'optical',
        label: '光学设备',
        children: [{ value: 'microscope', label: '显微镜' }],
      },
      { value: 'electrical', label: '电气设备' },
    ],
  },
];

test('stores every labeled node for a cascade single path', () => {
  const value = cascadeStoredValue(
    options,
    ['equipment', 'optical', 'microscope'],
    false
  );
  assert.deepEqual(value, [
    { value: 'equipment', label: '设备' },
    { value: 'optical', label: '光学设备' },
    { value: 'microscope', label: '显微镜' },
  ]);
  assert.deepEqual(cascadeControlValue(value, false), [
    'equipment',
    'optical',
    'microscope',
  ]);
  assert.deepEqual(cascadeTerminalValues(value, false), ['microscope']);
});

test('stores independent complete paths for cascade multiple', () => {
  const value = cascadeStoredValue(
    options,
    [
      ['equipment', 'optical', 'microscope'],
      ['equipment', 'electrical'],
    ],
    true
  );
  assert.deepEqual(cascadeTerminalValues(value, true), [
    'microscope',
    'electrical',
  ]);
  assert.deepEqual(cascadeControlValue(value, true), [
    ['equipment', 'optical', 'microscope'],
    ['equipment', 'electrical'],
  ]);
});

test('drops forged paths that do not exist in declared options', () => {
  assert.equal(
    cascadeStoredValue(options, ['equipment', 'missing'], false),
    undefined
  );
});
