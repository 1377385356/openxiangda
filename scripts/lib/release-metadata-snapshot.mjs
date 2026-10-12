import { execFile, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PACKAGE_NAMES } from './public-package-policy.mjs';
import { releaseNpmEnvironment } from './release-network-policy.mjs';

const active = new Set();
function stopReads(children = active) {
  for (const child of children) {
    try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch {}
  }
}

export async function queryReleaseMetadata({cwd, registry, names, concurrency = 3, timeoutMs = 60_000, batchTimeoutMs = 200_000, query} = {}) {
  if (!Array.isArray(names) || !names.length || names.length > 7 || new Set(names).size !== names.length || names.some(n => !PUBLIC_PACKAGE_NAMES.includes(n))) throw new Error('RELEASE_METADATA_INVENTORY_INVALID');
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('RELEASE_METADATA_BUDGET_INVALID');
  if (!Number.isSafeInteger(batchTimeoutMs) || batchTimeoutMs < 1 || batchTimeoutMs > 200_000 || (query !== undefined && typeof query !== 'function')) throw new Error('RELEASE_METADATA_BUDGET_INVALID');
  const endpoint = new URL(registry);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('RELEASE_METADATA_REGISTRY_INVALID');
  const started = performance.now();
  const children = new Set();
  let cursor = 0, failure, running = 0, peak = 0;
  const entries = new Array(names.length);
  const runQuery = query || (name => new Promise((resolve, reject) => {
    const child = execFile('npm', ['view', name, 'versions', 'dist-tags', '--json', '--prefer-online', '--registry', registry],
      {cwd, env: releaseNpmEnvironment(), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024*1024, killSignal: 'SIGKILL', detached: process.platform !== 'win32'},
      (error, stdout, stderr) => {
        active.delete(child);
        children.delete(child);
        if (error) {
          try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch {}
          // Registry E404 is an absence fact; do not classify auth/network as absence.
          if (error.code === 1 && /\bE404\b|\b404 Not Found\b|is not in this registry/i.test(`${stdout}\n${stderr}`) && !error.killed) return resolve({versions: [], 'dist-tags': {}});
          const npmCode = `${stdout}\n${stderr}`.match(/\b(?:E401|E403|E404|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNRESET)\b/)?.[0];
          return reject(new Error(`RELEASE_METADATA_QUERY_FAILED:${name}:${error.killed ? 'timeout-or-output-budget' : npmCode || String(error.code || 'unknown').replace(/[^a-zA-Z0-9_-]/g,'')}`));
        }
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error(`RELEASE_METADATA_JSON_INVALID:${name}`)); }
      });
    active.add(child);
    children.add(child);
  }));
  async function worker() {
    while (!failure && cursor < names.length) {
      const index = cursor++, name = names[index], begin = performance.now();
      running++; peak = Math.max(peak, running);
      try {
        const value = await runQuery(name);
        const versions = typeof value?.versions === 'string' ? [value.versions] : value?.versions;
        const tags = value?.['dist-tags'];
        if (!Array.isArray(versions) || versions.length > 20_000 || versions.some(v => typeof v !== 'string' || !v || v.length > 128) || !tags || typeof tags !== 'object' || Array.isArray(tags) || Object.keys(tags).length > 128 || Object.entries(tags).some(([k,v]) => k.length > 128 || typeof v !== 'string' || !v || v.length > 128)) throw new Error(`RELEASE_METADATA_SHAPE_INVALID:${name}`);
        entries[index] = {name, versions, distTags: tags, observedAt: new Date().toISOString(), elapsedMs: performance.now()-begin};
      } catch (error) { failure ||= error; stopReads(children); }
      finally { running--; }
    }
  }
  let timer;
  try {
    await Promise.race([
      Promise.all(Array.from({length: Math.min(concurrency, names.length)}, worker)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          failure ||= new Error('RELEASE_METADATA_BATCH_TIMEOUT');
          stopReads(children);
          reject(failure);
        }, batchTimeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
  if (failure) throw failure;
  return {schemaVersion: 'openxiangda.release-metadata/v1', registry, concurrency, peakActive: peak, elapsedMs: performance.now()-started, budget: {queryTimeoutMs: timeoutMs, batchTimeoutMs}, entries};
}

export function readReleaseMetadataSnapshot(cwd, registry, names, {concurrency = 3} = {}) {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {cwd, input: JSON.stringify({cwd, registry, names, concurrency}), encoding:'utf8', timeout:200_000, maxBuffer:8*1024*1024, killSignal:'SIGTERM', env:releaseNpmEnvironment()});
  if (result.error || result.status !== 0) throw new Error(String(result.stderr || 'RELEASE_METADATA_BATCH_FAILED').trim());
  return JSON.parse(result.stdout);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.on('SIGTERM', () => {stopReads(); process.exit(1);});
  process.on('SIGINT', () => {stopReads(); process.exit(1);});
  process.on('exit', () => stopReads());
  let input = '';
  for await (const chunk of process.stdin) {input += chunk; if (input.length > 8192) throw new Error('RELEASE_METADATA_INPUT_EXCEEDED');}
  try { process.stdout.write(JSON.stringify(await queryReleaseMetadata(JSON.parse(input)))+'\n'); }
  catch (error) {process.stderr.write(error.message+'\n'); process.exitCode=1;}
}
