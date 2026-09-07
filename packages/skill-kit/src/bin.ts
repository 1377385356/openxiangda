#!/usr/bin/env node
import { resolve } from 'node:path';
import { homedir } from 'node:os';
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
  const rootArgument = args.find(argument => !argument.startsWith('-'));
  const skillsRoot = resolve(process.cwd(), rootArgument || defaultSkillsRoot);
  const issues = await validateSkills(skillsRoot);
  if (issues.length) {
    for (const issue of issues) process.stderr.write(`${issue.skill}: ${issue.message} (${issue.file})\n`);
    process.exitCode = 1;
  } else {
    if (writeManifest) await writeSkillManifest(skillsRoot);
    process.stdout.write(`Validated ${skillsRoot}${writeManifest ? ' and wrote manifest' : ''}.\n`);
  }
}
