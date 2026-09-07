import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pinnedLegacyEngine, seedReferenceLegacyEngine } from '../lib/reference-legacy-engine.mjs';

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'reference-legacy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bytes = Buffer.from('immutable legacy fixture bytes');
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  mkdirSync(join(root, 'packages/openxiangda'), { recursive: true });
  writeFileSync(join(root, 'packages/openxiangda/package.json'), JSON.stringify({ dependencies: { 'openxiangda-legacy': options.alias || 'npm:openxiangda@1.0.268' } }));
  writeFileSync(join(root, 'pnpm-lock.yaml'), `packages:\n  openxiangda@1.0.268:\n    resolution: {integrity: ${integrity}}\nsnapshots:\n  openxiangda@1.0.268:\n    dependencies: {}\n`);
  const metadata = { name: 'openxiangda', version: '1.0.268', publishConfig: { registry: 'https://registry.npmjs.org/' }, dist: { integrity, tarball: 'https://registry.npmjs.org/openxiangda/-/openxiangda-1.0.268.tgz' } };
  const writes = [];
  const fetchImpl = async (url, init = {}) => {
    if (init.method === 'PUT') {
      writes.push({ url, body: JSON.parse(init.body) });
      return new Response('{}', { status: 201 });
    }
    if (url.endsWith('.tgz')) return new Response(options.corrupt ? 'changed bytes' : bytes);
    return Response.json(options.metadataMismatch ? { ...metadata, version: '2.0.0' } : metadata);
  };
  return { root, bytes, integrity, writes, fetchImpl };
}

test('seeds exact original legacy bytes only into loopback and preserves the locked digest', async t => {
  const f = fixture(t);
  const result = await seedReferenceLegacyEngine({ repositoryRoot: f.root, registryUrl: 'http://127.0.0.1:12345', registryToken: 'test-only', fetchImpl: f.fetchImpl });
  assert.equal(result.integrity, f.integrity);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].url, 'http://127.0.0.1:12345/openxiangda');
  const doc = f.writes[0].body;
  assert.deepEqual(doc['dist-tags'], { 'legacy-v1': '1.0.268' });
  assert.deepEqual(Buffer.from(doc._attachments['openxiangda-1.0.268.tgz'].data, 'base64'), f.bytes);
  assert.equal(doc.versions['1.0.268'].dist.integrity, f.integrity);
});

test('rejects ranges, remote write targets and changed metadata or bytes before publication', async t => {
  const ranged = fixture(t, { alias: 'npm:openxiangda@^1.0.268' });
  assert.throws(() => pinnedLegacyEngine(ranged.root), /EXACT_VERSION_REQUIRED/);
  const safe = fixture(t);
  for (const registryUrl of ['https://registry.npmjs.org', 'http://example.com:4873', 'http://127.0.0.1:4873/elsewhere']) {
    await assert.rejects(seedReferenceLegacyEngine({ repositoryRoot: safe.root, registryUrl, fetchImpl: safe.fetchImpl }), /LOCAL_REGISTRY_REQUIRED/);
  }
  for (const options of [{ corrupt: true }, { metadataMismatch: true }]) {
    const f = fixture(t, options);
    await assert.rejects(seedReferenceLegacyEngine({ repositoryRoot: f.root, registryUrl: 'http://127.0.0.1:4873', fetchImpl: f.fetchImpl }), /MISMATCH/);
    assert.equal(f.writes.length, 0);
  }
});
