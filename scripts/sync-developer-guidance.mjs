import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DOCUMENTATION_TOPICS, documentationReferenceFile } from '../packages/devkit-core/src/documentation.ts';

const root = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const docsRoot = resolve(root, 'docs');
const references = resolve(root, 'skills/openxiangda-v2/references');
const byPath = new Map(DOCUMENTATION_TOPICS.map(topic => [resolve(docsRoot, topic.file), topic]));
for (const topic of DOCUMENTATION_TOPICS) {
  const sourcePath = resolve(docsRoot, topic.file);
  const source = readFileSync(sourcePath, 'utf8');
  const content = source.replace(/\]\(([^\s)]+)([^)]*)\)/g, (match, link, suffix) => {
    if (/^(?:[a-z]+:|#)/i.test(link)) return match;
    const [path, anchor] = link.split('#');
    const target = byPath.get(resolve(dirname(sourcePath), path));
    if (!target) throw new Error(`GUIDANCE_LINK_OUTSIDE_TOPICS: ${topic.file} -> ${link}`);
    return `](${documentationReferenceFile(target.id)}${anchor ? `#${anchor}` : ''}${suffix})`;
  });
  const target = resolve(references, documentationReferenceFile(topic.id));
  if (check) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== content) throw new Error(`GUIDANCE_DRIFT: ${target}`);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
for (const name of ['workspace.md', 'discovery.md', 'architecture.md', 'commands.md']) {
  const retired = resolve(references, name);
  if (check && existsSync(retired)) throw new Error(`GUIDANCE_RETIRED_REFERENCE: ${name}`);
  if (!check) rmSync(retired, { force: true });
}
const llms = '# OpenXiangda 2.0 中文使用资料\n\n通过项目锁定版本的 `pnpm openxiangda docs` 或 MCP `docs_read` 读取同版本正文。\n\n' + DOCUMENTATION_TOPICS.map(topic => `- [${topic.title}](./${topic.file})：主题 ID \`${topic.id}\``).join('\n') + '\n';
if (check) {
  if (readFileSync(resolve(docsRoot, 'llms.txt'), 'utf8') !== llms) throw new Error('GUIDANCE_INDEX_DRIFT');
} else writeFileSync(resolve(docsRoot, 'llms.txt'), llms);
console.log(`中文资料 ${check ? '校验' : '生成'}通过：${DOCUMENTATION_TOPICS.length} 个主题`);
