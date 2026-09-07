import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadReleaseNotes, renderReleaseNotes } from './release-notes.mjs';

const repository = '1377385356/openxiangda';
const digest = text => createHash('sha256').update(text).digest('hex');

export function planGithubRelease(root, receipt) {
  const product = receipt.candidates.find(item => item.name === 'openxiangda');
  if (!product) throw new Error('RELEASE_GITHUB_PRODUCT_CANDIDATE_REQUIRED');
  const notes = loadReleaseNotes(root, product.version);
  const body = renderReleaseNotes(notes) + `\n## 制品来源\n\n源码提交：\`${receipt.head}\`\n\n` +
    '| npm 包 | 版本 | SHA-256 |\n| --- | --- | --- |\n' + receipt.candidates.map(item => `| ${item.name} | ${item.version} | ${item.artifact.sha256} |`).join('\n') + '\n';
  return { repository, tag: `v${product.version}`, head: receipt.head, title: notes.title, body, bodySha256: digest(body), notesSha256: notes.sha256, prerelease: product.version.includes('-') };
}

// This is a final, resumable step of the frozen npm receipt, never a second publisher.
export function synchronizeGithubRelease(plan, run = spawnSync) {
  if (!plan || plan.repository !== repository || !/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(plan.tag) || !/^[a-f0-9]{40}$/.test(plan.head) || digest(plan.body) !== plan.bodySha256) throw new Error('RELEASE_GITHUB_PLAN_INVALID');
  const endpoint = `repos/${repository}/releases/tags/${plan.tag}`;
  const api = (args, optional = false) => {
    const result = run('gh', ['api', ...args], { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) {
      if (optional && !result.error && /HTTP 404/.test(String(result.stderr))) return null;
      throw new Error('RELEASE_GITHUB_API_FAILED: 保留原 npm 发布回执；核对 GitHub 认证或网络后恢复同一发布');
    }
    return JSON.parse(result.stdout);
  };
  let release = api([endpoint], true);
  if (!release) {
    const scratch = mkdtempSync(join(tmpdir(), 'openxiangda-github-release-'));
    try {
      const file = join(scratch, 'release.json');
      writeFileSync(file, JSON.stringify({ tag_name: plan.tag, target_commitish: plan.head, name: plan.title, body: plan.body, draft: false, prerelease: plan.prerelease, make_latest: plan.prerelease ? 'false' : 'true' }), { mode: 0o600 });
      api(['--method', 'POST', `repos/${repository}/releases`, '--input', file]);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
    release = api([endpoint]);
  }
  assertGithubReleaseMatches(plan, release);
  const commit = api([`repos/${repository}/commits/${plan.tag}`]);
  if (commit.sha !== plan.head) throw new Error('RELEASE_GITHUB_TAG_SOURCE_MISMATCH');
  return { id: release.id, url: release.html_url, tag: plan.tag, head: commit.sha, bodySha256: plan.bodySha256, notesSha256: plan.notesSha256 };
}

export function assertGithubReleaseMatches(plan, release) {
  if (release.tag_name !== plan.tag || release.name !== plan.title || Boolean(release.draft) || Boolean(release.prerelease) !== plan.prerelease || digest(release.body || '') !== plan.bodySha256) {
    throw new Error('RELEASE_GITHUB_CONTENT_MISMATCH: 已存在的 GitHub Release 与冻结说明不一致；停止而不覆盖');
  }
}
