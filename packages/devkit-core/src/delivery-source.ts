import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const SHA = /^[a-f0-9]{40,64}$/;

export interface PublishedDeliverySource {
  repository: string;
  branch: string;
  commit: string;
  mainlineCommit: string;
}

export class DeliverySourceError extends Error {
  readonly retryable = false;
  readonly data: Record<string, unknown>;
  constructor(readonly code: string, message: string, remediation: string, details: Record<string, unknown> = {}) {
    super(`${code}: ${message}`);
    this.data = { pointer: 'git', remediation, ...details };
  }
}

async function git(root: string, args: string[]) {
  return (await execute('git', ['-C', root, ...args], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })).stdout.trim();
}

async function cleanCommit(root: string) {
  let commit: string;
  try { commit = await git(root, ['rev-parse', '--verify', 'HEAD']); }
  catch {
    throw new DeliverySourceError('DELIVERY_GIT_COMMIT_REQUIRED', '发布需要已提交的 Git 源码', '先建立应用仓库，提交并推送主分支；日常开发仍可使用 dev/check');
  }
  if (!SHA.test(commit)) throw new DeliverySourceError('DELIVERY_GIT_COMMIT_REQUIRED', '无法识别源码提交', '检查应用 Git 仓库');
  if (await git(root, ['status', '--porcelain', '--untracked-files=normal'])) {
    throw new DeliverySourceError('DELIVERY_SOURCE_DIRTY', '工作区有未提交内容，尚不能冻结发布候选', '保留其他任务的改动，完成本轮整合并提交、推送主分支后发布');
  }
  return commit;
}

/** 权威主线来自 origin 的远端 HEAD，绝不使用任务分支的 upstream。 */
export async function publishedDeliverySource(root: string, sourceCommit?: string): Promise<PublishedDeliverySource> {
  const currentCommit = await cleanCommit(root);
  let repository: string;
  let remoteHead: string;
  try {
    repository = await git(root, ['remote', 'get-url', 'origin']);
    remoteHead = await git(root, ['ls-remote', '--symref', 'origin', 'HEAD']);
  } catch {
    throw new DeliverySourceError('DELIVERY_MAINLINE_UNAVAILABLE', '无法读取绑定远端 origin 的主分支', '检查 origin 与远端访问；恢复后重试，不使用过期的本地远端引用');
  }
  const branch = remoteHead.match(/^ref: refs\/heads\/(.+)\s+HEAD$/m)?.[1];
  if (!branch) throw new DeliverySourceError('DELIVERY_MAINLINE_UNKNOWN', '远端尚未指定可用的默认分支', '在远端仓库设置并推送默认主分支后重试');
  try {
    await git(root, ['check-ref-format', `refs/heads/${branch}`]);
    await git(root, ['fetch', '--quiet', '--no-tags', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  } catch {
    throw new DeliverySourceError('DELIVERY_MAINLINE_UNAVAILABLE', '无法刷新远端主分支', '恢复 origin 访问后重试', { branch });
  }
  const mainlineCommit = await git(root, ['rev-parse', `refs/remotes/origin/${branch}`]);
  const currentBranch = await git(root, ['branch', '--show-current']);
  if (currentBranch !== branch) {
    throw new DeliverySourceError('DELIVERY_MAINLINE_CHECKOUT_REQUIRED', `请从远端默认主分支 ${branch} 发布`, '将本轮任务分支合入并推送主分支，然后在干净的主分支工作区发布；不要切换其他任务正在编辑的目录', { branch, currentBranch });
  }
  const commit = sourceCommit || currentCommit;
  if (!SHA.test(commit)) throw new DeliverySourceError('DELIVERY_SOURCE_COMMIT_INVALID', '发布来源不是合法的 Git 提交', '重新读取原测试部署引用的版本');
  try { await git(root, ['merge-base', '--is-ancestor', commit, `refs/remotes/origin/${branch}`]); }
  catch {
    throw new DeliverySourceError('DELIVERY_SOURCE_NOT_IN_MAINLINE', '发布来源尚未进入远端主分支', '先将源码合入并推送远端主分支；若已 squash/rebase，使用最终主线提交重新验证和冻结', { commit, branch });
  }
  if (!sourceCommit && currentCommit !== mainlineCommit) {
    throw new DeliverySourceError('DELIVERY_MAINLINE_BEHIND', '本地源码尚未包含远端主分支的最新改动', '在保留现有工作前提下同步主分支，并验证最终候选', { commit, mainlineCommit, branch });
  }
  return { repository, branch, commit, mainlineCommit };
}

/** 构建步骤不能改变被验证源码。平台切换并发仍由 DeploymentRun 管理。 */
export async function assertDeliverySourceUnchanged(root: string, source: PublishedDeliverySource) {
  const commit = await cleanCommit(root);
  const branch = await git(root, ['branch', '--show-current']);
  if (commit !== source.commit || branch !== source.branch) {
    throw new DeliverySourceError('DELIVERY_SOURCE_CHANGED', '准备发布期间源码或分支发生变化', '保留已有制品与日志，重新核对本轮候选；不要把旧验证用于新源码', { expectedCommit: source.commit, commit });
  }
}
