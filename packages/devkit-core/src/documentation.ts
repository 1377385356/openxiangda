import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** 使用指南的唯一主题目录；正文从同版本根包读取。 */
export const DOCUMENTATION_TOPICS = [
  { id: 'getting-started', title: '安装与开始开发', file: 'getting-started.md' },
  { id: 'product-design', title: '对话发现与详细产品设计', file: 'product-design.md' },
  { id: 'interaction-patterns', title: '页面交互模式与体验评审', file: 'interaction-patterns.md' },
  { id: 'development', title: '需求与开发流程', file: 'development.md' },
  { id: 'application-foundation', title: '业务模型与标准 CRUD', file: 'application-foundation.md' },
  { id: 'appspec', title: '需求、设计与交付记录', file: 'appspec.md' },
  { id: 'concepts', title: '架构与能力所有者', file: 'concepts.md' },
  { id: 'frontend', title: '页面与标准组件扩展', file: 'frontend.md' },
  { id: 'field-components', title: '字段、表单与移动控件', file: 'field-components.md' },
  { id: 'data-authz', title: '数据查询与权限', file: 'data-authz.md' },
  { id: 'public-access', title: '无账号的匿名公开访问', file: 'public-access.md' },
  { id: 'workflow-events', title: '审批、事件与通知', file: 'workflow-events.md' },
  { id: 'backend', title: '按需后端与业务动作', file: 'backend.md' },
  { id: 'administration', title: '应用管理与有效配置', file: 'administration.md' },
  { id: 'testing', title: '检查与真实业务验收', file: 'testing.md' },
  { id: 'delivery', title: '部署、生产晋级与恢复', file: 'delivery.md' },
  { id: 'upgrading', title: '版本升级与资料刷新', file: 'upgrading.md' },
  { id: 'cli', title: 'CLI 命令参考', file: 'reference/cli.md' },
  { id: 'mcp', title: 'MCP 配置与工具参考', file: 'reference/mcp.md' },
] as const;

/** Skill 参考文件名直接使用主题 ID，正文由同一中文主题生成。 */
export function documentationReferenceFile(id: string) {
  return `${id}.md`;
}

const MAX_TOPIC_BYTES = 128 * 1024;

export function documentationRoot() {
  return resolve(process.env.OPENXIANGDA_DOCUMENTATION_ROOT || resolve(import.meta.dirname, '../../../docs'));
}

function topicSource(id: string, root: string) {
  const topic = DOCUMENTATION_TOPICS.find(item => item.id === id);
  if (!topic) throw new Error(`DOCUMENTATION_TOPIC_NOT_FOUND: 未知主题 ${id}。CLI 运行 pnpm openxiangda docs，MCP 调用 docs_read 并省略 topic，按目录中的 id 读取正文`);
  const path = resolve(root, topic.file);
  if (!existsSync(path)) throw new Error(`DOCUMENTATION_NOT_INSTALLED: 当前安装缺少 ${id}，请通过同版本 openxiangda 根包启动`);
  const resolved = realpathSync(path);
  const local = relative(realpathSync(root), resolved);
  if (local.startsWith('..') || isAbsolute(local)) throw new Error('DOCUMENTATION_PATH_FORBIDDEN: 文档不能越过资料目录');
  if (!statSync(resolved).isFile() || statSync(resolved).size > MAX_TOPIC_BYTES) {
    throw new Error('DOCUMENTATION_SIZE_EXCEEDED: 单个主题必须是大小不超过 128 KiB 的文本文档');
  }
  const text = readFileSync(resolved, 'utf8');
  const sha256 = createHash('sha256').update(text).digest('hex');
  const manifestPath = resolve(root, 'manifest.json');
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string; topics: Array<{ id: string; sha256: string }> }
    : undefined;
  if (manifest && manifest.topics.find(item => item.id === id)?.sha256 !== sha256) {
    throw new Error(`DOCUMENTATION_DIGEST_MISMATCH: ${id} 与当前根包资料摘要不一致，请重新安装该精确版本`);
  }
  return { ...topic, text, sha256, version: manifest?.version || 'development' };
}

function sections(text: string) {
  const lines = text.split('\n');
  const found: Array<{ id: string; title: string; start: number; end: number }> = [];
  let fenced = false;
  const used = new Map<string, number>();
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
    const match = !fenced && line.match(/^##\s+(.+?)(?:\s+\{#([\w-]+)\})?\s*$/);
    if (!match) return;
    const title = match[1]!;
    const base = match[2] || title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    if (found.length) found[found.length - 1]!.end = index;
    found.push({ id: count ? `${base}-${count + 1}` : base, title, start: index, end: lines.length });
  });
  return { lines, found };
}

export function documentationIndex(root = documentationRoot()) {
  const topics = DOCUMENTATION_TOPICS.map(({ id }) => {
    const source = topicSource(id, root);
    return {
      id, title: source.title, uri: `openxiangda://docs/${id}`,
      version: source.version, sha256: source.sha256,
      bytes: Buffer.byteLength(source.text),
      sections: sections(source.text).found.map(({ id, title }) => ({ id, title })),
    };
  });
  return { schemaVersion: 'openxiangda.documentation/v1', topics };
}

export function readDocumentation(id: string, section?: string, root = documentationRoot()) {
  const source = topicSource(id, root);
  const parsed = sections(source.text);
  const selected = section ? parsed.found.find(item => item.id === section) : undefined;
  if (section && !selected) throw new Error(`DOCUMENTATION_SECTION_NOT_FOUND: ${id} 没有章节 ${section}，先读取该主题的章节目录`);
  return {
    schemaVersion: 'openxiangda.documentation/v1', topic: id, title: source.title,
    version: source.version, sha256: source.sha256, uri: `openxiangda://docs/${id}`,
    sections: parsed.found.map(({ id, title }) => ({ id, title })),
    content: selected ? parsed.lines.slice(selected.start, selected.end).join('\n') : source.text,
  };
}

export function workspaceGuidanceTemplatePath() {
  return process.env.OPENXIANGDA_DOCUMENTATION_ROOT
    ? resolve(documentationRoot(), 'AGENTS.md')
    : resolve(import.meta.dirname, '../../../templates/application/AGENTS.md');
}
