import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { discoverWorkspace, flagValue, readJson, resolveEngine } from './workspace.js';
import { distributionCommand } from './commands.js';
import { bootstrapSupport } from './support.js';

export async function launch(packageRoot, args = process.argv.slice(2)) {
  const manifest = readJson(join(packageRoot, 'package.json'));
  if (args[0] === 'support') {
    await distributionCommand({ manifest, packageRoot }, args);
    return;
  }
  const workspace = discoverWorkspace(flagValue(args, '--cwd') || (args[0] === 'skill' ? flagValue(args, '--workspace') : null) || process.cwd());
  // Launcher-only updates must also work when a project's dependencies are not yet installed.
  const launcherUpdate = args[0] === 'update' && flagValue(args, '--target') === 'launcher';
  const engine = resolveEngine(launcherUpdate ? null : workspace, packageRoot);
  const context = { manifest, packageRoot, workspace, engine };
  if (await distributionCommand(context, args)) return;
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write('统一分发命令：version、update check|install、changelog、migrate assess、support status|bootstrap|login|join。\nSkill 安装支持 --workspace、--destination 和 --agent；正文跟随项目版本。创建和技能刷新默认接入支持协作，离线/CI 可加 --skip-support。\n\n');
  }
  const env = { ...process.env };
  for (const key of ['OPENXIANGDA_DISTRIBUTION_NAME', 'OPENXIANGDA_DISTRIBUTION_VERSION', 'OPENXIANGDA_DOCUMENTATION_ROOT', 'OPENXIANGDA_SKILLS_ROOT']) delete env[key];
  if (engine.generation === 'v2') {
    env.OPENXIANGDA_DISTRIBUTION_NAME = 'openxiangda';
    env.OPENXIANGDA_DISTRIBUTION_VERSION = engine.version;
    env.OPENXIANGDA_DOCUMENTATION_ROOT = join(engine.packageRoot, 'documentation');
    if (existsSync(join(engine.packageRoot, 'skills'))) env.OPENXIANGDA_SKILLS_ROOT = join(engine.packageRoot, 'skills');
  }
  const initializes = args[0] === 'create' || args[0] === 'workspace' && args[1] === 'init' || args[0] === 'skill' && args[1] === 'bootstrap';
  const engineArgs = initializes ? args.filter(argument => argument !== '--skip-support') : args;
  const forwarded = engine.generation === 'v1' ? removeCwd(engineArgs) : engineArgs;
  const child = spawn(process.execPath, [engine.entry, ...forwarded], {
    cwd: engine.generation === 'v1' ? workspace?.root || process.cwd() : process.cwd(), env, stdio: 'inherit',
  });
  const signals = ['SIGINT', 'SIGTERM'];
  const handlers = signals.map(signal => () => child.kill(signal));
  signals.forEach((signal, i) => process.on(signal, handlers[i]));
  try {
    const { code, signal } = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143);
    if (code === 0 && initializes) {
      const support = await bootstrapSupport(packageRoot, args);
      if (support.state !== 'skipped') process.stderr.write(`${JSON.stringify({ operation: 'support bootstrap', data: support })}\n`);
    }
  } finally { signals.forEach((signal, i) => process.removeListener(signal, handlers[i])); }
}

function removeCwd(args) {
  const output = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd') i++;
    else if (!args[i].startsWith('--cwd=')) output.push(args[i]);
  }
  return output;
}
