import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertReleaseHeadOnMainline, frozenReleaseAllowsMainlineAdvance, frozenArtifactManifestAllowsMainlineAdvance } from '../lib/release-mainline.mjs';
import { writeReleaseArtifactManifest } from '../lib/release-artifacts.mjs';
import { PUBLIC_PACKAGE_NAMES } from '../lib/public-package-policy.mjs';

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

test('a plan manifest admits first verification after mainline advances before its receipt exists', t => {
  const f = history(t);
  const path = join(f.cwd, '.git', 'manifest.json');
  const registry = 'https://registry.npmjs.org';
  const context = { path, head: f.head, registry };
  assert.equal(frozenArtifactManifestAllowsMainlineAdvance(context), false);
  const packages = PUBLIC_PACKAGE_NAMES.map(name => {
    const tarball = join(f.cwd, '.git', `${name}.tgz`);
    writeFileSync(tarball, `frozen ${name}`);
    return { name, version: '2.0.0', status: 'candidate', tarball };
  });
  writeReleaseArtifactManifest({ ...context, packages });
  const upstreamHead = f.commit('later change during reference preparation');
  assertReleaseHeadOnMainline({ ...f, upstreamHead, allowContained: frozenArtifactManifestAllowsMainlineAdvance(context) });
  assert.throws(() => frozenArtifactManifestAllowsMainlineAdvance({ ...context, head: 'c'.repeat(40) }), /HEAD_MISMATCH/);
  assert.throws(() => frozenArtifactManifestAllowsMainlineAdvance({ ...context, registry: 'https://other.invalid' }), /REGISTRY_MISMATCH/);
  const valid = readFileSync(path, 'utf8');
  const missing = JSON.parse(valid);
  missing.packages.pop();
  writeFileSync(path, JSON.stringify(missing));
  assert.throws(() => frozenArtifactManifestAllowsMainlineAdvance(context), /PUBLIC_PACKAGE_SET_INVALID/);
  writeFileSync(path, valid);
  writeFileSync(packages[0].tarball, 'changed bytes');
  assert.throws(() => frozenArtifactManifestAllowsMainlineAdvance(context), /DIGEST_MISMATCH/);
});
