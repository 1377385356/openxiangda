import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { cloneSourceGit, initializeSourceGit, installSourceCredential, pushSourceGit } from '../src/source-git.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oxa-source-'));
  const workspace = join(root, 'app'); mkdirSync(workspace);
  const remote = join(root, 'remote.git');
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { stdio: 'ignore' });
  const repository = { provider: 'forgejo' as const, repositoryId: '1', repositoryName: 'app-1', cloneUrl: remote, webUrl: remote, defaultBranch: 'main' };
  const identity = { name: 'Source Test', email: 'source@example.invalid' };
  const git = (...args: string[]) => execFileSync('git', ['-C', workspace, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { root, workspace, remote, repository, identity, git, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('initializes and retries the same repository, excluding ignored credentials', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.workspace, '.gitignore'), '.env\n');
    writeFileSync(join(f.workspace, '.env'), 'SECRET=not-for-git');
    writeFileSync(join(f.workspace, 'app.ts'), 'export const app = true;');
    initializeSourceGit(f.workspace, f.repository, f.identity);
    const first = pushSourceGit(f.workspace, f.repository, 'Initialize');
    initializeSourceGit(f.workspace, f.repository, f.identity);
    assert.equal(pushSourceGit(f.workspace, f.repository, 'Initialize').commit, first.commit);
    assert.equal(f.git('ls-files', '.env'), '');
    assert.equal(f.git('remote', 'get-url', 'origin'), f.remote);
  } finally { f.cleanup(); }
});

test('preserves an external origin unless import is explicit', () => {
  const f = fixture();
  try {
    f.git('init', '-b', 'main'); f.git('remote', 'add', 'origin', 'https://external.example/app.git');
    assert.throws(() => initializeSourceGit(f.workspace, f.repository, f.identity), /ORIGIN_CONFLICT/);
    assert.equal(f.git('remote', 'get-url', 'origin'), 'https://external.example/app.git');
    initializeSourceGit(f.workspace, f.repository, f.identity, true);
    assert.equal(f.git('remote', 'get-url', 'external-source'), 'https://external.example/app.git');
  } finally { f.cleanup(); }
});

test('rejects divergent pushes while retaining both contributors commits', () => {
  const f = fixture();
  try {
    initializeSourceGit(f.workspace, f.repository, f.identity);
    writeFileSync(join(f.workspace, 'app.ts'), 'first'); pushSourceGit(f.workspace, f.repository, 'first');
    const other = join(f.root, 'other');
    execFileSync('git', ['clone', f.remote, other], { stdio: 'ignore' });
    initializeSourceGit(other, f.repository, f.identity);
    writeFileSync(join(other, 'other.ts'), 'other'); const pushed = pushSourceGit(other, f.repository, 'other');
    writeFileSync(join(f.workspace, 'local.ts'), 'local');
    assert.throws(() => pushSourceGit(f.workspace, f.repository, 'local'), /GIT_FAILED/);
    assert.equal(readFileSync(join(f.workspace, 'local.ts'), 'utf8'), 'local');
    assert.equal(f.git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0], pushed.commit);
    assert.notEqual(f.git('rev-parse', 'HEAD'), pushed.commit);
  } finally { f.cleanup(); }
});

test('rejects credential protocol injection before calling a helper', () => {
  const f = fixture();
  try {
    assert.throws(() => installSourceCredential(f.workspace, {
      ...f.identity, repository: { ...f.repository, cloneUrl: 'https://git.example/app.git' },
      username: 'user\npassword=wrong', password: 'secret',
    }), /CREDENTIAL_INVALID/);
  } finally { f.cleanup(); }
});

test('setup retries leave existing uncommitted work untouched', () => {
  const f = fixture();
  try {
    initializeSourceGit(f.workspace, f.repository, f.identity);
    writeFileSync(join(f.workspace, 'app.ts'), 'first');
    const first = pushSourceGit(f.workspace, f.repository, 'Initialize', true);
    writeFileSync(join(f.workspace, 'app.ts'), 'work in progress');
    const retry = pushSourceGit(f.workspace, f.repository, 'Initialize', true);
    assert.equal(retry.commit, first.commit);
    assert.equal(retry.dirty, true);
    assert.equal(readFileSync(join(f.workspace, 'app.ts'), 'utf8'), 'work in progress');
  } finally { f.cleanup(); }
});

test('stores and verifies credentials through the native helper without a plaintext helper chain', { skip: process.platform !== 'darwin' }, () => {
  const f = fixture();
  const previous = process.env.GIT_EXEC_PATH;
  try {
    initializeSourceGit(f.workspace, f.repository, f.identity);
    const helpers = join(f.root, 'helpers'); mkdirSync(helpers);
    const storage = join(f.root, 'test-helper-store');
    const executable = join(helpers, 'git-credential-osxkeychain');
    writeFileSync(executable, '#!/bin/sh\ncase "$1" in\nstore) cat > "' + storage + '" ;;\nget) cat "' + storage + '" ;;\nesac\n');
    chmodSync(executable, 0o700);
    process.env.GIT_EXEC_PATH = helpers;
    const password = 'test-only-native-helper-password';
    installSourceCredential(f.workspace, { ...f.identity, username: 'source-user', password,
      repository: { ...f.repository, cloneUrl: 'https://git.example.test/source/app.git' } });
    assert.ok(readFileSync(storage, 'utf8').includes(`password=${password}`));
    const config = readFileSync(join(f.workspace, '.git/config'), 'utf8');
    assert.ok(!config.includes(password));
    assert.ok(config.includes('helper = \n') && config.includes('helper = osxkeychain'));
  } finally {
    if (previous === undefined) delete process.env.GIT_EXEC_PATH; else process.env.GIT_EXEC_PATH = previous;
    f.cleanup();
  }
});

test('clones the requested branch without installing dependencies, executing scripts, hooks or filters', { skip: process.platform !== 'darwin' }, () => {
  const f = fixture();
  const previousExec = process.env.GIT_EXEC_PATH;
  const previousGlobal = process.env.GIT_CONFIG_GLOBAL;
  try {
    initializeSourceGit(f.workspace, f.repository, f.identity);
    const marker = join(f.root, 'must-not-execute');
    writeFileSync(join(f.workspace, 'package.json'), JSON.stringify({ scripts: { prepare: `touch ${marker}` } }));
    writeFileSync(join(f.workspace, '.gitattributes'), '*.txt filter=bomb\n');
    writeFileSync(join(f.workspace, 'readme.txt'), 'source');
    const initial = pushSourceGit(f.workspace, f.repository, 'Initial');
    f.git('push', 'origin', 'HEAD:refs/heads/support/review');
    const helpers = join(f.root, 'helpers'); mkdirSync(helpers);
    const storage = join(f.root, 'test-helper-store');
    const executable = join(helpers, 'git-credential-osxkeychain');
    writeFileSync(executable, '#!/bin/sh\ncase "$1" in\nstore) cat > "' + storage + '" ;;\nget) cat "' + storage + '" ;;\nesac\n');
    chmodSync(executable, 0o700);
    const config = join(f.root, 'gitconfig');
    const hooks = join(f.root, 'hooks'); mkdirSync(hooks);
    writeFileSync(join(hooks, 'post-checkout'), `#!/bin/sh\ntouch ${marker}\n`);
    chmodSync(join(hooks, 'post-checkout'), 0o700);
    writeFileSync(config, `[url "${f.remote}"]\n insteadOf = https://git.example.test/app.git\n[core]\n hooksPath = ${hooks}\n[filter "bomb"]\n smudge = touch ${marker}\n`);
    process.env.GIT_EXEC_PATH = helpers;
    process.env.GIT_CONFIG_GLOBAL = config;
    const target = join(f.root, 'cloned');
    const result = cloneSourceGit(target, { ...f.identity, username: 'source-test', password: 'fixture-password',
      repository: { ...f.repository, cloneUrl: 'https://git.example.test/app.git' } }, 'support/review');
    assert.equal(result.commit, initial.commit);
    assert.equal(result.branch, 'support/review');
    assert.equal(readFileSync(join(target, 'readme.txt'), 'utf8'), 'source');
    assert.equal(existsSync(marker), false);
    assert.equal(existsSync(join(target, 'node_modules')), false);
    assert.throws(() => cloneSourceGit(target, { ...f.identity, username: 'u', password: 'p', repository: f.repository }), /TARGET_EXISTS/);
  } finally {
    if (previousExec === undefined) delete process.env.GIT_EXEC_PATH; else process.env.GIT_EXEC_PATH = previousExec;
    if (previousGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previousGlobal;
    f.cleanup();
  }
});
