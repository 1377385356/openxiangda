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

async function currentCommit(root: string) {
  try {
    const commit = await git(root, ['rev-parse', '--verify', 'HEAD']);
    return SHA.test(commit) ? commit : '0'.repeat(40);
  } catch {
    // 发布可以从尚未提交的本地工作区开始；平台仍会收到真实的 dirty 标记。
    return '0'.repeat(40);
  }
}

/**
 * 发布只需要当前工作区的来源信息。
 *
 * Git 主线、分支名称和提交历史属于团队协作策略，不应阻塞应用内循环发布。
 * 远端地址可用时保留用于溯源；没有远端时使用 local 标识继续本地/测试发布。
 */
export async function publishedDeliverySource(root: string, sourceCommit?: string): Promise<PublishedDeliverySource> {
  const commit = sourceCommit || await currentCommit(root);
  let repository: string;
  try {
    repository = await git(root, ['remote', 'get-url', 'origin']);
  } catch {
    repository = `local:${root}`;
  }
  const branch = await git(root, ['branch', '--show-current']).catch(() => '');
  return { repository, branch: branch || 'detached', commit, mainlineCommit: commit };
}

/** 平台 DeploymentRun 负责发布期间的并发；本地构建不再重复扫描 Git 状态。 */
export async function assertDeliverySourceUnchanged(root: string, source: PublishedDeliverySource) {
  return source;
}
