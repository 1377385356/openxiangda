import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { DOCUMENTATION_TOPICS } from '../../devkit-core/dist/documentation.js';
import { writeSkillManifest } from '../../skill-kit/dist/index.js';
import { loadReleaseNotes } from '../../../scripts/lib/release-notes.mjs';

const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
if (!version.includes('-')) {
  const notes = loadReleaseNotes(resolve(root, '../..'), version);
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  if (JSON.stringify(manifest.openxiangdaRelease) !== JSON.stringify(notes)) throw new Error('RELEASE_NOTES_MANIFEST_MISMATCH: materialize and commit release notes before packing');
  mkdirSync(resolve(root, 'releases'), { recursive: true });
  writeFileSync(resolve(root, 'releases', `${version}.json`), JSON.stringify(notes, null, 2) + '\n');
}
const materialize = text => text.replaceAll('__OPENXIANGDA_VERSION__', version);
const target = resolve(root, 'skills');
rmSync(target, { recursive: true, force: true });
cpSync(resolve(root, '../../skills'), target, { recursive: true });
function materializeTree(path) {
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const file = resolve(path, item.name);
    if (item.isDirectory()) materializeTree(file);
    else if (/\.(?:md|yaml)$/.test(file)) writeFileSync(file, materialize(readFileSync(file, 'utf8')));
  }
}
materializeTree(target);
await writeSkillManifest(target);
const docs = resolve(root, 'documentation');
rmSync(docs, { recursive: true, force: true });
const topics = DOCUMENTATION_TOPICS.map(topic => {
  const content = materialize(readFileSync(resolve(root, '../../docs', topic.file), 'utf8'));
  const output = resolve(docs, topic.file);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, content);
  return { ...topic, sha256: createHash('sha256').update(content).digest('hex') };
});
cpSync(resolve(root, '../../templates/application/AGENTS.md'), resolve(docs, 'AGENTS.md'));
writeFileSync(resolve(docs, 'manifest.json'), JSON.stringify({ schemaVersion: 'openxiangda.documentation/v1', version, topics }, null, 2) + '\n');
