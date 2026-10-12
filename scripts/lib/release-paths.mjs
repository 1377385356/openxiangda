import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
export function releasePaths(repositoryRoot, head) {
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error('Release HEAD must be a full commit ID');
  const result = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Cannot resolve release Git common directory');
  const directory = resolve(repositoryRoot, result.stdout.trim());
  const legacy = spawnSync('git', ['rev-parse', '--git-path', 'openxiangda-release-receipt.json'], { cwd: repositoryRoot, encoding: 'utf8' });
  if (legacy.error) throw legacy.error;
  if (legacy.status !== 0) throw new Error('Cannot resolve existing release receipt');
  const legacyPath = resolve(repositoryRoot, legacy.stdout.trim());
  if (legacyPath !== resolve(directory, 'openxiangda-release-receipt.json') && existsSync(legacyPath)) throw new Error('Existing private worktree receipt requires explicit recovery before using the shared release state');
  return { directory, receiptPath: resolve(directory, 'openxiangda-release-receipt.json'),
    lockPath: resolve(directory, 'openxiangda-release.lock'),
    artifactRoot: resolve(directory, `openxiangda-release-artifacts-${head}`) };
}
