import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import {
  DEVKIT_COMMANDS,
  DOCUMENTATION_TOPICS,
  documentationReferenceFile,
  renderDevkitCommandReference,
} from 'openxiangda-devkit-core';
import { installSkillTransaction } from './internal/skill-installer.js';

export interface SkillValidationIssue {
  skill: string;
  file: string;
  message: string;
}

export interface SkillManifestEntry {
  name: string;
  description: string;
  sha256: string;
}

export interface SkillManifest {
  schemaVersion: 1;
  skills: SkillManifestEntry[];
}

export interface InstallSkillsInput {
  skillsRoot: string;
  destination: string;
  force?: boolean;
}

export const OPENXIANGDA_SKILL_NAME = 'openxiangda-v2';
export const RETIRED_OPENXIANGDA_V2_SKILL_NAMES = [
  'openxiangda-v2-architecture',
  'openxiangda-v2-backend',
  'openxiangda-v2-data-authz',
  'openxiangda-v2-delivery',
  'openxiangda-v2-frontend',
  'openxiangda-v2-workflow-events',
] as const;
export function resolveDefaultSkillsRoot() {
  const explicit = String(process.env.OPENXIANGDA_SKILLS_ROOT || '').trim();
  if (explicit) return resolve(explicit);
  const packaged = resolve(import.meta.dirname, '../skills');
  const development = resolve(import.meta.dirname, '../../../skills');
  return existsSync(packaged) ? packaged : development;
}

interface LoadedSkill {
  directory: string;
  file: string;
  source: string;
  name: string;
  description: string;
}

const FORBIDDEN_V2_TERMS = [
  /\bApp Function\b/i,
  /\bJS_CODE\b/i,
  /\bresource publish\b/i,
  /\bworkflow v3\b/i,
  /\bRoleSession\b/i,
  /\bcreate-openxiangda\b/i,
  /\bopenxiangda-(?:admin|compiler|field-kit|testing|user|workflow)\b/i,
];

const knownCommandIds = new Set<string>(DEVKIT_COMMANDS.map(command => command.id));
const REQUIRED_REFERENCES = DOCUMENTATION_TOPICS.map(topic => documentationReferenceFile(topic.id));

export async function validateSkills(skillsRoot: string): Promise<SkillValidationIssue[]> {
  const skills = await loadSkills(skillsRoot);
  const knownSkills = new Set(skills.map(skill => skill.name));
  const issues: SkillValidationIssue[] = [];

  if (skills.length !== 1 || skills[0]?.name !== OPENXIANGDA_SKILL_NAME) {
    issues.push({
      skill: OPENXIANGDA_SKILL_NAME,
      file: skillsRoot,
      message: `Skill distribution must contain only ${OPENXIANGDA_SKILL_NAME}.`,
    });
  }

  for (const skill of skills) {
    const add = (message: string, file = skill.file) =>
      issues.push({ skill: skill.name || skill.directory, file, message });

    if (!skill.name) add('SKILL.md frontmatter must declare name.');
    if (skill.name !== skill.directory) add('Skill directory and frontmatter name must match.');
    if (!skill.description || [...skill.description.trim()].length < 12) {
      add('Description must explain when the skill should be used.');
    }
    const referencesRoot = resolve(skillsRoot, skill.directory, 'references');
    for (const name of REQUIRED_REFERENCES) {
      const referenceFile = resolve(referencesRoot, name);
      if (!(await isFile(referenceFile))) {
        add(`Missing required nested reference: references/${name}`, referenceFile);
      }
    }
    const markdownFiles = [skill.file, ...(await markdownFilesBelow(referencesRoot))];
    for (const markdownFile of markdownFiles) {
      const source = await readFile(markdownFile, 'utf8');
      if (markdownFile !== skill.file && /^---\n/.test(source)) {
        add('Nested reference must not declare Skill frontmatter.', markdownFile);
      }
      if (/\bTODO\b/.test(source)) {
        add('Skill contains unfinished TODO text.', markdownFile);
      }
      for (const forbidden of FORBIDDEN_V2_TERMS) {
        if (forbidden.test(source)) {
          add(
            `2.0 skill contains forbidden 1.x term: ${forbidden.source}`,
            markdownFile
          );
        }
      }
      for (const linkedSkill of extractSkillMentions(source)) {
        if (!knownSkills.has(linkedSkill)) {
          add(`Unknown skill reference: $${linkedSkill}`, markdownFile);
        }
      }
      for (const command of extractCommands(source)) {
        const commandId = toCommandId(command);
        if (!commandId || !knownCommandIds.has(commandId)) {
          add(
            `Unknown 2.0 CLI command reference: openxiangda ${command}`,
            markdownFile
          );
        }
      }
      for (const reference of extractLocalMarkdownLinks(source)) {
        const target = resolve(dirname(markdownFile), reference);
        if (!(await isFile(target))) {
          add(`Broken local reference: ${reference}`, markdownFile);
        }
      }
    }
    const commandReference = resolve(referencesRoot, documentationReferenceFile('cli'));
    if (
      (await isFile(commandReference)) &&
      (await readFile(commandReference, 'utf8')) !==
        renderDevkitCommandReference({
          title: 'CLI 命令参考',
          executable: 'pnpm openxiangda',
        })
    ) {
      add('Generated command reference drifted from DEVKIT_COMMANDS.', commandReference);
    }

    const agentFile = resolve(skillsRoot, skill.directory, 'agents/openai.yaml');
    if (!(await isFile(agentFile))) {
      add('Missing agents/openai.yaml.', agentFile);
    } else {
      const agentSource = await readFile(agentFile, 'utf8');
      if (!agentSource.includes(`$${skill.name}`)) {
        add('Agent default_prompt must explicitly mention the skill name.', agentFile);
      }
      if (/\bTODO\b/.test(agentSource)) add('Agent metadata contains unfinished TODO text.', agentFile);
    }
  }

  return issues.sort((left, right) =>
    `${left.skill}:${left.file}:${left.message}`.localeCompare(
      `${right.skill}:${right.file}:${right.message}`
    )
  );
}

export async function createSkillManifest(skillsRoot: string): Promise<SkillManifest> {
  const skills = await loadSkills(skillsRoot);
  assertCanonicalSkillSet(skills);
  const entries = await Promise.all(
    skills.map(async skill => {
      return {
        name: skill.name,
        description: skill.description,
        sha256: await skillDirectoryDigest(
          resolve(skillsRoot, skill.directory)
        ),
      } satisfies SkillManifestEntry;
    })
  );
  return { schemaVersion: 1, skills: entries.sort((left, right) => left.name.localeCompare(right.name)) };
}

async function skillDirectoryDigest(root: string) {
  const files: string[] = [];
  const visit = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await visit(root);
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash
      .update(relative(root, file).replaceAll('\\', '/'))
      .update('\0')
      .update(await readFile(file))
      .update('\0');
  }
  return hash.digest('hex');
}

export async function writeSkillManifest(skillsRoot: string, output = resolve(skillsRoot, 'manifest.json')) {
  const manifest = await createSkillManifest(skillsRoot);
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

export async function installSkills(input: InstallSkillsInput) {
  const skills = await loadSkills(input.skillsRoot);
  assertCanonicalSkillSet(skills);
  const skill = skills[0]!;
  const target = resolve(input.destination, OPENXIANGDA_SKILL_NAME);
  if (!input.force && (await pathExists(target))) {
    throw new Error(`SKILL_ALREADY_EXISTS: ${target}`);
  }

  const retired = await managedRetiredSkillNames(input.destination);
  await installSkillTransaction({
    source: resolve(input.skillsRoot, skill.directory),
    destination: input.destination,
    name: OPENXIANGDA_SKILL_NAME,
    retiredNames: retired,
  });

  return {
    destination: input.destination,
    installed: [OPENXIANGDA_SKILL_NAME],
    retired,
    references: resolve(target, 'references'),
  };
}

async function managedRetiredSkillNames(destination: string) {
  const retired: string[] = [];
  for (const name of RETIRED_OPENXIANGDA_V2_SKILL_NAMES) {
    const metadata = resolve(
      destination,
      name,
      '.openxiangda-skill-install.json'
    );
    if (!(await isFile(metadata))) continue;
    try {
      const parsed = JSON.parse(await readFile(metadata, 'utf8'));
      if (
        parsed?.manager === 'openxiangda' &&
        /(?:^|\/)v2\/skills\/openxiangda-v2-/.test(
          String(parsed?.sourceRelativePath || '')
        )
      ) {
        retired.push(name);
      }
    } catch {
      // An unreadable or user-owned directory is never removed automatically.
    }
  }
  return retired.sort();
}

async function loadSkills(skillsRoot: string): Promise<LoadedSkill[]> {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const directories = entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith('openxiangda-'))
    .map(entry => entry.name)
    .sort();
  return Promise.all(
    directories.map(async directory => {
      const file = resolve(skillsRoot, directory, 'SKILL.md');
      const source = await readFile(file, 'utf8');
      const frontmatter = parseFrontmatter(source);
      return {
        directory,
        file,
        source,
        name: frontmatter.name || '',
        description: frontmatter.description || '',
      };
    })
  );
}

function assertCanonicalSkillSet(skills: LoadedSkill[]) {
  if (skills.length !== 1 || skills[0]?.name !== OPENXIANGDA_SKILL_NAME) {
    throw new Error(`SKILL_SET_INVALID: expected only ${OPENXIANGDA_SKILL_NAME}`);
  }
}

function parseFrontmatter(source: string): Record<string, string> {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match?.[1]) return {};
  return Object.fromEntries(
    match[1]
      .split('\n')
      .map(line => line.match(/^([a-z_]+):\s*(.+)$/))
      .filter((line): line is RegExpMatchArray => Boolean(line))
      .map(line => [line[1]!, line[2]!.replace(/^['"]|['"]$/g, '')])
  );
}

function extractCommands(source: string) {
  return [
    ...source.matchAll(
      /\bopenxiangda(?:@[^\s`]+)?\s+([a-z][a-z0-9:-]*(?:\s+[a-z][a-z0-9:-]*)?)/gi
    ),
  ].map(match => match[1]!.trim().toLowerCase());
}

function extractSkillMentions(source: string) {
  return [...source.matchAll(/\$([a-z0-9-]+)/g)].map(match => match[1]!).filter(name => !['ref', 'defs', 'schema', 'id', 'anchor'].includes(name));
}

function extractLocalMarkdownLinks(source: string) {
  return [...source.matchAll(/\]\(([^)]+)\)/g)]
    .map(match => match[1]!)
    .filter(reference => !/^(?:[a-z]+:|#)/i.test(reference))
    .map(reference => reference.split('#')[0]!);
}

function toCommandId(command: string) {
  const tokens = command.split(/\s+/).filter(token => token && !token.startsWith('-'));
  if (!tokens[0]) return undefined;
  for (let length = Math.min(tokens.length, 4); length >= 1; length -= 1) {
    const candidate = tokens.slice(0, length).join(':');
    if (knownCommandIds.has(candidate)) return candidate;
  }
  return undefined;
}

async function isFile(file: string) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(path: string) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function markdownFilesBelow(root: string) {
  if (!(await isDirectory(root))) return [];
  const files: string[] = [];
  const visit = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
    }
  };
  await visit(root);
  return files.sort();
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export { refreshWorkspaceGuidance } from './workspace-guidance.js';
