import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('standard controls honor declared numeric, text, and file bounds', () => {
  const source = readFileSync(
    new URL('../src/browser/components/resource/SurfaceFields.tsx', import.meta.url),
    'utf8'
  );
  assert.match(source, /field\.type === 'number\.integer' \? 0 : field\.scale/);
  assert.match(source, /10 \*\* -scale/);
  assert.match(source, /field\.widget === 'money'/);
  assert.match(source, /field\.widget === 'percent'/);
  assert.match(source, /min=\{field\.min\}/);
  assert.match(source, /max=\{field\.max\}/);
  assert.match(source, /maxLength: field\.maxLength/);
  assert.match(source, /file\.size > maxSizeMb \* 1024 \* 1024/);
  assert.doesNotMatch(source, /<InputNumber min=\{0\}/);
});
