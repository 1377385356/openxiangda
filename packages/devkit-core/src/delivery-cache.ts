import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { canonicalJson, sha256Digest } from 'openxiangda-contracts';
import type { CompiledAppPackage } from './package-compiler.js';
import { verifySealedAppPackage } from './deployment.js';

const CACHE_SCHEMA = 'openxiangda.local-delivery-evidence/v1';
const MAX_FILES = 20_000;
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_TIME_MS = 10_000;
const EXCLUDED = new Set(['.git', '.codegraph', '.openxiangda', 'node_modules', '.turbo', 'coverage', 'playwright-report', 'test-results']);

export interface DeliveryCacheContext {
  root: string;
  frontendRoot: string;
  backendRoot?: string;
  toolchain: unknown;
  environment?: NodeJS.ProcessEnv;
}
export interface ValidationEvidence {
  schemaVersion: typeof CACHE_SCHEMA;
  inputDigest: string;
  outputDigest: string;
}
export interface FileSnapshot { path: string; digest: string; bytes: number }

/** 有界读取且不跟随符号链接。摘要只用于复核本地证据，不代表平台授权。 */
function snapshot(root: string, excluded: (path: string, name: string) => boolean = () => false) {
  const files: FileSnapshot[] = [];
  const started = Date.now();
  let bytes = 0;
  let entries = 0;
  function visit(directory: string) {
    if (Date.now() - started > MAX_TIME_MS) throw new Error('CACHE_SCAN_TIME_LIMIT');
    for (const name of readdirSync(directory).sort()) {
      if (++entries > MAX_FILES) throw new Error('CACHE_SCAN_FILE_LIMIT');
      const path = join(directory, name);
      const local = relative(root, path).replaceAll('\\', '/');
      if (excluded(local, name)) continue;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error('CACHE_SYMLINK_UNSUPPORTED');
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > MAX_BYTES || Date.now() - started > MAX_TIME_MS) throw new Error('CACHE_SCAN_LIMIT');
        const content = readFileSync(path);
        if (content.length !== stat.size) throw new Error('CACHE_INPUT_CHANGED');
        files.push({ path: local, digest: createHash('sha256').update(content).digest('hex'), bytes: content.length });
      } else throw new Error('CACHE_SPECIAL_FILE_UNSUPPORTED');
    }
  }
  visit(root);
  return files;
}

function outputRoots(context: DeliveryCacheContext) {
  return [...new Set([context.frontendRoot, ...(context.backendRoot ? [context.backendRoot] : [])])].map(root => {
    const path = relative(context.root, resolve(context.root, root, 'dist')).replaceAll('\\', '/');
    if (!path || path.startsWith('../')) throw new Error('CACHE_OUTPUT_OUTSIDE_WORKSPACE');
    return path;
  });
}

/** 锁文件、安装状态、源码（包含 .env）、工具链及进程环境共同决定输入；不落盘明文环境变量。 */
export function deliveryInputDigest(context: DeliveryCacheContext): string | null {
  try {
    const outputs = outputRoots(context);
    const files = snapshot(context.root, (path, name) => EXCLUDED.has(name) || outputs.some(root => path === root || path.startsWith(`${root}/`)));
    const locks = files.filter(file => /(^|\/)(pnpm-lock.yaml|package-lock.json|yarn.lock)$/.test(file.path));
    if (!locks.length) return null;
    // 未由当前工作区覆盖的本地依赖没有可靠输入闭包，直接执行正式检查。
    for (const lock of locks) {
      if (/(?:file|link):/.test(readFileSync(join(context.root, lock.path), 'utf8'))) return null;
    }
    const installation = ['node_modules/.modules.yaml', 'node_modules/.pnpm/lock.yaml', 'node_modules/.package-lock.json'].map(path => {
      const file = join(context.root, path);
      if (!existsSync(file)) return { path, digest: null };
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('CACHE_DEPENDENCY_STATE_INVALID');
      return { path, digest: createHash('sha256').update(readFileSync(file)).digest('hex') };
    });
    return sha256Digest({ files, installation, toolchain: context.toolchain, node: process.version,
      platform: process.platform, arch: process.arch, environment: { ...(context.environment || process.env) } });
  } catch { return null; }
}

export function deliveryOutputDigest(context: DeliveryCacheContext): string | null {
  try {
    return sha256Digest(outputRoots(context).map(path => ({ path, files: snapshot(join(context.root, path)) })));
  } catch { return null; }
}

function cachePath(root: string, name: string) { return join(root, '.openxiangda', 'build', name); }
function readJson(path: string, maxBytes = 1024 * 1024): any {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error('CACHE_RECEIPT_INVALID');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${canonicalJson(value)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}

export function reusableValidation(context: DeliveryCacheContext, inputDigest = deliveryInputDigest(context)): ValidationEvidence | null {
  try {
    if (!inputDigest) return null;
    const evidence = readJson(cachePath(context.root, 'validation-evidence.json'));
    if (evidence.schemaVersion !== CACHE_SCHEMA || evidence.inputDigest !== inputDigest || evidence.outputDigest !== deliveryOutputDigest(context)) return null;
    return { schemaVersion: CACHE_SCHEMA, inputDigest, outputDigest: evidence.outputDigest };
  } catch { return null; }
}

export function recordValidation(context: DeliveryCacheContext, before: string | null): ValidationEvidence | null {
  const after = deliveryInputDigest(context);
  if (before && after !== before) {
    throw Object.assign(new Error('检查期间源码、依赖或构建环境发生变化，请在修改结束后重新检查'), { code: 'OPENXIANGDA_VALIDATION_INPUT_CHANGED' });
  }
  const outputDigest = deliveryOutputDigest(context);
  if (!before || !outputDigest) return null;
  const evidence: ValidationEvidence = { schemaVersion: CACHE_SCHEMA, inputDigest: before, outputDigest };
  try { writeJson(cachePath(context.root, 'validation-evidence.json'), evidence); }
  catch { return null; }
  return evidence;
}

export function recordSealedCandidate(context: DeliveryCacheContext, compiled: CompiledAppPackage) {
  const evidence = reusableValidation(context);
  if (evidence) {
    try { writeJson(cachePath(context.root, 'candidate-evidence.json'), { ...evidence, packageDigest: compiled.digest }); }
    catch { /* 缓存不可写不改变正式部署结果。 */ }
  }
}

export async function reusableSealedCandidate(context: DeliveryCacheContext, source: { repository: string; commit: string }, backendImage?: string) {
  try {
    const evidence = reusableValidation(context);
    if (!evidence) return null;
    const candidate = readJson(cachePath(context.root, 'candidate-evidence.json'));
    if (candidate.schemaVersion !== CACHE_SCHEMA || candidate.inputDigest !== evidence.inputDigest || candidate.outputDigest !== evidence.outputDigest) return null;
    const manifest = readJson(cachePath(context.root, 'app-package.json'), 5 * 1024 * 1024);
    if (manifest.source?.repository !== source.repository || manifest.source?.commit !== source.commit || manifest.source?.dirty !== false || !Array.isArray(manifest.artifacts) || manifest.artifacts.length > 8) return null;
    const compiled: CompiledAppPackage = { manifest, digest: candidate.packageDigest };
    if (sha256Digest(manifest) !== compiled.digest) return null;
    const backend = manifest.artifacts.find((artifact: { kind: string }) => artifact.kind === 'backend');
    if (backendImage && backend?.metadata?.imageDigest !== backendImage) return null;
    const artifactContent: Record<string, string> = {};
    let bytes = 0;
    for (const artifact of manifest.artifacts) {
      if (!/^[a-f0-9]{64}$/.test(artifact.digest)) return null;
      const path = cachePath(context.root, `artifacts/${artifact.digest}`);
      const stat = lstatSync(path);
      bytes += stat.size;
      if (!stat.isFile() || bytes > MAX_BYTES) return null;
      artifactContent[artifact.digest] = readFileSync(path, 'utf8');
    }
    await verifySealedAppPackage(compiled, artifactContent);
    return { package: compiled, artifactContent };
  } catch { return null; }
}
