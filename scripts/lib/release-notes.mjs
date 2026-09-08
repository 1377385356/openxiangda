import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadReleaseNotes(root, version) {
  const file = resolve(root, 'docs/releases', `${version}.json`);
  if (!existsSync(file)) throw new Error(`RELEASE_NOTES_REQUIRED: ${file}`);
  const notes = JSON.parse(readFileSync(file, 'utf8'));
  if (notes.schemaVersion !== 'openxiangda.release-notes/v1' || notes.version !== version || notes.status !== 'reviewed') throw new Error('RELEASE_NOTES_NOT_REVIEWED');
  for (const key of ['title', 'summary']) if (typeof notes[key] !== 'string' || notes[key].trim().length < 4) throw new Error(`RELEASE_NOTES_SECTION_REQUIRED: ${key}`);
  for (const key of ['newFeatures', 'fixes', 'affectedUsers', 'upgradeSteps', 'knownLimitations']) {
    const optionalCategory = key === 'newFeatures' || key === 'fixes';
    if (!Array.isArray(notes[key]) || (!optionalCategory && !notes[key].length) || notes[key].some(item => typeof item !== 'string' || !item.trim())) throw new Error(`RELEASE_NOTES_SECTION_REQUIRED: ${key}`);
  }
  if (!notes.newFeatures.length && !notes.fixes.length) throw new Error('RELEASE_NOTES_CHANGE_REQUIRED');
  if (!notes.compatibility?.node || !Array.isArray(notes.issues)) throw new Error('RELEASE_NOTES_COMPATIBILITY_REQUIRED');
  const sha256 = createHash('sha256').update(JSON.stringify(notes)).digest('hex');
  return { ...notes, sha256, url: `https://github.com/1377385356/openxiangda/releases/tag/v${version}` };
}

export function validatePlannedReleaseNotes(root, plan) {
  if (!Array.isArray(plan?.releases)) throw new Error('RELEASE_VERSION_PLAN_INVALID');
  const selected = plan.releases.filter(item => item.name === 'openxiangda');
  if (selected.length > 1) throw new Error('RELEASE_VERSION_PLAN_INVALID');
  const version = selected.length
    ? selected[0].newVersion
    : JSON.parse(readFileSync(resolve(root, 'packages/openxiangda/package.json'), 'utf8')).version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('RELEASE_VERSION_PLAN_INVALID');
  return version.includes('-') ? null : loadReleaseNotes(root, version);
}

export function renderReleaseNotes(notes) {
  const headings = { newFeatures: '新增能力', fixes: '修复问题', affectedUsers: '受影响用户', upgradeSteps: '升级步骤', knownLimitations: '已知限制', issues: '关联 Issue' };
  return `# ${notes.title}\n\n${notes.summary}\n\n` + Object.entries(headings).map(([key, title]) => `## ${title}\n\n${notes[key].length ? notes[key].map(item => `- ${item}`).join('\n') : '无。'}\n`).join('\n') + `\n## 兼容要求\n\n${Object.entries(notes.compatibility).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join('\n')}\n\n更新说明摘要：\`${notes.sha256}\`\n`;
}

export function materializeReleaseNotes(root) {
  const file = resolve(root, 'packages/openxiangda/package.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  if (manifest.version.includes('-')) return null;
  const notes = loadReleaseNotes(root, manifest.version);
  manifest.openxiangdaRelease = notes;
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  const catalog = resolve(root, 'docs/releases/catalog.json');
  mkdirSync(resolve(root, 'docs/releases'), { recursive: true });
  const previous = existsSync(catalog) ? JSON.parse(readFileSync(catalog, 'utf8')).releases : [];
  const releases = [notes, ...previous.filter(item => item.version !== notes.version)];
  writeFileSync(catalog, JSON.stringify({ schemaVersion: 'openxiangda.release-catalog/v1', releases }, null, 2) + '\n');
  writeFileSync(resolve(root, 'docs/releases', `${manifest.version}.md`), renderReleaseNotes(notes));
  return notes;
}
