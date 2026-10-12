import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { backendImageInputBoundary } from './backend-image-inputs.js';

const match = createRequire(import.meta.url)('picomatch') as (pattern: string[], options: { dot: boolean }) => (path: string) => boolean;
export const WORKSPACE_MAX_PACKAGE_FILES = 2_000;
export const WORKSPACE_MAX_MANIFEST_BYTES = 1_000_000;

export class WorkspaceInputError extends Error {
  readonly code = 'OPENXIANGDA_WORKSPACE_INPUT_INVALID';
}

export class WorkspaceInputLimitError extends Error {
  readonly code = 'OPENXIANGDA_WORKSPACE_CAPSULE_SCAN_LIMIT';
}

function readManifest(path: string) {
  if (statSync(path).size > WORKSPACE_MAX_MANIFEST_BYTES) {
    throw new WorkspaceInputLimitError(`${path} exceeds ${WORKSPACE_MAX_MANIFEST_BYTES} bytes`);
  }
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('object required');
    return manifest as Record<string, unknown>;
  }
  catch { throw new WorkspaceInputError(`package.json 无法解析: ${path}`); }
}

/** Workspace declarations and effective artifact inputs, rather than arbitrary historical folders. */
export function workspacePackageInputs(root: string, options: { dockerfile?: string } = {}) {
  root = realpathSync(root);
  const rootFile = join(root, 'package.json');
  const rootManifest = existsSync(rootFile) ? readManifest(rootFile) : {};
  let patterns: unknown = rootManifest.workspaces;
  if (patterns && !Array.isArray(patterns) && typeof patterns === 'object') patterns = (patterns as { packages?: unknown }).packages;
  const yamlPath = join(root, 'pnpm-workspace.yaml');
  if (existsSync(yamlPath)) {
    if (statSync(yamlPath).size > 256 * 1024) throw new WorkspaceInputLimitError('pnpm-workspace.yaml 超过 256 KiB');
    try {
      const config = parse(readFileSync(yamlPath, 'utf8'), { maxAliasCount: 0 });
      if (config?.packages !== undefined) patterns = config.packages;
    } catch { throw new WorkspaceInputError('pnpm-workspace.yaml 无法解析'); }
  }
  const declared = patterns !== undefined;
  if (declared && (!Array.isArray(patterns) || patterns.some(p => typeof p !== 'string' || p.length > 1024 || p.includes('..') || isAbsolute(p)))) {
    throw new WorkspaceInputError('workspace packages 必须是工作区内的 glob 数组');
  }
  const globs = (patterns || []) as string[];
  const positive = globs.filter(p => !p.startsWith('!')).map(p => p.replace(/^\.\//, '').replace(/\/+$/, ''));
  const negative = globs.filter(p => p.startsWith('!')).map(p => p.slice(1).replace(/^\.\//, '').replace(/\/+$/, ''));
  const includes = positive.length ? match(positive, { dot: true }) : () => false;
  const excludes = negative.length ? match(negative, { dot: true }) : () => false;
  const workspaceIncludes = (path: string) => includes(path) && !excludes(path);
  const requestedDockerfile = options.dockerfile && resolve(root, options.dockerfile);
  if (requestedDockerfile && lstatSync(requestedDockerfile).isSymbolicLink()) throw new WorkspaceInputError('Dockerfile 不能是符号链接');
  const dockerfile = requestedDockerfile && realpathSync(requestedDockerfile);
  const inside = (path: string) => path === root || path.startsWith(`${root}/`);
  if (dockerfile && (!inside(dockerfile) || lstatSync(dockerfile).isSymbolicLink())) throw new WorkspaceInputError('Dockerfile 必须位于工作区内');
  const boundary = dockerfile ? backendImageInputBoundary(root, dockerfile) : undefined;
  const selected = new Map<string, Record<string, unknown>>();
  let entries = 0;
  const deadline = Date.now() + 60_000;
  const add = (path: string) => {
    if (!inside(realpathSync(path))) throw new WorkspaceInputError(`本地包链接越出工作区: ${relative(root, path)}`);
    if (selected.has(path)) return;
    if (selected.size >= WORKSPACE_MAX_PACKAGE_FILES) throw new WorkspaceInputLimitError(`workspace package.json count exceeds ${WORKSPACE_MAX_PACKAGE_FILES}`);
    selected.set(path, readManifest(path));
  };
  if (existsSync(rootFile)) add(rootFile);
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++entries > 100_000 || Date.now() > deadline) throw new WorkspaceInputLimitError('workspace 输入扫描超过 100000 项或 60 秒');
      if (['node_modules', '.git'].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      const rel = relative(root, path).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        // Keep the historical fallback for workspaces that declare no package boundary.
        if (!declared && ['dist', 'coverage', 'playwright-report', 'test-results', '.openxiangda', '.turbo'].includes(entry.name)) continue;
        walk(path);
      } else if (entry.isFile() && entry.name === 'package.json') {
        if (!declared || workspaceIncludes(relative(root, directory).replaceAll('\\', '/')) || boundary?.includes(rel)) add(path);
      } else if (entry.isSymbolicLink() && workspaceIncludes(rel)) {
        if (!inside(realpathSync(path))) throw new WorkspaceInputError(`工作区链接越界: ${rel}`);
        if (existsSync(join(path, 'package.json'))) add(join(path, 'package.json'));
      }
    }
  };
  walk(root);
  const visited = new Set<string>();
  for (const [file, manifest] of selected) {
    const real = realpathSync(file);
    if (visited.has(real)) continue;
    visited.add(real);
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const deps = manifest[section];
      if (!deps || typeof deps !== 'object') continue;
      for (const spec of Object.values(deps)) {
        if (typeof spec !== 'string' || !/^(file|link):/.test(spec)) continue;
        const path = resolve(dirname(file), spec.replace(/^(file|link):/, ''));
        if (!inside(path) || !existsSync(path) || !inside(realpathSync(path))) throw new WorkspaceInputError(`本地依赖缺失或越界: ${relative(root, file)} -> ${spec}`);
        if (statSync(path).isDirectory()) {
          if (!existsSync(join(path, 'package.json'))) throw new WorkspaceInputError(`本地依赖缺少 package.json: ${spec}`);
          add(join(path, 'package.json'));
        }
      }
    }
  }
  return [...selected.entries()].sort(([a], [b]) => a.localeCompare(b));
}
