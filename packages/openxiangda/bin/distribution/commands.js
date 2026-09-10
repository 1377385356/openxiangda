import { bundledRelease, registryMetadata, VERSION } from './releases.js';
import { flagValue, fail } from './workspace.js';
import { update } from './update.js';
import { assessMigration } from './migrate.js';
import { installDistributionSkills } from './skills.js';
import { supportOperation } from './support.js';
import { migrationAdvice, printMigrationAdvice } from './migration-advice.js';

export async function distributionCommand(context, args) {
  const command = args[0];
  const skillInstall = command === 'skill' && args[1] === 'install';
  if (!['version', 'update', 'changelog', 'migrate', 'support'].includes(command) && !skillInstall) return false;
  validateArguments(command, args.slice(1));
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('openxiangda version [--json]\nopenxiangda update check|install [--target workspace|launcher] [--dry-run] [--json]\nopenxiangda changelog [version] [--json]\nopenxiangda migrate assess --to v2 [--json]\nopenxiangda skill install [--workspace <directory> | --destination <directory>] [--agent codex|claude|qoder|dual] [--force] [--dry-run] [--skip-support]\nopenxiangda support status|bootstrap|login|join [--profile <corpId:userId>] [--agent <DWS agent>] [--device] [--force] [--dry-run] [--json]\n以上命令支持 --cwd <directory>。新应用默认 V2，项目升级保持原代际。支持接入等待用户操作时不阻塞应用创建。\n');
    return true;
  }
  let data;
  if (command === 'support') data = await supportOperation(context.packageRoot, args);
  if (skillInstall) data = await installDistributionSkills(context, args);
  if (command === 'version') data = {
    productVersion: context.manifest.version,
    workspace: context.workspace,
    engine: { version: context.engine.version, generation: context.engine.generation, source: context.engine.source, packageRoot: context.engine.packageRoot, declaredVersion: context.engine.declaredVersion },
    nodeVersion: process.versions.node,
  };
  if (command === 'update') data = update(context, args);
  if (command === 'migrate') data = assessMigration(context, args);
  if (command === 'changelog') {
    const requested = args[1] && !args[1].startsWith('-') ? args[1] : context.engine.version;
    if (!VERSION.test(requested)) fail('DISTRIBUTION_VERSION_INVALID', requested);
    data = bundledRelease(context.engine.packageRoot, requested);
    if (data.available === false && requested !== context.engine.version) {
      const manifest = registryMetadata(requested, flagValue(args, '--registry'));
      data = manifest.openxiangdaRelease || data;
    }
  }
  const advice = ['version', 'update'].includes(command) || skillInstall ? migrationAdvice(context) : undefined;
  if (advice) data = { ...data, migrationAdvice: advice };
  const result = { schemaVersion: skillInstall ? 'openxiangda.cli-result/v2' : 'openxiangda.distribution/v1', ok: true, operation: skillInstall ? 'skill install' : command, data };
  process.stdout.write(`${args.includes('--json') ? JSON.stringify(result) : JSON.stringify(data, null, 2)}\n`);
  if (advice && !args.includes('--json')) printMigrationAdvice(advice);
  return true;
}

function validateArguments(command, args) {
  const booleans = new Set(['--json', '--help', '-h', ...(command === 'skill' ? ['--force', '--dry-run', '--skip-support'] : command === 'support' ? ['--force', '--dry-run', '--device'] : command === 'update' ? ['--dry-run'] : [])]);
  const values = new Set(['--cwd', ...({ update: ['--target', '--registry'], changelog: ['--registry'], migrate: ['--to'], skill: ['--workspace', '--destination', '--dest', '--agent'], support: ['--profile', '--agent'] }[command] || [])]);
  const seen = new Set(); let positionals = 0;
  for (let i = 0; i < args.length; i++) {
    const argument = args[i], key = argument.split('=')[0];
    if (!argument.startsWith('-')) { positionals++; continue; }
    if (seen.has(key)) fail('DISTRIBUTION_ARGUMENT_INVALID', `重复参数 ${key}`);
    seen.add(key);
    if (booleans.has(argument)) continue;
    if (!values.has(key)) fail('DISTRIBUTION_ARGUMENT_INVALID', argument);
    if (argument.includes('=')) { if (!argument.slice(key.length + 1)) fail('DISTRIBUTION_ARGUMENT_REQUIRED', key); }
    else if (!args[++i] || args[i].startsWith('-')) fail('DISTRIBUTION_ARGUMENT_REQUIRED', key);
  }
  if (positionals > (command === 'version' ? 0 : 1)) fail('DISTRIBUTION_ARGUMENT_INVALID', '多余的位置参数');
}
