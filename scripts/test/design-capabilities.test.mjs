import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { craftDependencies, generateDesignTopics, sha256, validateDesignCapabilities } from '../design-capabilities.mjs';
import { checkDesignUpstream, compareDesignTree } from '../check-opendesign-upstream.mjs';

const repository = resolve(import.meta.dirname, '../..');
function fixture(run) {
  const root = mkdtempSync(resolve(tmpdir(), 'oxa-design-source-'));
  cpSync(resolve(repository, 'design-capabilities'), resolve(root, 'design-capabilities'), { recursive: true });
  try { return run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function updateLock(root, update) {
  const path = resolve(root, 'design-capabilities/lock.json');
  const lock = JSON.parse(readFileSync(path, 'utf8')); update(lock);
  writeFileSync(path, JSON.stringify(lock));
}

test('fixed source preserves full resources and generated topics, with real dependency closure', () => {
  const result = generateDesignTopics(repository, true);
  assert.equal(result.files, 16);
  const { lock, files } = validateDesignCapabilities(repository);
  for (const [method, slugs] of Object.entries(lock.methods)) assert.deepEqual(craftDependencies(files.get(`skills/${method}/SKILL.md`)), slugs);
  assert.ok(readFileSync(resolve(repository, 'docs/design-craft.md'), 'utf8').includes(files.get('craft/form-validation.md').split('\n').find(line => line.length > 90)));
});

test('tampering, missing dependencies and missing licenses fail before generation', () => fixture(root => {
  const path = resolve(root, 'design-capabilities/vendor/craft/color.md');
  writeFileSync(path, 'tampered');
  assert.throws(() => validateDesignCapabilities(root), /DESIGN_RESOURCE_DIGEST_MISMATCH/);
  updateLock(root, lock => { lock.files = lock.files.filter(file => file.path !== 'craft/color.md'); });
  assert.throws(() => validateDesignCapabilities(root), /DESIGN_DEPENDENCY_MISSING/);
  updateLock(root, lock => { lock.files = lock.files.filter(file => file.path !== 'LICENSE'); });
  assert.throws(() => validateDesignCapabilities(root), /DESIGN_LICENSE_MISSING/);
}));

test('upstream adds a craft or local dependency: even refreshed hashes cannot bypass closure', () => fixture(root => {
  const name = 'skills/frontend-design/SKILL.md';
  const path = resolve(root, 'design-capabilities/vendor', name);
  const content = readFileSync(path, 'utf8').replace('requires: [typography, color, anti-ai-slop]', 'requires: [typography, color, anti-ai-slop, missing-rule]');
  writeFileSync(path, content);
  updateLock(root, lock => { Object.assign(lock.files.find(file => file.path === name), { bytes: Buffer.byteLength(content), sha256: sha256(content) }); });
  assert.throws(() => validateDesignCapabilities(root), /DESIGN_DEPENDENCY_DRIFT/);
  updateLock(root, lock => { lock.methods['frontend-design'].push('missing-rule'); });
  assert.throws(() => validateDesignCapabilities(root), /DESIGN_DEPENDENCY_MISSING: missing-rule/);
}));

test('comparison is quiet for identical snapshots and surfaces new/changed catalog capabilities', async () => {
  const { lock, files } = validateDesignCapabilities(repository);
  // Git tree fixture uses the fixed catalog plus original blob identities calculated by comparison.
  const first = compareDesignTree(lock, files, { tree: [], truncated: false }, lock.revision);
  const tree = lock.catalog.map(entry => ({ ...entry, type: 'blob' }));
  for (const change of first.changes) {
    const existing = tree.find(entry => entry.path === change.path);
    if (existing) existing.sha = change.previousBlob;
    else tree.push({ path: change.path, sha: change.previousBlob, type: 'blob' });
  }
  assert.equal(compareDesignTree(lock, files, { tree }, lock.revision).updateAvailable, false);
  tree.push({ path: 'skills/novel-ui/SKILL.md', sha: 'a'.repeat(40), type: 'blob' });
  const report = compareDesignTree(lock, files, { tree }, 'b'.repeat(40));
  assert.equal(report.updateAvailable, true); assert.equal(report.changes.length, 0);
  assert.equal(report.candidates[0].path, 'skills/novel-ui/SKILL.md');
  assert.throws(() => compareDesignTree(lock, files, { tree, truncated: true }, lock.revision), /INCOMPLETE/);
  await assert.rejects(checkDesignUpstream(repository, async () => ({ ok: false, status: 429 })), /DESIGN_UPSTREAM_HTTP_429/);
  assert.equal(validateDesignCapabilities(repository).lock.revision, lock.revision);
});

test('source reads reject oversized resources and symbolic links before generating topics', () => fixture(root => {
  const path = resolve(root, 'design-capabilities/vendor/craft/color.md');
  writeFileSync(path, Buffer.alloc(128 * 1024 + 1));
  assert.throws(() => validateDesignCapabilities(root), /DESIGN_RESOURCE_LIMIT/);
  rmSync(path);
  symlinkSync(resolve(repository, 'design-capabilities/vendor/craft/color.md'), path);
  assert.throws(() => validateDesignCapabilities(root), /DESIGN_RESOURCE_SYMLINK/);
}));

test('upstream response is capped while streaming and cancelled on overflow', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(checkDesignUpstream(repository, async () => response), /DESIGN_UPSTREAM_RESPONSE_LIMIT/);
  assert.equal(cancelled, true);
});
