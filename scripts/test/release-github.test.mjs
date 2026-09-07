import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { synchronizeGithubRelease } from '../lib/release-github.mjs';

const body = 'Reviewed release notes';
const plan = { repository: '1377385356/openxiangda', tag: 'v2.0.0', head: 'a'.repeat(40), title: 'OpenXiangda 2.0', body, bodySha256: createHash('sha256').update(body).digest('hex'), notesSha256: 'b'.repeat(64), prerelease: false };
const release = { id: 12, html_url: 'https://github.com/1377385356/openxiangda/releases/tag/v2.0.0', tag_name: plan.tag, name: plan.title, body, draft: false, prerelease: false };

test('GitHub synchronization resumes an existing exact release without any npm or duplicate write', () => {
  const calls = [];
  const result = synchronizeGithubRelease(plan, (command, args) => {
    calls.push({ command, args });
    return { status: 0, stdout: JSON.stringify(args.at(-1).includes('/commits/') ? { sha: plan.head } : release) };
  });
  assert.equal(result.head, plan.head); assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.command === 'gh' && !call.args.includes('POST')));
});

test('a missing release is created once, read back and bound to the frozen source', () => {
  let calls = 0, writes = 0;
  synchronizeGithubRelease(plan, (command, args) => {
    calls++;
    if (calls === 1) return { status: 1, stderr: 'gh: Not Found (HTTP 404)' };
    if (args.includes('POST')) writes++;
    return { status: 0, stdout: JSON.stringify(args.at(-1).includes('/commits/') ? { sha: plan.head } : release) };
  });
  assert.equal(writes, 1); assert.equal(calls, 4);
});

test('content, source and authentication mismatches stop without replacing an existing release', () => {
  assert.throws(() => synchronizeGithubRelease(plan, () => ({ status: 0, stdout: JSON.stringify({ ...release, body: 'edited' }) })), /CONTENT_MISMATCH/);
  assert.throws(() => synchronizeGithubRelease(plan, (_command, args) => ({ status: 0, stdout: JSON.stringify(args.at(-1).includes('/commits/') ? { sha: 'c'.repeat(40) } : release) })), /SOURCE_MISMATCH/);
  assert.throws(() => synchronizeGithubRelease(plan, () => ({ status: 1, stderr: 'HTTP 401' })), /API_FAILED/);
});
