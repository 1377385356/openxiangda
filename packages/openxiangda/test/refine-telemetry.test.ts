import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('disables Refine telemetry in the canonical application runtime', () => {
  const source = readFileSync(
    new URL('../src/browser/application.tsx', import.meta.url),
    'utf8',
  );

  assert.equal((source.match(/<Refine\b/g) || []).length, 1);
  assert.match(source, /disableTelemetry: true/);
  assert.match(source, /options=\{REFINE_OPTIONS\}/);
});
