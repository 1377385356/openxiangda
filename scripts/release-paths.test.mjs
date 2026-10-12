import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { releasePaths } from './lib/release-paths.mjs';
test('linked worktrees share frozen artifacts, receipt and writer lock', () => {
 const temporary = mkdtempSync(join(tmpdir(), 'oxa-release-paths-'));
 const primary = join(temporary, 'primary'), linked = join(temporary, 'linked');
 const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
 try {
  execFileSync('git', ['init', primary], { stdio: 'ignore' });
  git(primary, ['config', 'user.name', 'Test']); git(primary, ['config', 'user.email', 'test@example.invalid']);
  writeFileSync(join(primary, 'source.txt'), 'original candidate');
  git(primary, ['add', '.']); git(primary, ['commit', '-m', 'candidate']);
  const head = git(primary, ['rev-parse', 'HEAD']);
  git(primary, ['worktree', 'add', '--detach', linked, head]);
  const paths = releasePaths(primary, head);
  assert.deepEqual(releasePaths(linked, head), paths);
  assert.equal(paths.receiptPath, join(primary, '.git', 'openxiangda-release-receipt.json'));
  assert.equal(paths.artifactRoot, join(primary, '.git', `openxiangda-release-artifacts-${head}`));
  assert.throws(() => releasePaths(primary, 'short-head'));
  const legacy = git(linked, ['rev-parse', '--git-path', 'openxiangda-release-receipt.json']);
  writeFileSync(legacy, JSON.stringify({ phase: 'publishing-packages', head }));
  assert.throws(() => releasePaths(linked, head), /explicit recovery/);
 } finally { rmSync(temporary, { recursive: true, force: true }); }
});
