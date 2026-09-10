import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const schema = 'openxiangda.release-stage/v1';
const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const generatedDirectories = new Set(['node_modules', '.git', '.turbo', 'dist', 'coverage', 'test-results', 'playwright-report', '.openxiangda']);

export function hashTree(root, { ignore = () => false, transform = (_, content) => content } = {}) {
  const hash = createHash('sha256');
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      const path = relative(root, file).replaceAll('\\', '/');
      if (ignore(path, name)) continue;
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) hash.update(canonical([path, 'link', readlinkSync(file)]));
      else if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) hash.update(canonical([path, stat.mode & 0o777, digest(transform(path, readFileSync(file)))]));
    }
  }
  visit(root);
  return hash.digest('hex');
}

export function runtimePackageFingerprint(root) {
  return hashTree(root, {
    ignore: path => /^(documentation|skills|launcher-skill|releases)\//.test(path)
      || /^(README|CHANGELOG|LICENSE)(?:\.[^/]+)?$/.test(path),
    transform: (path, content) => {
      if (path !== 'package.json') return content;
      const manifest = JSON.parse(content);
      delete manifest.openxiangdaRelease; // Validated separately by packaged-content checks.
      return canonical(manifest);
    },
  });
}

export function normalizeCandidateReferences(content, packages, applicationRoot) {
  let result = content;
  for (const item of [...packages].sort((a, b) => a.name.localeCompare(b.name))) {
    const tarball = realpathSync(item.tarball);
    const paths = [item.tarball, tarball, relative(applicationRoot, item.tarball), relative(realpathSync(applicationRoot), tarball)]
      .sort((a, b) => b.length - a.length);
    for (const path of new Set(paths)) result = result.split(path).join(`candidate/${item.name}.tgz`);
    const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
    // Replaced only for exact candidate bytes. External registry integrities stay
    // intact; the corresponding candidate runtime digest is part of the key.
    result = result.split(integrity).join(`candidate-integrity/${item.name}`);
  }
  return result;
}

export function browserStageFingerprint({ applicationRoot, packages, runnerRoot, env = process.env }) {
  const normalize = content => normalizeCandidateReferences(content, packages, applicationRoot);
  return digest(canonical({
    schema, stage: 'packed-browser',
    runtime: { node: process.versions.node, platform: process.platform, arch: process.arch },
    environment: Object.fromEntries(Object.entries(env).filter(([key]) => /^(PLAYWRIGHT_|OPENXIANGDA_E2E_|OPENXIANGDA_LIVE_|TZ$|NODE_OPTIONS$|LANG$|CI$)/.test(key))),
    application: hashTree(applicationRoot, {
      ignore: (path, name) => generatedDirectories.has(name) || path === 'pnpm-lock.yaml',
      transform: (path, content) => path.endsWith('package.json') ? normalize(content.toString('utf8')) : content,
    }),
    installedDependencies: normalize(readFileSync(join(applicationRoot, 'pnpm-lock.yaml'), 'utf8')),
    packages: packages.map(item => ({ name: item.name, runtime: runtimePackageFingerprint(item.root) })).sort((a, b) => a.name.localeCompare(b.name)),
    runners: hashTree(runnerRoot, { ignore: (_, name) => generatedDirectories.has(name) }),
  }));
}

export function canReuseBrowserStage(env = process.env) {
  return env.OPENXIANGDA_RELEASE_STAGE_CACHE !== 'false'
    && env.OPENXIANGDA_RELEASE_FULL_VALIDATION !== '1'
    && !Object.entries(env).some(([key, value]) => value && (
      /^OPENXIANGDA_LIVE_/.test(key) && value !== '0'
      || /^OPENXIANGDA_E2E_(?:PLATFORM_URL|BASE_URL)$/.test(key)
      || /^PLAYWRIGHT_(?:CHROMIUM_EXECUTABLE_PATH|SKIP_BROWSER_DOWNLOAD)$/.test(key)));
}

export function runCachedStage({ directory, stage, fingerprint, execute, currentFingerprint = () => fingerprint, enabled = true, now = Date.now, report = console.log }) {
  if (!/^[a-z0-9-]+$/.test(stage) || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('RELEASE_STAGE_ID_INVALID');
  const file = join(directory, `${stage}-${fingerprint}.json`);
  let receipt;
  try { receipt = JSON.parse(readFileSync(file, 'utf8')); } catch { /* Cache miss. */ }
  if (enabled && receipt?.schema === schema && receipt.status === 'passed' && receipt.fingerprint === fingerprint
      && receipt.stage === stage && Date.parse(receipt.completedAt) <= now() && Date.parse(receipt.expiresAt) > now()) {
    report(`[release-stage] ${stage}: reused (${Math.round(receipt.elapsedMs / 1000)}s saved)`);
    return { reused: true, receipt };
  }
  rmSync(file, { force: true }); // A forced recheck failure must invalidate an older pass.
  const started = now();
  const result = execute();
  if (result?.then) throw new Error('RELEASE_STAGE_EXECUTOR_MUST_BE_SYNCHRONOUS');
  if (currentFingerprint() !== fingerprint) throw new Error('RELEASE_STAGE_INPUTS_CHANGED');
  const completedAt = now();
  receipt = { schema, stage, fingerprint, status: 'passed', elapsedMs: completedAt - started,
    completedAt: new Date(completedAt).toISOString(), expiresAt: new Date(completedAt + 24 * 3600_000).toISOString() };
  // A failed execute never reaches the receipt write.
  mkdirSync(directory, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
  report(`[release-stage] ${stage}: passed (${Math.round(receipt.elapsedMs / 1000)}s)`);
  return { reused: false, receipt };
}
