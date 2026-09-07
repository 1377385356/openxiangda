import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { refreshWorkspaceGuidance } from '../src/workspace-guidance.js';

const block = '<!-- OPENXIANGDA:BEGIN -->\n中文平台规则\n<!-- OPENXIANGDA:END -->';
test('refresh updates only managed bytes and is idempotent', t => {
  const root = mkdtempSync(join(tmpdir(), 'ox-guidance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'AGENTS.md'), '# 自定义前言\n' + block.replace('中文平台规则', '旧规则') + '\n## 项目规则\n保留我\n');
  assert.equal(refreshWorkspaceGuidance(root, block).state, 'updated');
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), '# 自定义前言\n' + block + '\n## 项目规则\n保留我\n');
  assert.equal(refreshWorkspaceGuidance(root, block).state, 'unchanged');
});
test('unmarked legacy guidance is preserved and each new template gets a review candidate', t => {
  const root = mkdtempSync(join(tmpdir(), 'ox-guidance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'AGENTS.md'), '# 自定义全部内容\n');
  const first = refreshWorkspaceGuidance(root, block);
  assert.equal(first.state, 'review-required');
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), '# 自定义全部内容\n');
  assert.ok(first.candidate && existsSync(first.candidate));
  const second = refreshWorkspaceGuidance(root, block.replace('中文平台规则', '新版本规则'));
  assert.notEqual(first.candidate, second.candidate);
});
test('rejects ambiguous markers without overwriting files or retaining its lock', t => {
  const root = mkdtempSync(join(tmpdir(), 'ox-guidance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'AGENTS.md'), block + '\n' + block);
  assert.throws(() => refreshWorkspaceGuidance(root, block), /MARKERS_INVALID/);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), block + '\n' + block);
  assert.equal(existsSync(join(root, '.openxiangda/guidance.lock')), false);
});
