import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// P2（方案 2026-09-13 …第八节）：把发布准备的人工序列收敛为一条命令。
// 前置：changeset 与发布说明 JSON 已提交并推送、工作区干净。
// 执行：物化版本 → 提交物化 diff → 推送 master → 打印发布触发命令。
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.status !== 0) {
    process.stderr.write(`release:prepare 失败：${command} ${args.join(' ')} 退出码 ${result.status}\n`);
    process.exit(result.status ?? 1);
  }
  return result;
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 失败：${result.stderr || result.stdout}`);
  return String(result.stdout).trim();
}

const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'master') {
  process.stderr.write(`release:prepare 只在 master 上执行（当前 ${branch}）。\n`);
  process.exit(1);
}
const dirty = capture('git', ['status', '--porcelain']);
if (dirty) {
  process.stderr.write('工作区不干净：先提交并推送 changeset 与发布说明 JSON，再运行 release:prepare。\n');
  process.exit(1);
}
run('git', ['fetch', 'origin', 'master']);
const head = capture('git', ['rev-parse', 'HEAD']);
const origin = capture('git', ['rev-parse', 'origin/master']);
if (head !== origin) {
  process.stderr.write('本地 master 与 origin/master 不一致：先推送或拉齐再运行 release:prepare。\n');
  process.exit(1);
}

const before = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/openxiangda/package.json'), 'utf8')).version;
run('pnpm', ['release:version']);
const changed = capture('git', ['status', '--porcelain']);
if (!changed) {
  process.stdout.write('没有待物化的 changeset；无需发布准备。\n');
  process.exit(0);
}
const after = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/openxiangda/package.json'), 'utf8')).version;
run('git', ['add', '-A']);
run('git', ['commit', '-m', `chore: release openxiangda ${after}`]);
run('git', ['push', 'origin', 'master']);
process.stdout.write(
  `已物化并推送 openxiangda ${before} → ${after}。触发发布：\n` +
    '  gh workflow run release.yml --repo 1377385356/openxiangda --ref master\n'
);
