import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ApplicationSourceCredential, ApplicationSourceRepository } from 'openxiangda-contracts';

function run(root: string, args: string[], input?: string, optional = false): string {
  const result = spawnSync('git', args, {
    cwd: root, encoding: 'utf8', input, timeout: 120_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.status !== 0 && !optional) {
    // Credential helpers may echo their input on failure; never relay their output.
    const detail = input ? '' : String(result.stderr || result.stdout || '').trim();
    throw new Error(`APPLICATION_SOURCE_GIT_FAILED: git ${args[0]} ${detail}`);
  }
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

export function installSourceCredential(root: string, credential: ApplicationSourceCredential): void {
  const url = new URL(credential.repository.cloneUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      /[\r\n\0]/.test(`${credential.username}${credential.password}`)) {
    throw new Error('APPLICATION_SOURCE_CREDENTIAL_INVALID');
  }
  // Override helper chains for this Git server so a global plaintext helper cannot
  // receive the password. Other hosts keep their existing Git configuration.
  const helpers = run(root, ['config', '--get-all', 'credential.helper'], undefined, true).split('\n');
  const helper = process.platform === 'darwin' ? 'osxkeychain'
    : process.platform === 'win32' ? 'manager'
    : helpers.find(value => /^(manager(?:-core)?|libsecret|\/[^\s]*git-credential-libsecret)$/.test(value));
  if (!helper) throw new Error('APPLICATION_SOURCE_CREDENTIAL_HELPER_REQUIRED: 请安装 Git Credential Manager 或 git-credential-libsecret 后重试');
  const key = `credential.${url.origin}.helper`;
  run(root, ['config', '--local', '--replace-all', key, '']);
  run(root, ['config', '--local', '--add', key, helper]);
  run(root, ['config', '--local', `credential.${url.origin}.useHttpPath`, 'true']);
  run(root, ['credential', 'approve'],
    `protocol=${url.protocol.slice(0, -1)}\nhost=${url.host}\npath=${url.pathname.slice(1)}\nusername=${credential.username}\npassword=${credential.password}\n\n`);
  const stored = run(root, ['credential', 'fill'],
    `protocol=${url.protocol.slice(0, -1)}\nhost=${url.host}\npath=${url.pathname.slice(1)}\nusername=${credential.username}\n\n`);
  if (!stored.split('\n').includes(`password=${credential.password}`)) {
    throw new Error('APPLICATION_SOURCE_CREDENTIAL_NOT_STORED: 系统凭据管理器未保存凭据');
  }
}

export function initializeSourceGit(root: string, repository: ApplicationSourceRepository,
  identity: { name: string; email: string }, importOrigin = false): void {
  root = resolve(root);
  if (!existsSync(join(root, '.git'))) {
    if (run(root, ['rev-parse', '--show-toplevel'], undefined, true)) {
      throw new Error('APPLICATION_SOURCE_NESTED_REPOSITORY: 应用目录不能隐式修改父仓库');
    }
    run(root, ['init', '-b', repository.defaultBranch]);
  }
  const origin = run(root, ['remote', 'get-url', 'origin'], undefined, true);
  if (origin && origin !== repository.cloneUrl) {
    if (!importOrigin) throw new Error('APPLICATION_SOURCE_ORIGIN_CONFLICT: 使用 source setup --import 将原远端保留为 external-source');
    if (run(root, ['remote', 'get-url', 'external-source'], undefined, true)) throw new Error('APPLICATION_SOURCE_IMPORT_REMOTE_EXISTS');
    run(root, ['remote', 'rename', 'origin', 'external-source']);
  }
  if (!origin || origin !== repository.cloneUrl) run(root, ['remote', 'add', 'origin', repository.cloneUrl]);
  run(root, ['config', '--local', 'user.name', identity.name]);
  run(root, ['config', '--local', 'user.email', identity.email]);
}

export function pushSourceGit(root: string, repository: ApplicationSourceRepository, message?: string, onlyInitial = false) {
  if (run(root, ['remote', 'get-url', 'origin']) !== repository.cloneUrl) throw new Error('APPLICATION_SOURCE_ORIGIN_CONFLICT');
  const branch = run(root, ['symbolic-ref', '--short', 'HEAD']);
  if (message && (!onlyInitial || !run(root, ['rev-parse', '--verify', 'HEAD'], undefined, true))) {
    run(root, ['add', '--all']);
    if (run(root, ['status', '--porcelain'])) run(root, ['commit', '-m', message]);
  }
  const commit = run(root, ['rev-parse', 'HEAD']);
  run(root, ['push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`]);
  const remote = run(root, ['ls-remote', 'origin', `refs/heads/${branch}`]).split(/\s/)[0];
  if (remote !== commit) throw new Error('APPLICATION_SOURCE_PUSH_NOT_CONFIRMED');
  return { repository: repository.cloneUrl, commit, branch, dirty: Boolean(run(root, ['status', '--porcelain'])) };
}
