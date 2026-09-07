import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bundledRelease, compareVersions, registryMetadata, VERSION, GENERATION_CHANNEL } from './releases.js';
import { fail, flagValue, readJson } from './workspace.js';

export function updatePlan(context, args, metadata) {
  const target = flagValue(args, '--target') || (context.workspace ? 'workspace' : 'launcher');
  if (!['workspace', 'launcher'].includes(target)) fail('DISTRIBUTION_UPDATE_TARGET_INVALID', target);
  if (target === 'workspace' && !context.workspace) fail('DISTRIBUTION_WORKSPACE_REQUIRED', '请在项目中执行 workspace 升级');
  const generation = target === 'launcher' ? 'v2' : context.workspace.generation;
  if (!VERSION.test(metadata.version) || !metadata.version.startsWith(generation === 'v1' ? '1.' : '2.') || metadata.version.includes('-')) {
    fail('DISTRIBUTION_UPDATE_GENERATION_MISMATCH', `${generation} 稳定渠道返回了 ${metadata.version}`);
  }
  const currentVersion = target === 'launcher' ? context.manifest.version : context.engine.version;
  const plan = {
    target, generation, channel: GENERATION_CHANNEL[generation], currentVersion, version: metadata.version,
    updateAvailable: compareVersions(metadata.version, currentVersion) > 0,
    compatibility: metadata.engines || {}, release: metadata.openxiangdaRelease || { version: metadata.version, available: false },
    cwd: target === 'workspace' ? context.workspace.root : process.cwd(),
    command: 'npm', args: ['install', '--global', `openxiangda@${metadata.version}`],
  };
  if (target === 'workspace') {
    const manifestFile = join(context.workspace.root, 'package.json');
    if (!existsSync(manifestFile)) fail('DISTRIBUTION_PACKAGE_MANIFEST_REQUIRED', '项目缺少 package.json，不能自动决定依赖归属');
    const manifest = readJson(manifestFile);
    const locks = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].filter(file => existsSync(join(context.workspace.root, file)));
    if (locks.length > 1) fail('DISTRIBUTION_PACKAGE_MANAGER_CONFLICT', locks.join(', '));
    const manager = manifest.packageManager?.split('@')[0] || ({ 'pnpm-lock.yaml': 'pnpm', 'package-lock.json': 'npm', 'yarn.lock': 'yarn' }[locks[0]]) || 'npm';
    if (!['npm', 'pnpm', 'yarn'].includes(manager)) fail('DISTRIBUTION_PACKAGE_MANAGER_UNSUPPORTED', manager);
    const dependency = manifest.dependencies?.openxiangda;
    const spec = `openxiangda@${metadata.version}`;
    plan.command = manager;
    plan.args = manager === 'npm' ? ['install', dependency ? '--save-prod' : '--save-dev', '--save-exact', spec]
      : ['add', ...(dependency ? [] : ['--dev']), '--exact', spec, ...(manager === 'pnpm' && existsSync(join(context.workspace.root, 'pnpm-workspace.yaml')) ? ['--workspace-root'] : [])];
    if (manager === 'pnpm' && existsSync(join(context.workspace.root, 'pnpm-workspace.yaml'))) {
      plan.args = ['--recursive', '--include-workspace-root', 'update', '--save-exact', spec];
    }
  }
  const registry = flagValue(args, '--registry') || 'https://registry.npmjs.org';
  plan.args.push(`--registry=${registry}`);
  return plan;
}

export function update(context, args) {
  const action = args[1] && !args[1].startsWith('-') ? args[1] : 'check';
  if (!['check', 'install'].includes(action)) fail('DISTRIBUTION_UPDATE_ACTION_INVALID', action);
  const target = flagValue(args, '--target') || (context.workspace ? 'workspace' : 'launcher');
  if (!['workspace', 'launcher'].includes(target)) fail('DISTRIBUTION_UPDATE_TARGET_INVALID', target);
  if (target === 'workspace' && !context.workspace) fail('DISTRIBUTION_WORKSPACE_REQUIRED', '请在项目中执行 workspace 升级');
  const channel = GENERATION_CHANNEL[target === 'launcher' ? 'v2' : context.workspace?.generation || 'v2'];
  let metadata;
  try { metadata = registryMetadata(channel, flagValue(args, '--registry')); }
  catch (error) {
    if (action === 'install') throw error;
    return { status: 'offline', target, channel, error: { code: error.code, message: error.message }, release: bundledRelease(context.engine.packageRoot, context.engine.version) };
  }
  const plan = updatePlan(context, args, metadata);
  if (action === 'check' || args.includes('--dry-run')) return { status: 'checked', ...plan, executed: false };
  if (!plan.updateAvailable) return { status: 'current', ...plan, executed: false };
  const requirement = metadata.engines?.node;
  // Published stable distributions use a lower-bound Node contract; reject unknown expressions instead of guessing.
  if (requirement && !/^>=\d+(?:\.\d+){0,2}$/.test(requirement)) fail('DISTRIBUTION_NODE_REQUIREMENT_UNSUPPORTED', requirement);
  if (requirement && compareVersions(process.versions.node, requirement.slice(2).split('.').concat(['0', '0']).slice(0, 3).join('.')) < 0) fail('DISTRIBUTION_NODE_VERSION_REQUIRED', `目标版本需要 Node.js ${requirement}`);
  const result = spawnSync(plan.command, plan.args, { cwd: plan.cwd, stdio: args.includes('--json') ? ['inherit', 'pipe', 'pipe'] : 'inherit', timeout: 600000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) fail('DISTRIBUTION_UPDATE_INSTALL_FAILED', '包管理器未完成升级；保留项目与锁文件现场，请检查后使用原计划恢复');
  return { status: 'installed', ...plan, executed: true, next: plan.target === 'workspace' ? '按项目说明执行 check 和业务验收；需要刷新 Skill 时显式运行 skill install。' : '重新运行 openxiangda version --json 核对入口和项目引擎。' };
}
