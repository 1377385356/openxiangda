import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { browserStageFingerprint, canReuseBrowserStage, runCachedStage } from '../lib/release-stage-cache.mjs';
import { runReleaseCommand } from '../lib/release-command.mjs';

function fixture(parent, name, guidance = 'first') {
  const directory = join(parent, name);
  const app = join(directory, 'application');
  const root = join(directory, 'package');
  const runner = join(directory, 'scripts');
  for (const path of [join(app, 'apps/web/src'), join(root, 'dist'), join(root, 'documentation'), runner]) mkdirSync(path, { recursive: true });
  writeFileSync(join(app, 'apps/web/src/App.tsx'), 'export const value = 1;');
  writeFileSync(join(root, 'dist/index.js'), 'export const value = 1;');
  writeFileSync(join(root, 'documentation/guide.md'), guidance);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'openxiangda', version: '2.11.1', exports: './dist/index.js', openxiangdaRelease: { notes: guidance } }));
  writeFileSync(join(runner, 'verify.mjs'), 'browser runner v1');
  const tarball = join(directory, 'openxiangda.tgz');
  writeFileSync(tarball, `candidate bytes with ${guidance}`);
  writeFileSync(join(app, 'package.json'), JSON.stringify({ pnpm: { overrides: { openxiangda: `file:${tarball}` } } }));
  const integrity = createHash('sha512').update(readFileSync(tarball)).digest('base64');
  writeFileSync(join(app, 'pnpm-lock.yaml'), `openxiangda@file:${relative(app, tarball)}:\n  resolution: {integrity: sha512-${integrity}}\nexternal:\n  resolution: {integrity: sha512-external-original}\n`);
  return { applicationRoot: app, runnerRoot: runner, packages: [{ name: 'openxiangda', root, tarball }], env: {} };
}

test('browser evidence survives scratch-path and documentation-only tarball changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'oxa-stage-'));
  try {
    const first = fixture(root, 'first');
    const docsFix = fixture(root, 'second', 'fixed markup');
    assert.equal(browserStageFingerprint(first), browserStageFingerprint(docsFix));
    writeFileSync(join(docsFix.packages[0].root, 'dist/index.js'), 'export const value = 2;');
    assert.notEqual(browserStageFingerprint(first), browserStageFingerprint(docsFix));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('browser evidence changes with external dependency, app, runner, package semantics or environment', () => {
  const root = mkdtempSync(join(tmpdir(), 'oxa-stage-inputs-'));
  try {
    for (const [name, mutate] of [
      ['dependency', f => writeFileSync(join(f.applicationRoot, 'pnpm-lock.yaml'), readFileSync(join(f.applicationRoot, 'pnpm-lock.yaml'), 'utf8').replace('external-original', 'external-changed'))],
      ['app', f => writeFileSync(join(f.applicationRoot, 'apps/web/src/App.tsx'), 'changed browser application')],
      ['runner', f => writeFileSync(join(f.runnerRoot, 'verify.mjs'), 'changed runner')],
      ['exports', f => writeFileSync(join(f.packages[0].root, 'package.json'), '{"name":"openxiangda","version":"2.11.1","exports":"./dist/other.js"}')],
      ['env', f => { f.env.TZ = 'Etc/UTC'; }],
    ]) {
      const f = fixture(root, name);
      const before = browserStageFingerprint(f);
      mutate(f);
      assert.notEqual(browserStageFingerprint(f), before, name);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('successful stages reuse, expire, force rerun and invalidate earlier success after failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'oxa-stage-result-'));
  let executions = 0, now = 100_000;
  const options = { directory, stage: 'packed-browser', fingerprint: 'a'.repeat(64), now: () => now, report: () => {}, execute: () => { executions++; } };
  try {
    assert.equal(runCachedStage(options).reused, false);
    assert.equal(runCachedStage(options).reused, true);
    assert.equal(executions, 1);
    now += 24 * 3600_000 + 1;
    assert.equal(runCachedStage(options).reused, false);
    assert.equal(runCachedStage({ ...options, enabled: false }).reused, false);
    assert.throws(() => runCachedStage({ ...options, enabled: false, execute: () => { throw new Error('fixture failure'); } }), /fixture failure/);
    assert.equal(runCachedStage(options).reused, false);
    assert.equal(executions, 4);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('full and external live validation never reuse local browser evidence', () => {
  assert.equal(canReuseBrowserStage({}), true);
  for (const env of [
    { OPENXIANGDA_RELEASE_FULL_VALIDATION: '1' }, { OPENXIANGDA_RELEASE_STAGE_CACHE: 'false' },
    { OPENXIANGDA_LIVE_DATA_API: '1' }, { OPENXIANGDA_E2E_PLATFORM_URL: 'https://example.invalid' },
  ]) assert.equal(canReuseBrowserStage(env), false);
});

test('concurrent input changes cannot write a passing browser receipt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'oxa-stage-concurrent-'));
  const options = { directory, stage: 'packed-browser', fingerprint: 'a'.repeat(64), report: () => {}, execute: () => {} };
  try {
    assert.throws(() => runCachedStage({ ...options, currentFingerprint: () => 'b'.repeat(64) }), /RELEASE_STAGE_INPUTS_CHANGED/);
    assert.equal(runCachedStage(options).reused, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('bounded release commands propagate failure and terminate on budget expiry', async () => {
  await assert.rejects(runReleaseCommand(process.execPath, ['-e', 'process.exit(3)'], { timeoutMs: 1000, report: () => {} }), /RELEASE_STEP_FAILED/);
  await assert.rejects(runReleaseCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100, report: () => {} }), /timeout/);
});
