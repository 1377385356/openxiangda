import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acquireReleaseProcessLock } from '../lib/release-process-lock.mjs';

test('a second release process cannot mutate the shared receipt until the first exits', t => {
  const root = mkdtempSync(join(tmpdir(), 'ox-release-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'release.lock');
  const release = acquireReleaseProcessLock(path);
  const module = new URL('../lib/release-process-lock.mjs', import.meta.url).href;
  const script = join(root, 'try.mjs');
  writeFileSync(script, `import { acquireReleaseProcessLock } from ${JSON.stringify(module)};\nacquireReleaseProcessLock(${JSON.stringify(path)})();`);
  const busy = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.notEqual(busy.status, 0);
  assert.match(busy.stderr, /RELEASE_PROCESS_BUSY/);
  release();
  assert.equal(spawnSync(process.execPath, [script]).status, 0);
});
