import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertReleaseHeadOnMainline, frozenReleaseAllowsMainlineAdvance } from '../lib/release-mainline.mjs';

function history(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'ox-frozen-mainline-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '--initial-branch=master');
  git('config', 'user.name', 'release-fixture');
  git('config', 'user.email', 'release@example.invalid');
  const commit = (value) => { writeFileSync(join(cwd, 'source'), value); git('add', 'source'); git('commit', '-m', value); return git('rev-parse', 'HEAD'); };
  const head = commit('frozen candidate');
  return { cwd, git, commit, head, upstream: 'origin/master' };
}

test('fresh freeze requires the exact master tip while a frozen source can survive a later commit', t => {
  const f = history(t);
  assertReleaseHeadOnMainline({ ...f, upstreamHead: f.head });
  const upstreamHead = f.commit('later independent reviewed change');
  assert.throws(() => assertReleaseHeadOnMainline({ ...f, upstreamHead }), /does not exactly match/);
  assertReleaseHeadOnMainline({ ...f, upstreamHead, allowContained: true });
});

test('removing the frozen source from mainline rejects publication even when the source is still locally present', t => {
  const f = history(t);
  f.git('checkout', '--orphan', 'replacement');
  const upstreamHead = f.commit('replacement mainline');
  assert.throws(() => assertReleaseHeadOnMainline({ ...f, upstreamHead, allowContained: true }), /is not contained/);
});

test('only a matching frozen receipt can admit mainline advancement before publication', () => {
  const head = 'a'.repeat(40);
  const receipt = { schema: 'openxiangda.release-receipt/v2', head, phase: 'planned', artifactManifestSha256: 'b'.repeat(64), artifactManifestPath: '/frozen/manifest.json', candidates: [{ name: 'openxiangda', version: '2.59.4' }] };
  assert.equal(frozenReleaseAllowsMainlineAdvance(receipt, head), true);
  assert.equal(frozenReleaseAllowsMainlineAdvance({ ...receipt, phase: 'validated' }, head), true);
  for (const invalid of [undefined, { ...receipt, schema: 'unknown' }, { ...receipt, head: 'c'.repeat(40) }, { ...receipt, artifactManifestSha256: '' }, { ...receipt, artifactManifestPath: '' }, { ...receipt, candidates: [] }, { ...receipt, phase: 'unknown' }]) {
    assert.equal(frozenReleaseAllowsMainlineAdvance(invalid, head), false);
  }
});
