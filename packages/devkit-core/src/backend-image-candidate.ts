import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { Ignore } from '@balena/dockerignore';
import { lock } from 'proper-lockfile';
import { inspectBackendOciLayout } from './backend-image-upload.js';
import { backendImageUploadFailure } from './backend-image-upload-failure.js';

const SCHEMA = 'openxiangda.backend-image-candidate/v1';
const KEY = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const TTL = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 8;
const MAX_BYTES = 8 * 1024 ** 3;
const CANDIDATE_BYTES = MAX_BYTES;
const dockerignore = createRequire(import.meta.url)('@balena/dockerignore') as (options: { ignorecase: boolean }) => Ignore;

export interface BackendImageRecoveryScope {
  platform: string;
  tenantId: string;
  userId: string;
  appCode: string;
  environmentKey: string;
  environmentId?: string;
  configurationDigest: string;
  toolchainVersion: string;
}

interface Candidate {
  schemaVersion: typeof SCHEMA;
  key: string;
  createdAt: number;
  reservedBytes: number;
  state: 'building' | 'sealed';
  digest?: string;
}

export class BackendImageCandidateError extends Error {
  readonly retryable: boolean;
  constructor(readonly code: string, message: string, readonly data: Record<string, unknown> = {}, retryable = false) {
    super(`${code}: ${message}`);
    this.name = 'BackendImageCandidateError';
    this.retryable = retryable;
  }
}

function fail(code: string, message: string): never {
  throw new BackendImageCandidateError(`OPENXIANGDA_BACKEND_IMAGE_${code}`, message);
}

function privateDirectory(path: string, create = true) {
  if (!existsSync(path)) {
    if (!create) fail('CACHE_INVALID', '镜像缓存目录无效');
    const parent = dirname(path);
    if (!existsSync(parent)) privateDirectory(parent);
    try { mkdirSync(path, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())) {
    fail('CACHE_PATH_INVALID', '镜像缓存必须是当前用户的私有目录');
  }
}

function readCandidate(directory: string, key: string): Candidate {
  privateDirectory(directory, false);
  const path = join(directory, 'candidate.json');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096 || (stat.mode & 0o077) !== 0) {
    fail('CACHE_INVALID', '镜像缓存描述无效，未上传任何内容');
  }
  const x = JSON.parse(readFileSync(path, 'utf8')) as Candidate;
  if (x.schemaVersion !== SCHEMA || x.key !== key || !KEY.test(x.key) ||
    !Number.isSafeInteger(x.createdAt) || x.createdAt < 1 || x.createdAt > Date.now() + 60_000 ||
    !Number.isSafeInteger(x.reservedBytes) || x.reservedBytes < 1 || x.reservedBytes > CANDIDATE_BYTES ||
    !['building', 'sealed'].includes(x.state) ||
    (x.state === 'sealed' && !DIGEST.test(String(x.digest)))) fail('CACHE_INVALID', '镜像缓存描述无效，未上传任何内容');
  return x;
}

function saveCandidate(directory: string, candidate: Candidate) {
  const temporary = join(directory, `candidate-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(candidate), { mode: 0o600, flag: 'wx' });
  renameSync(temporary, join(directory, 'candidate.json'));
}

async function lease(path: string, retries = 0) {
  let compromised = false;
  try {
    const release = await lock(path, { realpath: false, stale: 300_000, update: 30_000,
      retries: { retries, minTimeout: 50, maxTimeout: 250, randomize: true },
      onCompromised: () => { compromised = true; } });
    return {
      assert: () => { if (compromised) fail('CACHE_LEASE_LOST', '镜像缓存租约已失效，停止继续上传'); },
      release: async () => { await release().catch(() => undefined); },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOCKED') {
      throw new BackendImageCandidateError('OPENXIANGDA_BACKEND_IMAGE_BUSY', '同一镜像候选正在使用，请等待原操作结束后重试', {}, true);
    }
    throw error;
  }
}

/** Hash the actual local Docker context, including dirty/untracked files; never use a commit as a cache key. */
export async function backendImageContextDigest(root: string, dockerfile: string): Promise<string> {
  const ignorePath = existsSync(`${dockerfile}.dockerignore`) ? `${dockerfile}.dockerignore` : join(root, '.dockerignore');
  for (const path of [dockerfile, ignorePath]) {
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || !(real === root || real.startsWith(`${root}/`))) fail('CONTEXT_INVALID', 'Dockerfile 和 ignore 文件必须是工作区内的普通文件');
  }
  const rules = readFileSync(ignorePath, 'utf8');
  if (Buffer.byteLength(rules) > 256 * 1024) fail('CONTEXT_LIMIT', 'Docker ignore 文件超过 256 KiB');
  const matcher = dockerignore({ ignorecase: false }).add(rules);
  const exceptions = rules.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('!')).map(line => line.slice(1).replace(/^\/+|\/+$/g, ''));
  // When an exclusion can re-include descendants we must walk the excluded parent.
  const mayInclude = (path: string) => exceptions.some(pattern => {
    if (pattern.includes('\\') || pattern.includes('..') || pattern.startsWith('./')) return true;
    const prefix = pattern.split(/[?*\[]/, 1)[0]!;
    return !prefix || prefix.startsWith(`${path}/`) || `${path}/`.startsWith(prefix);
  });
  const hash = createHash('sha256');
  hash.update(JSON.stringify([relative(root, dockerfile), relative(root, ignorePath), rules]));
  let entries = 0;
  let bytes = 0;
  const deadline = Date.now() + 60_000;
  const walk = async (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      if (++entries > 100_000 || Date.now() > deadline) fail('CONTEXT_LIMIT', '构建上下文超过恢复校验预算，请缩小 .dockerignore 定义的构建上下文');
      const path = join(directory, name);
      const relativePath = relative(root, path).replaceAll('\\', '/');
      const stat = lstatSync(path);
      const included = path === dockerfile || path === ignorePath || !matcher.ignores(relativePath);
      if (stat.isDirectory()) {
        if (included) hash.update(JSON.stringify(['d', relativePath, stat.mode & 0o777]));
        if (included || mayInclude(relativePath) || dockerfile.startsWith(`${path}/`) || ignorePath.startsWith(`${path}/`)) await walk(path);
      } else if (included && stat.isSymbolicLink()) {
        hash.update(JSON.stringify(['l', relativePath, readlinkSync(path)]));
      } else if (included && stat.isFile()) {
        bytes += stat.size;
        if (bytes > MAX_BYTES) fail('CONTEXT_LIMIT', '构建上下文超过 8 GiB，无法安全绑定恢复候选');
        hash.update(JSON.stringify(['f', relativePath, stat.mode & 0o777, stat.size]));
        for await (const chunk of createReadStream(path)) {
          if (Date.now() > deadline) fail('CONTEXT_LIMIT', '构建上下文校验超时');
          hash.update(chunk);
        }
        const after = lstatSync(path);
        if (stat.ino !== after.ino || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs) fail('CONTEXT_CHANGED', '校验期间源码发生变化，请在保存完成后重试');
      } else if (included) {
        fail('CONTEXT_INVALID', '构建上下文包含不受支持的设备或管道文件');
      }
    }
  };
  await walk(root);
  return `sha256:${hash.digest('hex')}`;
}

async function acquireCandidate(cacheRoot: string, key: string, reservedBytes: number) {
  privateDirectory(cacheRoot);
  const global = await lease(join(cacheRoot, '.registry'), 8);
  try {
    const names = readdirSync(cacheRoot).filter(name => KEY.test(name));
    if (names.length > 64) fail('CACHE_LIMIT', '缓存目录超出安全扫描范围');
    const candidates = names.map(name => ({ directory: join(cacheRoot, name), candidate: readCandidate(join(cacheRoot, name), name) }));
    const existing = candidates.find(item => item.candidate.key === key);
    // Locks live beside candidates, so removing candidate files never releases another process's lock.
    const owned = await lease(join(cacheRoot, key));
    try {
      let selected = existing?.candidate;
      if (selected && Date.now() - selected.createdAt >= TTL) {
        rmSync(join(cacheRoot, key), { recursive: true });
        selected = undefined;
      }
      if (selected) return { directory: join(cacheRoot, key), candidate: selected, owned };
      let remaining = candidates.filter(item => item.candidate.key !== key);
      for (const item of [...remaining].sort((a, b) => a.candidate.createdAt - b.candidate.createdAt)) {
        const overBudget = remaining.length >= MAX_ENTRIES || remaining.reduce((sum, c) => sum + c.candidate.reservedBytes, reservedBytes) > MAX_BYTES;
        if (!overBudget && Date.now() - item.candidate.createdAt < TTL) continue;
        let cleanup;
        try { cleanup = await lease(item.directory); } catch (error) {
          if (error instanceof BackendImageCandidateError && error.code.endsWith('_BUSY')) continue;
          throw error;
        }
        try {
          global.assert(); cleanup.assert();
          rmSync(item.directory, { recursive: true });
          remaining = remaining.filter(other => other !== item);
        } finally { await cleanup.release(); }
      }
      if (remaining.length >= MAX_ENTRIES || remaining.reduce((sum, c) => sum + c.candidate.reservedBytes, reservedBytes) > MAX_BYTES) {
        fail('CACHE_FULL', '镜像缓存空间被活动候选占用，请等待原上传完成');
      }
      global.assert(); owned.assert();
      const directory = join(cacheRoot, key);
      const candidate: Candidate = { schemaVersion: SCHEMA, key, createdAt: Date.now(), reservedBytes, state: 'building' };
      const staging = join(cacheRoot, `.prepare-${randomUUID()}`);
      privateDirectory(staging);
      try {
        saveCandidate(staging, candidate);
        global.assert(); owned.assert();
        renameSync(staging, directory);
      } finally { rmSync(staging, { recursive: true, force: true }); }
      return { directory, candidate, owned };
    } catch (error) { await owned.release(); throw error; }
  } finally { await global.release(); }
}

async function removeOwnedCandidate(cacheRoot: string, directory: string, owned: { assert: () => void }) {
  const global = await lease(join(cacheRoot, '.registry'), 8);
  try {
    global.assert(); owned.assert();
    rmSync(directory, { recursive: true, force: true });
  } finally { await global.release(); }
}

export async function withBackendImageCandidate<T>(input: {
  root: string;
  dockerfile: string;
  scope: BackendImageRecoveryScope;
  maxImageBytes: number;
  /** @internal Temporary private directory for executable tests. */
  cacheRoot?: string;
  build: (directory: string) => Promise<void>;
  upload: (directory: string, digest: string, assertOwnership: () => void) => Promise<T>;
}): Promise<T> {
  const scope = input.scope;
  const platform = new URL(scope.platform);
  if (platform.username || platform.password || platform.search || platform.hash || !['http:', 'https:'].includes(platform.protocol)) fail('RECOVERY_SCOPE_INVALID', '恢复目标无效');
  for (const value of [scope.tenantId, scope.userId, scope.appCode, scope.environmentKey, scope.configurationDigest, scope.toolchainVersion]) {
    if (typeof value !== 'string' || !value || value.length > 256) fail('RECOVERY_SCOPE_INVALID', '恢复身份不完整');
  }
  const root = realpathSync(input.root);
  const dockerfile = join(root, relative(resolve(input.root), input.dockerfile));
  const contextDigest = await backendImageContextDigest(root, dockerfile);
  const key = createHash('sha256').update(JSON.stringify([SCHEMA, root, relative(root, input.dockerfile), platform.href.replace(/\/+$/, ''),
    scope.tenantId, scope.userId, scope.appCode, scope.environmentKey, scope.environmentId ?? '', scope.configurationDigest, scope.toolchainVersion, contextDigest])).digest('hex');
  const cacheRoot = resolve(input.cacheRoot || join(realpathSync(homedir()), '.openxiangda', 'cache', 'backend-images'));
  if (cacheRoot === root || cacheRoot.startsWith(`${root}/`)) fail('CACHE_PATH_INVALID', '镜像缓存不能进入 Docker 构建上下文');
  for (let path = cacheRoot; path !== dirname(path); path = dirname(path)) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail('CACHE_PATH_INVALID', '镜像缓存路径不能经过符号链接');
  }
  if (!Number.isSafeInteger(input.maxImageBytes) || input.maxImageBytes < 1 || input.maxImageBytes > MAX_BYTES) fail('CACHE_LIMIT', '当前候选超过 8 GiB 本机恢复预算');
  const selected = await acquireCandidate(cacheRoot, key, Math.min(CANDIDATE_BYTES, input.maxImageBytes));
  const directory = join(selected.directory, 'image');
  let sealed = selected.candidate.state === 'sealed';
  try {
    if (!sealed) {
      rmSync(directory, { recursive: true, force: true });
      await input.build(directory);
      selected.owned.assert();
      if (await backendImageContextDigest(root, dockerfile) !== contextDigest) fail('CONTEXT_CHANGED', '构建期间源码发生变化，未上传混合候选；保存后重试');
      const inspected = await inspectBackendOciLayout({ directory, maxImageBytes: selected.candidate.reservedBytes });
      selected.candidate = { ...selected.candidate, state: 'sealed', digest: inspected.digest };
      saveCandidate(selected.directory, selected.candidate);
      sealed = true;
    }
    selected.owned.assert();
    const result = await input.upload(directory, selected.candidate.digest!, selected.owned.assert);
    // A local cleanup error must never turn a confirmed remote success into a failure.
    try { await removeOwnedCandidate(cacheRoot, selected.directory, selected.owned); } catch { /* bounded cache will reclaim it */ }
    return result;
  } catch (error) {
    if (!sealed) {
      try { await removeOwnedCandidate(cacheRoot, selected.directory, selected.owned); } catch { /* retain incomplete state for the next owner */ }
      throw error;
    }
    const failure = backendImageUploadFailure(error);
    throw new BackendImageCandidateError('OPENXIANGDA_BACKEND_IMAGE_UPLOAD_PENDING',
      failure.message,
      { candidateId: key, digest: selected.candidate.digest, expiresAt: new Date(selected.candidate.createdAt + TTL).toISOString(),
        nextCommand: 'pnpm openxiangda deploy', remediation: failure.remediation,
        causeCode: failure.causeCode, ...(failure.causeDetails ? { causeDetails: failure.causeDetails } : {}) }, failure.retryable);
  } finally { await selected.owned.release(); }
}
