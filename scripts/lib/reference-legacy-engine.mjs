import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageIntegrity } from './reference-lock-integrity.mjs';

export function pinnedLegacyEngine(repositoryRoot) {
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'packages/openxiangda/package.json'), 'utf8'));
  const alias = manifest.dependencies?.['openxiangda-legacy'];
  const match = /^npm:openxiangda@(1\.\d+\.\d+)$/.exec(alias || '');
  if (!match) throw new Error('REFERENCE_LEGACY_EXACT_VERSION_REQUIRED');
  const version = match[1];
  const integrity = packageIntegrity(readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8'), `openxiangda@${version}`);
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity || '')) throw new Error('REFERENCE_LEGACY_LOCK_INTEGRITY_REQUIRED');
  return { name: 'openxiangda', version, integrity };
}

export async function seedReferenceLegacyEngine({ repositoryRoot, registryUrl, registryToken, fetchImpl = fetch }) {
  const target = new URL(registryUrl);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || !target.port || target.pathname !== '/' || target.search || target.hash || target.username || target.password) {
    throw new Error('REFERENCE_LEGACY_LOCAL_REGISTRY_REQUIRED');
  }
  const pinned = pinnedLegacyEngine(repositoryRoot);
  const metadata = JSON.parse((await boundedRead(fetchImpl, `https://registry.npmjs.org/openxiangda/${pinned.version}`, 2 * 1024 * 1024)).toString('utf8'));
  if (metadata.name !== pinned.name || metadata.version !== pinned.version || metadata.dist?.integrity !== pinned.integrity) throw new Error('REFERENCE_LEGACY_METADATA_MISMATCH');
  const filename = `openxiangda-${pinned.version}.tgz`;
  if (metadata.dist?.tarball !== `https://registry.npmjs.org/openxiangda/-/${filename}`) throw new Error('REFERENCE_LEGACY_TARBALL_URL_INVALID');
  const bytes = await boundedRead(fetchImpl, metadata.dist.tarball, 16 * 1024 * 1024);
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== pinned.integrity) throw new Error('REFERENCE_LEGACY_TARBALL_INTEGRITY_MISMATCH');
  const document = {
    _id: pinned.name,
    name: pinned.name,
    'dist-tags': { 'legacy-v1': pinned.version },
    versions: { [pinned.version]: { ...metadata, dist: { ...metadata.dist, tarball: `${target.origin}/openxiangda/-/${filename}` } } },
    _attachments: { [filename]: { content_type: 'application/octet-stream', data: bytes.toString('base64'), length: bytes.length } },
  };
  const response = await fetchImpl(`${target.origin}/openxiangda`, {
    method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registryToken}` },
    body: JSON.stringify(document),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`REFERENCE_LEGACY_SEED_FAILED:${response.status}`);
  const actual = JSON.parse((await boundedRead(fetchImpl, `${target.origin}/openxiangda/${pinned.version}`, 2 * 1024 * 1024)).toString('utf8'));
  if (actual.name !== pinned.name || actual.version !== pinned.version || actual.dist?.integrity !== pinned.integrity) throw new Error('REFERENCE_LEGACY_READBACK_MISMATCH');
  return pinned;
}

async function boundedRead(fetchImpl, url, limit) {
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`REFERENCE_LEGACY_DOWNLOAD_FAILED:${response.status}`); }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('REFERENCE_LEGACY_DOWNLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
