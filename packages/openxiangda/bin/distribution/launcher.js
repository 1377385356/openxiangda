import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { discoverWorkspace, flagValue, readJson, resolveEngine } from './workspace.js';
import { distributionCommand } from './commands.js';

export async function launch(packageRoot, args = process.argv.slice(2)) {
  const manifest = readJson(join(packageRoot, 'package.json'));
  const workspace = discoverWorkspace(flagValue(args, '--cwd') || (args[0] === 'skill' ? flagValue(args, '--workspace') : null) || process.cwd());
  // Launcher-only updates must also work when a project's dependencies are not yet installed.
  const launcherUpdate = args[0] === 'update' && flagValue(args, '--target') === 'launcher';
  const engine = resolveEngine(launcherUpdate ? null : workspace, packageRoot);
  const context = { manifest, packageRoot, workspace, engine };
  if (await distributionCommand(context, args)) return;
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write('统一分发命令：version、update check|install、changelog、migrate assess。\nSkill 安装支持 --workspace、--destination 和 --agent；正文跟随项目版本。\n\n');
  }
  const env = { ...process.env };
  for (const key of ['OPENXIANGDA_DISTRIBUTION_NAME', 'OPENXIANGDA_DISTRIBUTION_VERSION', 'OPENXIANGDA_DOCUMENTATION_ROOT', 'OPENXIANGDA_SKILLS_ROOT']) delete env[key];
  if (engine.generation === 'v2') {
    env.OPENXIANGDA_DISTRIBUTION_NAME = 'openxiangda';
    env.OPENXIANGDA_DISTRIBUTION_VERSION = engine.version;
    env.OPENXIANGDA_DOCUMENTATION_ROOT = join(engine.packageRoot, 'documentation');
    if (existsSync(join(engine.packageRoot, 'skills'))) env.OPENXIANGDA_SKILLS_ROOT = join(engine.packageRoot, 'skills');
  }
  const forwarded = engine.generation === 'v1' ? removeCwd(args) : args;
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
