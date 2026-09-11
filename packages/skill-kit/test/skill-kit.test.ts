import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { DOCUMENTATION_TOPICS, documentationReferenceFile, renderDevkitCommandReference } from 'openxiangda-devkit-core';
import {
  OPENXIANGDA_SKILL_NAME,
  createSkillManifest,
  installSkills,
  validateSkills,
  writeSkillManifest,
} from '../src/index.js';
import { installSkillTransaction } from '../src/internal/skill-installer.js';

async function distributionOptions() {
  const metadata = JSON.parse(await readFile(resolve(import.meta.dirname, '../../openxiangda/bin/distribution/support-commands.json'), 'utf8'));
  return { distributionCommandIds: metadata.commands };
}

test('validates and seals exactly one deterministic skill distribution', async () => {
  const root = await fixture();
  assert.deepEqual(await validateSkills(root), []);
  const first = await createSkillManifest(root);
  const second = await createSkillManifest(root);
  assert.deepEqual(first, second);
  assert.deepEqual(first.skills.map(skill => skill.name), [OPENXIANGDA_SKILL_NAME]);
  await writeSkillManifest(root);
  assert.deepEqual(
    JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8')),
    first
  );
  await writeFile(
    resolve(root, 'openxiangda-v2/references/frontend.md'),
    '# Frontend changed\n'
  );
  assert.notEqual(
    (await createSkillManifest(root)).skills[0]?.sha256,
    first.skills[0]?.sha256
  );

  await writeSkill(resolve(root, 'openxiangda-v2-extra'), 'openxiangda-v2-extra');
  assert.equal((await validateSkills(root)).length > 0, true);
  await assert.rejects(() => createSkillManifest(root), /SKILL_SET_INVALID/);
});

test('recognizes executable distribution actions without admitting invented commands', async () => {
  const root = await fixture();
  const file = resolve(root, 'openxiangda-v2/references/getting-started.md');
  await writeFile(file, '# Distribution\n\nopenxiangda update check\nopenxiangda update install\nopenxiangda migrate assess\nopenxiangda support status\nopenxiangda support bootstrap\nopenxiangda support login\nopenxiangda support join\n');
  assert.ok((await validateSkills(root)).length > 0);
  assert.deepEqual(await validateSkills(root, await distributionOptions()), []);
  await writeFile(file, '# Unsupported\n\nopenxiangda support redeem\n');
  assert.ok((await validateSkills(root, await distributionOptions())).some(issue => issue.message.includes('Unknown 2.0 CLI command')));
});

test('CLI accepts current distribution metadata and rejects malformed command identifiers', async () => {
  const root = await fixture();
  const metadataFile = resolve(import.meta.dirname, '../../openxiangda/bin/distribution/support-commands.json');
  const run = (file: string) => spawnSync(process.execPath, ['--import', 'tsx', 'src/bin.ts', root, '--distribution-commands', file], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
  });
  await writeFile(resolve(root, 'openxiangda-v2/references/getting-started.md'), '# Distribution\n\nopenxiangda version\nopenxiangda changelog\nopenxiangda update check\n');
  const valid = run(metadataFile);
  assert.equal(valid.status, 0, valid.stderr);
  const malformedFile = resolve(root, 'commands.json');
  for (const command of ['support:', 'update::check', 'version\ninstall', 42]) {
    await writeFile(malformedFile, JSON.stringify({ schemaVersion: 'openxiangda.distribution-commands/v1', commands: [command] }));
    const invalid = run(malformedFile);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /DISTRIBUTION_COMMAND_METADATA_INVALID/);
  }
});

test('installs the canonical skill and retires only managed legacy layouts', async () => {
  const root = await fixture();
  const destination = resolve(root, 'installed');
  await mkdir(destination, { recursive: true });
  await mkdir(resolve(destination, 'other-vendor-skill'), { recursive: true });
  await writeFile(
    resolve(destination, 'other-vendor-skill/keep.txt'),
    'must-survive'
  );
  await mkdir(resolve(destination, 'openxiangda-user-notes'), { recursive: true });
  await writeFile(
    resolve(destination, 'openxiangda-user-notes/keep.txt'),
    'must-survive'
  );
  await mkdir(resolve(destination, 'openxiangda-v2-delivery'), {
    recursive: true,
  });
  await writeFile(
    resolve(
      destination,
      'openxiangda-v2-delivery/.openxiangda-skill-install.json'
    ),
    JSON.stringify({
      manager: 'openxiangda',
      sourceRelativePath: 'v2/skills/openxiangda-v2-delivery',
    })
  );

  const installed = await installSkills({
    skillsRoot: root,
    destination,
    force: true,
  });
  assert.deepEqual(installed.installed, [OPENXIANGDA_SKILL_NAME]);
  assert.deepEqual(installed.retired, ['openxiangda-v2-delivery']);
  await assert.rejects(
    () => readFile(resolve(destination, 'openxiangda-v2-delivery/SKILL.md')),
    /ENOENT/
  );
  assert.equal(
    await readFile(
      resolve(destination, 'openxiangda-v2/references/frontend.md'),
      'utf8'
    ),
    '# Frontend\n'
  );
  assert.equal(
    await readFile(
      resolve(destination, 'openxiangda-v2/references/public-access.md'),
      'utf8'
    ),
    '# public-access.md\n'
  );
  assert.equal(
    await readFile(resolve(destination, 'other-vendor-skill/keep.txt'), 'utf8'),
    'must-survive'
  );
  assert.equal(
    await readFile(resolve(destination, 'openxiangda-user-notes/keep.txt'), 'utf8'),
    'must-survive'
  );
});

test('atomically replaces only the current skill', { concurrency: false }, async () => {
  const root = await fixture();
  const destination = resolve(root, 'installed');
  const current = resolve(destination, OPENXIANGDA_SKILL_NAME);
  await mkdir(current, { recursive: true });
  await writeFile(resolve(current, 'current.txt'), 'must-be-restored');
  await mkdir(resolve(destination, 'other-vendor-skill'), { recursive: true });
  await writeFile(resolve(destination, 'other-vendor-skill/keep.txt'), 'untouched');

  await installSkillTransaction({
    source: resolve(root, OPENXIANGDA_SKILL_NAME),
    destination,
    name: OPENXIANGDA_SKILL_NAME,
  });

  assert.equal(
    await readFile(resolve(current, 'SKILL.md'), 'utf8'),
    `---\nname: ${OPENXIANGDA_SKILL_NAME}\ndescription: 在开发和验证 OpenXiangda 应用资料时使用本技能。\n---\n\nRun \`openxiangda check\`.\n`
  );
  assert.equal(
    await readFile(resolve(destination, 'other-vendor-skill/keep.txt'), 'utf8'),
    'untouched'
  );
});

test('rejects nested references that masquerade as installable skills', async () => {
  const root = await fixture();
  await writeFile(
    resolve(root, 'openxiangda-v2/references/frontend.md'),
    '---\nname: nested-skill\n---\n'
  );
  assert.match(
    (await validateSkills(root)).map(issue => issue.message).join('\n'),
    /must not declare Skill frontmatter/
  );
});

test('recursively rejects broken links, unknown commands, and retired identity/package terms', async () => {
  const root = await fixture();
  await writeFile(
    resolve(root, 'openxiangda-v2/references/backend.md'),
    [
      '# Backend',
      '[missing](missing.md)',
      '`pnpm openxiangda app provision`',
      'Do not select a RoleSession.',
      'Do not import openxiangda-workflow.',
    ].join('\n')
  );
  const messages = (await validateSkills(root))
    .map(issue => issue.message)
    .join('\n');
  assert.match(messages, /Broken local reference: missing\.md/);
  assert.match(messages, /Unknown 2\.0 CLI command reference: openxiangda app provision/);
  assert.match(messages, /forbidden 1\.x term: \\bRoleSession\\b/);
  assert.match(messages, /openxiangda-/);
});

test('Chinese guidance routes anonymous access and current backend contracts', async () => {
  const skillRoot = resolve(import.meta.dirname, '../../../skills/openxiangda-v2');
  assert.deepEqual(await validateSkills(resolve(skillRoot, '..'), await distributionOptions()), []);
  const skill = await readFile(resolve(skillRoot, 'SKILL.md'), 'utf8');
  assert.match(skill, /references\/public-access\.md/);
  const publicAccess = await readFile(resolve(skillRoot, 'references/public-access.md'), 'utf8');
  for (const token of ['frontend.publicAccess', 'createAnonymousPublicClient', 'own.list', 'own.read', 'public.list', 'public.read', 'publicRecordFields', 'publicSubtableFields']) assert.ok(publicAccess.includes(token));
  assert.match(publicAccess, /draft.*公共读取/);
  const backend = await readFile(resolve(skillRoot, 'references/backend.md'), 'utf8');
  for (const token of ['duplicateMatch', 'authz.capabilities', "kind: 'backend'", 'OpenXiangdaBusinessDataApiService']) assert.ok(backend.includes(token));
});

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'openxiangda-skill-kit-'));
  const skillRoot = resolve(root, OPENXIANGDA_SKILL_NAME);
  await writeSkill(skillRoot, OPENXIANGDA_SKILL_NAME);
  await mkdir(resolve(skillRoot, 'references'), { recursive: true });
  for (const name of DOCUMENTATION_TOPICS.map(topic => documentationReferenceFile(topic.id))) {
    await writeFile(
      resolve(skillRoot, 'references', name),
      name === 'frontend.md' ? '# Frontend\n' : `# ${name}\n`
    );
  }
  await writeFile(
    resolve(skillRoot, 'references/cli.md'),
    renderDevkitCommandReference({
      title: 'CLI 命令参考',
      executable: 'pnpm openxiangda',
    })
  );
  return root;
}

async function writeSkill(root: string, name: string) {
  await mkdir(resolve(root, 'agents'), { recursive: true });
  await writeFile(
    resolve(root, 'SKILL.md'),
    `---\nname: ${name}\ndescription: 在开发和验证 OpenXiangda 应用资料时使用本技能。\n---\n\nRun \`openxiangda check\`.\n`,
    'utf8'
  );
  await writeFile(
    resolve(root, 'agents/openai.yaml'),
    `interface:\n  display_name: "OpenXiangda"\n  short_description: "Validate OpenXiangda skills"\n  default_prompt: "Use $${name} to test validation."\n`,
    'utf8'
  );
}
