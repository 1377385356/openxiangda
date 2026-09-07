#!/usr/bin/env node
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import {
  installSkills,
  resolveDefaultSkillsRoot,
  validateSkills,
  writeSkillManifest,
} from './index.js';

const args = process.argv.slice(2);
const command = args[0] === 'install' || args[0] === 'validate' ? args.shift() : 'validate';
const writeManifest = args.includes('--write-manifest');
const force = args.includes('--force');
const optionValue = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const defaultSkillsRoot = resolveDefaultSkillsRoot();

if (command === 'install') {
  const skillsRoot = resolve(optionValue('--source') || defaultSkillsRoot);
  const destination = resolve(
    optionValue('--dest') || process.env.CODEX_HOME || resolve(homedir(), '.codex'),
    optionValue('--dest') ? '' : 'skills'
  );
  const result = await installSkills({ skillsRoot, destination, force });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const rootArgument = args.find((argument, index) => !argument.startsWith('-') && args[index - 1] !== '--distribution-commands');
  const skillsRoot = resolve(process.cwd(), rootArgument || defaultSkillsRoot);
  const metadataFile = optionValue('--distribution-commands');
  const metadata = metadataFile ? JSON.parse(await readFile(resolve(metadataFile), 'utf8')) : null;
  if (metadata && (metadata.schemaVersion !== 'openxiangda.distribution-commands/v1' || !Array.isArray(metadata.commands) || metadata.commands.some((command: unknown) => typeof command !== 'string' || !/^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/.test(command)))) throw new Error('DISTRIBUTION_COMMAND_METADATA_INVALID');
  const issues = await validateSkills(skillsRoot, { distributionCommandIds: metadata?.commands });
  if (issues.length) {
    for (const issue of issues) process.stderr.write(`${issue.skill}: ${issue.message} (${issue.file})\n`);
    process.exitCode = 1;
  } else {
    if (writeManifest) await writeSkillManifest(skillsRoot);
    process.stdout.write(`Validated ${skillsRoot}${writeManifest ? ' and wrote manifest' : ''}.\n`);
  }
}
