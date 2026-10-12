import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { collectWorkspaceToolchainDependencies, toolchainCapsuleMismatches, createToolchainCapsule } from '../src/toolchain-capsule.js';

function manifest(root: string, file: string, value: object) {
  const path = join(root, file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value));
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oxa-input-'));
  manifest(root, 'package.json', { workspaces: ['apps/*', 'packages/*', '!packages/excluded'] });
  manifest(root, 'apps/web/package.json', { dependencies: { openxiangda: '2.66.0' } });
  manifest(root, '.local/history/package.json', { dependencies: { openxiangda: '^1.0.0' } });
  manifest(root, 'packages/excluded/package.json', { dependencies: { openxiangda: '^2.0.0' } });
  return root;
}
test('checks declared packages while preserving unselected operational history', () => {
  const root = fixture();
  try {
    assert.deepEqual(collectWorkspaceToolchainDependencies(root).map(d => d.packageFile), ['apps/web/package.json']);
    assert.deepEqual(toolchainCapsuleMismatches(collectWorkspaceToolchainDependencies(root), createToolchainCapsule({ openxiangda: '2.66.0' })), []);
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - .local/*\n');
    assert.equal(collectWorkspaceToolchainDependencies(root).length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('checks local dependency closure even when outside workspace patterns and handles cycles', () => {
  const root = fixture();
  try {
    manifest(root, 'apps/web/package.json', { dependencies: { helper: 'link:../../.local/history' } });
    manifest(root, '.local/history/package.json', { dependencies: { openxiangda: '^2.0.0', web: 'file:../../apps/web' } });
    assert.equal(collectWorkspaceToolchainDependencies(root)[0]?.specifier, '^2.0.0');
    manifest(root, 'apps/web/package.json', { dependencies: { helper: 'link:../../../outside' } });
    assert.throws(() => collectWorkspaceToolchainDependencies(root), /本地依赖缺失或越界/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('includes actual custom Docker context and honors Dockerfile-specific ignore', () => {
  const root = fixture();
  try {
    mkdirSync(join(root, 'apps/server'), { recursive: true });
    writeFileSync(join(root, 'apps/server/Dockerfile'), 'FROM docker.xuanyuan.run/node:22-alpine\nCOPY . /app\n');
    writeFileSync(join(root, '.dockerignore'), '.local\n');
    const options = { dockerfile: join(root, 'apps/server/Dockerfile') };
    assert.equal(collectWorkspaceToolchainDependencies(root, options).some(d => d.packageFile.startsWith('.local/')), false);
    writeFileSync(join(root, 'apps/server/Dockerfile.dockerignore'), 'node_modules\n');
    assert.equal(collectWorkspaceToolchainDependencies(root, options).some(d => d.packageFile.startsWith('.local/')), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('rejects malformed declarations and escaping declared package symlinks', () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'oxa-outside-'));
  try {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: [apps/*\n');
    assert.throws(() => collectWorkspaceToolchainDependencies(root), /无法解析/);
    rmSync(join(root, 'pnpm-workspace.yaml'));
    symlinkSync(outside, join(root, 'packages/escape'), 'dir');
    assert.throws(() => collectWorkspaceToolchainDependencies(root), /工作区链接越界/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
