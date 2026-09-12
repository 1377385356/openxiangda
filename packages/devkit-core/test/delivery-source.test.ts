import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { publishedDeliverySource, assertDeliverySourceUnchanged } from '../src/delivery-source.js';

function fixture(branch = 'main') {
  const base = mkdtempSync(join(tmpdir(), 'oxa-delivery-source-'));
  const root = join(base, 'application');
  const remote = join(base, 'remote.git');
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  execFileSync('git', ['init', '--bare', '-b', branch, remote], { stdio: 'ignore' });
  execFileSync('git', ['clone', remote, root], { stdio: 'ignore' });
  git('config', 'user.name', 'Delivery Test');
  git('config', 'user.email', 'delivery@example.invalid');
  writeFileSync(join(root, 'app.txt'), 'first');
  git('add', 'app.txt'); git('commit', '-m', 'first'); git('push', '-u', 'origin', branch);
  return { root, remote, git, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

for (const branch of ['main', 'master']) {
  test(`freezes the actual remote default branch ${branch}`, async () => {
    const f = fixture(branch);
    try {
      const source = await publishedDeliverySource(f.root);
      assert.equal(source.branch, branch);
      assert.equal(source.commit, f.git('rev-parse', 'HEAD'));
      await assertDeliverySourceUnchanged(f.root, source);
    } finally { f.cleanup(); }
  });
}

test('publishes from the current task branch without a mainline checkout', async () => {
  const f = fixture();
  try {
    f.git('checkout', '-b', 'task/new-feature');
    writeFileSync(join(f.root, 'app.txt'), 'task feature');
    f.git('commit', '-am', 'task feature'); f.git('push', '-u', 'origin', 'task/new-feature');
    const taskCommit = f.git('rev-parse', 'HEAD');
    const taskSource = await publishedDeliverySource(f.root);
    assert.equal(taskSource.branch, 'task/new-feature');
    assert.equal(taskSource.commit, taskCommit);
    assert.equal(f.git('branch', '--show-current'), 'task/new-feature');
    f.git('checkout', 'main');
    assert.equal((await publishedDeliverySource(f.root, taskCommit)).commit, taskCommit);
  } finally { f.cleanup(); }
});

test('dirty and unpushed source remains publishable for a fast test loop', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'untracked.txt'), 'not committed');
    assert.equal((await publishedDeliverySource(f.root)).commit, f.git('rev-parse', 'HEAD'));
    f.git('add', 'untracked.txt'); f.git('commit', '-m', 'unpublished');
    assert.equal((await publishedDeliverySource(f.root)).commit, f.git('rev-parse', 'HEAD'));
  } finally { f.cleanup(); }
});

test('source metadata can be read again after local changes without a freeze check', async () => {
  const f = fixture();
  try {
    const source = await publishedDeliverySource(f.root);
    writeFileSync(join(f.root, 'app.txt'), 'next');
    f.git('commit', '-am', 'next'); f.git('push', 'origin', 'main');
    assert.equal((await publishedDeliverySource(f.root, source.commit)).commit, source.commit);
    await assertDeliverySourceUnchanged(f.root, source);
    f.git('reset', '--hard', source.commit);
    assert.equal((await publishedDeliverySource(f.root)).commit, source.commit);
  } finally { f.cleanup(); }
});

test('source edits and an unavailable remote fall back to local provenance', async () => {
  const f = fixture();
  try {
    const source = await publishedDeliverySource(f.root);
    writeFileSync(join(f.root, 'app.txt'), 'changed');
    await assertDeliverySourceUnchanged(f.root, source);
    f.git('restore', 'app.txt');
    f.git('remote', 'set-url', 'origin', join(f.root, 'not-a-repository'));
    const local = await publishedDeliverySource(f.root);
    assert.equal(local.commit, source.commit);
  } finally { f.cleanup(); }
});
