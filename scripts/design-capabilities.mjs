import { createHash } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = resolve(import.meta.dirname, '..');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const safePath = path => typeof path === 'string' && /^[\w./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').some(part => !part || part === '.' || part === '..');

function boundedResource(base, path, limit) {
  let current = base;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('DESIGN_RESOURCE_SYMLINK');
  }
  const fd = openSync(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error('DESIGN_RESOURCE_LIMIT');
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const size = readSync(fd, buffer, length, buffer.length - length, null);
      if (!size) break;
      length += size;
    }
    if (length !== stat.size || fstatSync(fd).mtimeMs !== stat.mtimeMs) throw new Error('DESIGN_RESOURCE_CHANGED');
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}

export function craftDependencies(source) {
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!front) throw new Error('DESIGN_UPSTREAM_METADATA_REQUIRED');
  const block = front[1].match(/^  craft:\s*\n((?: {4,}[^\n]*\n?)*)/m)?.[1];
  const requires = block?.match(/requires:\s*\[([^\]]*)\]/)?.[1];
  const entries = requires !== undefined ? requires.split(',').map(value => value.trim()) : [...(block || '').matchAll(/^ {6}- ([\w-]+)\s*$/gm)].map(match => match[1]);
  if (!entries.length || entries.some(value => !/^[a-z][a-z0-9-]*$/.test(value))) throw new Error('DESIGN_UPSTREAM_CRAFT_INVALID');
  return entries;
}

export function validateDesignCapabilities(root = repositoryRoot) {
  const base = resolve(root, 'design-capabilities');
  const lock = JSON.parse(boundedResource(base, 'lock.json', 128 * 1024).toString('utf8'));
  if (lock.schema !== 'openxiangda.design-capabilities/v1' || lock.repository !== 'https://github.com/nexu-io/open-design' || !/^[a-f0-9]{40}$/.test(lock.revision) || lock.adapterVersion !== 1) throw new Error('DESIGN_LOCK_INVALID');
  const files = new Map();
  let total = 0;
  if (!Array.isArray(lock.files) || lock.files.length > 64) throw new Error('DESIGN_RESOURCE_LIMIT');
  for (const file of lock.files) {
    if (!safePath(file.path) || files.has(file.path)) throw new Error('DESIGN_RESOURCE_PATH_INVALID');
    const bytes = boundedResource(base, `vendor/${file.path}`, Math.min(128 * 1024, 512 * 1024 - total));
    total += bytes.length;
    if (bytes.length > 128 * 1024 || total > 512 * 1024) throw new Error('DESIGN_RESOURCE_LIMIT');
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`DESIGN_RESOURCE_DIGEST_MISMATCH: ${file.path}`);
    files.set(file.path, bytes.toString('utf8'));
  }
  for (const license of ['LICENSE', 'skills/frontend-design/LICENSE.txt', 'attribution/refero-LICENSE']) if (!files.has(license)) throw new Error(`DESIGN_LICENSE_MISSING: ${license}`);
  for (const [method, expected] of Object.entries(lock.methods)) {
    const path = `skills/${method}/SKILL.md`;
    const source = files.get(path);
    if (!source) throw new Error(`DESIGN_METHOD_MISSING: ${method}`);
    const actual = craftDependencies(source);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`DESIGN_DEPENDENCY_DRIFT: ${method}`);
    for (const slug of actual) if (!files.has(`craft/${slug}.md`)) throw new Error(`DESIGN_DEPENDENCY_MISSING: ${slug}`);
    const refs = [...source.matchAll(/(?:references|scripts|assets)\/[\w./-]+\.[\w]+|LICENSE\.txt/g)].map(match => posix.join(posix.dirname(path), match[0]));
    for (const dependency of new Set([...refs, ...(lock.localDependencies[path] || [])])) {
      if (!files.has(dependency)) throw new Error(`DESIGN_DEPENDENCY_MISSING: ${dependency}`);
    }
  }
  return { lock, files, digest: sha256(JSON.stringify(lock)) };
}

function section(path, source, lock) {
  // Keep complete source, including metadata; only headings/relative links are adapted for topic delivery.
  const body = source.replace(/^---\r?\n([\s\S]*?)\r?\n---/, '```yaml\n$1\n```')
    .replace(/^(#{1,6}) /gm, '$1## ')
    .replace(/\]\(([^\s)]+)([^)]*)\)/g, (match, link, suffix) => {
      if (/^(?:[a-z]+:|#)/i.test(link)) return match;
      return `](${lock.repository}/blob/${lock.revision}/${posix.normalize(posix.join(posix.dirname(path), link))}${suffix})`;
    });
  return `\n## ${path.startsWith('craft/') ? posix.basename(path, '.md') : path.split('/')[1] || path}\n\n来源：${lock.repository}/blob/${lock.revision}/${path}\n\n${body}\n`;
}

export function generateDesignTopics(root = repositoryRoot, check = false) {
  const { lock, files, digest } = validateDesignCapabilities(root);
  const preamble = `固定上游提交：\`${lock.revision}\`；适配版本：${lock.adapterVersion}；能力摘要：\`${digest}\`。\n\n这些原文是设计参考；先读[享搭适配与工作流](./design-workflow.md)。上游 preview/outputs 是示例产物，Best Pairings 是可选建议，并不表示这些工具已安装。实际授权与应用事实以当前任务为准。\n`;
  const methods = [...files].filter(([path]) => path.startsWith('skills/') && path.endsWith('.md')).map(([path, source]) => section(path, source, lock)).join('');
  const licenses = ['LICENSE', 'skills/frontend-design/LICENSE.txt', 'attribution/refero-LICENSE'].map(path => `\n## ${path === 'LICENSE' ? 'opendesign-license' : path.startsWith('attribution/') ? 'refero-license' : 'frontend-license'}\n\n\`\`\`text\n${files.get(path)}\n\`\`\`\n`).join('');
  const craft = [...files].filter(([path]) => path.startsWith('craft/')).map(([path, source]) => section(path, source, lock)).join('');
  const topics = { 'opendesign-methods.md': `# OpenDesign 原文方法\n\n${preamble}${methods}${licenses}`, 'design-craft.md': `# OpenDesign Craft 原文\n\n${preamble}\nCraft 来自 OpenDesign，并注明改编自 Refero Design 的 MIT 许可 refero_skill；各条目保留原文署名和来源。\n${craft}` };
  for (const [name, content] of Object.entries(topics)) {
    if (Buffer.byteLength(content) > 128 * 1024) throw new Error(`DESIGN_TOPIC_SIZE_EXCEEDED: ${name}`);
    const path = resolve(root, 'docs', name);
    if (check) { if (!existsSync(path) || readFileSync(path, 'utf8') !== content) throw new Error(`DESIGN_TOPIC_DRIFT: ${name}`); }
    else writeFileSync(path, content);
  }
  return { revision: lock.revision, digest, files: files.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(generateDesignTopics(repositoryRoot, process.argv.includes('--check'))));
}
