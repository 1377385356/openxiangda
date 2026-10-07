import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readOperationInput } from '../src/commands/admin.js';

test('CLI bounds JSON files and exposes actionable operation errors through its real parser', t => {
  const root = mkdtempSync(resolve(tmpdir(), 'ox-operation-input-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = resolve(root, 'input.json');
  writeFileSync(input, '{"bindingCode":"organization.default"}');
  assert.deepEqual(readOperationInput(input), { bindingCode: 'organization.default' });
  writeFileSync(input, 'invalid'); assert.throws(() => readOperationInput(input), /INPUT_INVALID/);
  writeFileSync(input, ' '.repeat(32769)); assert.throws(() => readOperationInput(input), /TOO_LARGE/);
  for (const args of [
    ['admin', 'execute', 'events.status', '--input', '-'],
    ['admin', 'execute', 'unknown', '--environment', 'production', '--input', '-'],
    ['admin', 'execute', 'events.status', '--environment', 'production', '--input', '-'],
  ]) {
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../bin/run.js'), ...args, '--json'], { input: args[2] === 'events.status' && args.includes('production') ? '{"actor":"forged"}' : '{}', encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 1, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.match(output.error.code, /APPLICATION_OPERATION_/);
    assert.equal(output.error.nextCommand, 'pnpm openxiangda docs application-operations');
  }
});
