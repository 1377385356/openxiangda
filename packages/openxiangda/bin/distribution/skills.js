import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fail, flagValue, readJson } from './workspace.js';

export async function installDistributionSkills(context, args) {
  const workspace = flagValue(args, '--workspace');
  const destination = flagValue(args, '--destination') || flagValue(args, '--dest');
  const agent = flagValue(args, '--agent') || 'codex';
  if (!['codex', 'claude', 'qoder', 'dual'].includes(agent)) fail('DISTRIBUTION_SKILL_AGENT_INVALID', agent);
  const homes = { codex: process.env.CODEX_HOME || join(homedir(), '.codex'), claude: process.env.CLAUDE_HOME || join(homedir(), '.claude'), qoder: process.env.QODER_HOME || join(homedir(), '.qoder') };
  const destinations = destination ? [resolve(destination)] : workspace ? [resolve(workspace, '.agents/skills')] : (agent === 'dual' ? Object.values(homes) : [homes[agent]]).map(path => join(path, 'skills'));
  const staging = mkdtempSync(join(tmpdir(), 'openxiangda-skills-'));
  const source = join(staging, 'skills');
  try {
    const guidanceTemplate = workspace && context.engine.generation === 'v2' && !args.includes('--dry-run')
      ? readFileSync(join(context.engine.packageRoot, 'docs/AGENTS.md'), 'utf8') : undefined;
    if (context.engine.generation === 'v1') {
      const require = createRequire(join(context.engine.packageRoot, 'package.json'));
      const { installSkills } = require(join(context.engine.packageRoot, 'lib/skills.js'));
      installSkills({ agent: 'codex', dest: source, env: { ...process.env, CODEX_HOME: staging } });
      // Historical V1 packages named their root skill openxiangda. Preserve its content under V1 ownership.
      if (existsSync(join(source, 'openxiangda'))) {
        renameSync(join(source, 'openxiangda'), join(source, 'openxiangda-v1'));
        const file = join(source, 'openxiangda-v1/SKILL.md');
        writeFileSync(file, readFileSync(file, 'utf8').replace(/^name: openxiangda$/m, 'name: openxiangda-v1'));
      }
    } else {
      const { installSkills } = await importEngineModule(context.engine.packageRoot, 'openxiangda-skill-kit');
      await installSkills({ skillsRoot: join(context.engine.packageRoot, 'skills'), destination: source });
    }
    const router = join(source, 'openxiangda');
    cpSync(join(context.packageRoot, 'launcher-skill/openxiangda'), router, { recursive: true });
    const file = join(router, 'SKILL.md');
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__OPENXIANGDA_VERSION__', context.manifest.version));
    const names = readdirSync(source, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const dest of destinations) for (const name of names) {
      if (existsSync(join(dest, name)) && !args.includes('--force')) fail('SKILL_ALREADY_EXISTS', `${join(dest, name)}；使用 --force 显式替换`);
    }
    if (!args.includes('--dry-run')) for (const dest of destinations) installSet(source, dest, names);
    let guidance;
    if (workspace && context.engine.generation === 'v2' && !args.includes('--dry-run')) {
      const { refreshWorkspaceGuidance } = await importEngineModule(context.engine.packageRoot, 'openxiangda-skill-kit');
      guidance = refreshWorkspaceGuidance(resolve(workspace), guidanceTemplate);
    }
    return { destinations, installed: names, engineVersion: context.engine.version, generation: context.engine.generation, dryRun: args.includes('--dry-run'), ...(guidance ? { guidance } : {}) };
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

function importEngineModule(packageRoot, name) {
  const require = createRequire(join(packageRoot, 'package.json'));
  // These ESM packages do not expose package.json to require.resolve.
  // Resolve from this engine's dependency paths, never the launcher's imports.
  const file = require.resolve.paths(name).map(base => join(base, name, 'package.json')).find(existsSync);
  if (!file) fail('DISTRIBUTION_ENGINE_MODULE_MISSING', name);
  const manifest = readJson(file);
  const entry = manifest.exports?.['.']?.import || manifest.main;
  if (manifest.name !== name || typeof entry !== 'string' || !entry.startsWith('./') || !resolve(dirname(file), entry).startsWith(`${dirname(file)}/`)) fail('DISTRIBUTION_ENGINE_MODULE_INVALID', name);
  return import(pathToFileURL(resolve(dirname(file), entry)).href);
}

function installSet(source, destination, names) {
  mkdirSync(destination, { recursive: true });
  const transaction = mkdtempSync(join(destination, '.openxiangda-distribution-'));
  const installed = [], backups = [];
  try {
    for (const name of names) cpSync(join(source, name), join(transaction, 'next', name), { recursive: true });
    for (const name of names) {
      const target = join(destination, name), backup = join(transaction, 'previous', name);
      if (existsSync(target)) { mkdirSync(dirname(backup), { recursive: true }); renameSync(target, backup); backups.push({ target, backup }); }
      renameSync(join(transaction, 'next', name), target); installed.push(target);
    }
  } catch (error) {
    for (const target of installed.reverse()) rmSync(target, { recursive: true, force: true });
    for (const { target, backup } of backups.reverse()) renameSync(backup, target);
    throw error;
  } finally { rmSync(transaction, { recursive: true, force: true }); }
}
