import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadReleaseNotes, renderReleaseNotes, validatePlannedReleaseNotes } from '../lib/release-notes.mjs';

const valid = {
  schemaVersion: 'openxiangda.release-notes/v1', version: '2.4.1', status: 'reviewed',
  title: 'Event dependency scope', summary: 'Construct accepted event handler dependencies.',
  newFeatures: [], fixes: ['Resolve request-scoped consumers.'], affectedUsers: ['Event consumers'],
  upgradeSteps: ['Upgrade the pinned package.'], knownLimitations: ['No user request identity.'],
  compatibility: { node: '>=24' }, issues: [],
};

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'release-notes-test-'));
  try {
    mkdirSync(join(root, 'docs/releases'), { recursive: true });
    mkdirSync(join(root, 'packages/openxiangda'), { recursive: true });
    mkdirSync(join(root, '.changeset'));
    writeFileSync(join(root, 'packages/openxiangda/package.json'), '{"version":"2.4.0"}\n');
    writeFileSync(join(root, '.changeset/pending.md'), 'reviewed pending change');
    return run(root, notes => writeFileSync(join(root, 'docs/releases/2.4.1.json'), JSON.stringify(notes)));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('patch-only and feature-only notes are substantive without fabricated categories', () => fixture((root, write) => {
  write(valid);
  assert.match(renderReleaseNotes(loadReleaseNotes(root, '2.4.1')), /新增能力\n\n无。/);
  write({ ...valid, newFeatures: ['New capability'], fixes: [] });
  assert.equal(loadReleaseNotes(root, '2.4.1').fixes.length, 0);
  write({ ...valid, fixes: [] });
  assert.throws(() => loadReleaseNotes(root, '2.4.1'), /CHANGE_REQUIRED/);
}));

test('planned next version is checked read-only before any version writes', () => fixture((root, write) => {
  const plan = { releases: [{ name: 'openxiangda', oldVersion: '2.4.0', newVersion: '2.4.1' }] };
  const manifest = readFileSync(join(root, 'packages/openxiangda/package.json'), 'utf8');
  const pending = readFileSync(join(root, '.changeset/pending.md'), 'utf8');
  assert.throws(() => validatePlannedReleaseNotes(root, plan), /NOTES_REQUIRED/);
  for (const notes of [{ ...valid, status: 'draft' }, { ...valid, fixes: [' '] }, { ...valid, affectedUsers: [] }]) {
    write(notes);
    assert.throws(() => validatePlannedReleaseNotes(root, plan), /RELEASE_NOTES_/);
    assert.equal(readFileSync(join(root, 'packages/openxiangda/package.json'), 'utf8'), manifest);
    assert.equal(readFileSync(join(root, '.changeset/pending.md'), 'utf8'), pending);
  }
  write(valid);
  assert.equal(validatePlannedReleaseNotes(root, plan).version, '2.4.1');
  assert.throws(() => validatePlannedReleaseNotes(root, { releases: [] }), /2\.4\.0\.json/);
  assert.equal(validatePlannedReleaseNotes(root, { releases: [{ name: 'openxiangda', newVersion: '2.5.0-alpha.1' }] }), null);
  assert.throws(() => validatePlannedReleaseNotes(root, {}), /PLAN_INVALID/);
  assert.throws(() => validatePlannedReleaseNotes(root, { releases: [{ name: 'openxiangda', newVersion: undefined }] }), /PLAN_INVALID/);
}));
