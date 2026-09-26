import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { backendImageContextDigest, withBackendImageCandidate, type BackendImageRecoveryScope } from '../src/backend-image-candidate.js';
import { publishBackendImage } from '../src/backend-image-build.js';
import { OpenXiangdaControlPlaneClient } from '../src/control-plane-client.js';
import { uploadBackendOciLayout, type BackendImageUploader, type BackendImageUploadReceipt } from '../src/backend-image-upload.js';

const hash = (value: string | Uint8Array) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const scope: BackendImageRecoveryScope = { platform: 'https://platform.example/service', tenantId: 't1', userId: 'u1',
  appCode: 'demo', environmentKey: 'preproduction', configurationDigest: hash('configuration'), toolchainVersion: '2.test' };
function fixture() {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'oxa-image-recovery-')));
  const root = join(temporary, 'workspace');
  const cacheRoot = join(temporary, 'cache');
  const layout = join(temporary, 'fixture-image');
  mkdirSync(join(root, 'apps/server'), { recursive: true });
  mkdirSync(join(layout, 'blobs/sha256'), { recursive: true });
  mkdirSync(join(layout, 'ingest')); // actual Buildx/containerd OCI output includes this empty directory
  const dockerfile = join(root, 'apps/server/Dockerfile');
  writeFileSync(dockerfile, 'FROM scratch\n');
  writeFileSync(join(root, '.dockerignore'), '.git\nnode_modules\n');
  writeFileSync(join(root, 'apps/server/main.ts'), 'initial source');
  const blobs = [Buffer.from('{"os":"linux","architecture":"amd64"}'), Buffer.alloc(1024, 42)];
  const descriptors = blobs.map(blob => ({ digest: hash(blob), size: blob.length }));
  const manifest = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: descriptors[0], layers: descriptors.slice(1) });
  const digest = hash(manifest);
  for (const blob of [...blobs, Buffer.from(manifest)]) writeFileSync(join(layout, 'blobs/sha256', hash(blob).slice(7)), blob);
  writeFileSync(join(layout, 'oci-layout'), JSON.stringify({ imageLayoutVersion: '1.0.0' }));
  writeFileSync(join(layout, 'index.json'), JSON.stringify({ schemaVersion: 2, manifests: [{ digest, size: Buffer.byteLength(manifest) }] }));
  const receipt: BackendImageUploadReceipt = { digest, status: 'uploading', reference: null, maxChunkBytes: 8 * 1024 ** 2,
    sizeBytes: blobs.reduce((total, blob) => total + blob.length, Buffer.byteLength(manifest)),
    blobs: descriptors.map(blob => ({ ...blob, offset: 0, complete: false })) };
  const marker = join(temporary, 'builds');
  const docker = join(temporary, 'docker');
  writeFileSync(docker, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if(args[1] === 'version') process.exit(0);
fs.appendFileSync(${JSON.stringify(marker)}, 'build\\n');
fs.cpSync(${JSON.stringify(layout)}, /dest=([^,]+)/.exec(args[args.indexOf('--output')+1])[1], { recursive: true });
`, { mode: 0o755 });
  const input = { root, dockerfile, scope, maxImageBytes: 1024 ** 2, cacheRoot,
    build: async (directory: string) => { cpSync(layout, directory, { recursive: true }); } };
  const publish = { root, backendRoot: 'apps/server', target: { repository: 'openxiangda-local/demo-server', platform: 'linux/amd64' as const,
    upload: { appCode: 'demo', maxImageBytes: 1024 ** 2 } }, recoveryScope: scope, candidateCacheRoot: cacheRoot, dockerExecutable: docker };
  const entries = () => readdirSync(cacheRoot).filter(name => /^[a-f0-9]{64}$/.test(name));
  return { temporary, root, cacheRoot, layout, dockerfile, docker, marker, digest, receipt, input, publish, entries,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }) };
}

function transport(sample: ReturnType<typeof fixture>) {
  let failChunk = false, failCompletion = false, ready = false, beginCalls = 0, chunkCalls = 0;
  const offsets = new Map<string, number>();
  const uploader: BackendImageUploader = {
    async beginBackendImage(app, input) {
      assert.equal(app, scope.appCode); assert.equal(input.digest, sample.digest); beginCalls++;
      return { ...sample.receipt, status: ready ? 'ready' : 'uploading', reference: ready ? `registry.example/demo@${sample.digest}` : null,
        blobs: sample.receipt.blobs.map(blob => ({ ...blob, offset: offsets.get(blob.digest) || 0, complete: offsets.get(blob.digest) === blob.size })) };
    },
    async uploadBackendImageChunk(_app, digest, blob, offset, content) {
      assert.equal(digest, sample.digest); chunkCalls++;
      const saved = offsets.get(blob) || 0;
      if (offset === saved) offsets.set(blob, saved + content.length);
      if (failChunk) throw Object.assign(new Error('EPIPE token=do-not-leak'), { status: 503, retryable: true, code: 'EPIPE' });
      const next = offsets.get(blob)!;
      return { offset: next, complete: next === sample.receipt.blobs.find(x => x.digest === blob)!.size };
    },
    async completeBackendImage() {
      ready = true;
      if (failCompletion) throw Object.assign(new Error('lost reply'), { status: 503, retryable: true, code: 'ECONNRESET' });
      return { ...sample.receipt, status: 'ready', reference: `registry.example/demo@${sample.digest}` };
    },
  };
  return { uploader, failChunks: (value: boolean) => { failChunk = value; }, failCompletions: (value: boolean) => { failCompletion = value; },
    counters: () => ({ beginCalls, chunkCalls }), offsets };
}

test('a new publish call resumes saved offsets and original digest without Docker after repeated transport failure', async () => {
  const sample = fixture();
  try {
    const remote = transport(sample); remote.failChunks(true);
    let recovery: any;
    await assert.rejects(publishBackendImage({ ...sample.publish, uploader: remote.uploader }), error => {
      recovery = error;
      assert.equal(recovery.code, 'OPENXIANGDA_BACKEND_IMAGE_UPLOAD_PENDING');
      assert.equal(recovery.data.digest, sample.digest);
      assert.equal(recovery.data.causeCode, 'EPIPE');
      assert.equal(JSON.stringify(recovery).includes('do-not-leak'), false);
      return true;
    });
    assert.equal(readFileSync(sample.marker, 'utf8'), 'build\n');
    assert.equal(sample.entries().length, 1);
    rmSync(sample.docker); // resume cannot silently rebuild a different artifact
    remote.failChunks(false);
    const result = await publishBackendImage({ ...sample.publish, uploader: remote.uploader });
    assert.equal(result.digest, sample.digest);
    assert.equal(remote.counters().beginCalls, 2);
    assert.equal(sample.entries().length, 0);
    assert.equal(readFileSync(sample.marker, 'utf8'), 'build\n');
  } finally { sample.cleanup(); }
});

test('unknown completion recovers the already ready artifact without repeating chunks or build', async () => {
  const sample = fixture();
  try {
    const remote = transport(sample); remote.failCompletions(true);
    await assert.rejects(publishBackendImage({ ...sample.publish, uploader: remote.uploader }), /UPLOAD_PENDING/);
    const before = remote.counters().chunkCalls;
    rmSync(sample.docker);
    const result = await publishBackendImage({ ...sample.publish, uploader: remote.uploader });
    assert.equal(result.digest, sample.digest);
    assert.equal(remote.counters().chunkCalls, before);
    assert.equal(readFileSync(sample.marker, 'utf8'), 'build\n');
  } finally { sample.cleanup(); }
});

test('dirty content, platform, tenant, actor, environment, config and tool identity do not share candidates', async () => {
  const sample = fixture();
  try {
    const keys = new Set<string>();
    const keep = async (nextScope = scope) => {
      await assert.rejects(withBackendImageCandidate({ ...sample.input, scope: nextScope,
        upload: async () => { throw Object.assign(new Error('offline'), { code: 'OFFLINE' }); } }), (error: any) => {
        assert.equal(error.code, 'OPENXIANGDA_BACKEND_IMAGE_UPLOAD_PENDING');
        assert.equal(keys.has(error.data.candidateId), false); keys.add(error.data.candidateId); return true;
      });
    };
    await keep();
    for (const partial of [{ platform: 'https://other.example/service' }, { tenantId: 't2' }, { userId: 'u2' },
      { environmentKey: 'production' }, { environmentId: 'second' }, { configurationDigest: hash('other') }, { toolchainVersion: 'new' }]) await keep({ ...scope, ...partial });
    writeFileSync(join(sample.root, 'apps/server/main.ts'), 'dirty, same Git commit');
    await keep();
    assert.equal(keys.size, 9);
    assert.equal(sample.entries().length, 8); // bounded LRU of inactive candidates
  } finally { sample.cleanup(); }
});

test('tampered blobs and symlinked OCI directories are rejected before any network write', async () => {
  const sample = fixture();
  try {
    await assert.rejects(withBackendImageCandidate({ ...sample.input, upload: async () => { throw new Error('offline'); } }), /UPLOAD_PENDING/);
    const image = join(sample.cacheRoot, sample.entries()[0]!, 'image');
    const blob = join(image, 'blobs/sha256', sample.receipt.blobs[0]!.digest.slice(7));
    writeFileSync(blob, Buffer.alloc(sample.receipt.blobs[0]!.size, 1));
    const remote = transport(sample);
    await assert.rejects(publishBackendImage({ ...sample.publish, uploader: remote.uploader }), (error: any) => error.data.causeCode === 'OPENXIANGDA_BACKEND_IMAGE_UPLOAD_INVALID');
    assert.equal(remote.counters().beginCalls, 0);
    rmSync(image, { recursive: true }); symlinkSync(sample.layout, image);
    await assert.rejects(publishBackendImage({ ...sample.publish, uploader: remote.uploader }), /UPLOAD_PENDING/);
    assert.equal(remote.counters().beginCalls, 0);
  } finally { sample.cleanup(); }
});

test('one candidate holds a cross-call lease while unrelated cleanup leaves it intact', async () => {
  const sample = fixture();
  try {
    let started!: () => void, finish!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const first = withBackendImageCandidate({ ...sample.input, upload: async () => { started(); await gate; return 'done'; } });
    await began;
    await assert.rejects(withBackendImageCandidate({ ...sample.input, upload: async () => 'wrong' }), /IMAGE_BUSY/);
    const key = sample.entries()[0]!;
    for (let i = 0; i < 9; i++) await assert.rejects(withBackendImageCandidate({ ...sample.input, scope: { ...scope, userId: `other-${i}` }, upload: async () => { throw new Error('offline'); } }), /UPLOAD_PENDING/);
    assert.ok(existsSync(join(sample.cacheRoot, key, 'image')));
    finish(); assert.equal(await first, 'done');
  } finally { sample.cleanup(); }
});

test('expired incomplete candidates rebuild while stale process leases recover sealed bytes', async () => {
  const sample = fixture();
  try {
    await assert.rejects(withBackendImageCandidate({ ...sample.input, upload: async () => { throw new Error('offline'); } }), /UPLOAD_PENDING/);
    const key = sample.entries()[0]!;
    const record = join(sample.cacheRoot, key, 'candidate.json');
    const leasePath = join(sample.cacheRoot, `${key}.lock`);
    mkdirSync(leasePath); const old = new Date(Date.now() - 360_000); utimesSync(leasePath, old, old);
    const result = await withBackendImageCandidate({ ...sample.input, build: async () => { throw new Error('must reuse'); }, upload: async () => 'recovered' });
    assert.equal(result, 'recovered');
    await assert.rejects(withBackendImageCandidate({ ...sample.input, upload: async () => { throw new Error('offline'); } }), /UPLOAD_PENDING/);
    const candidate = JSON.parse(readFileSync(record, 'utf8')); candidate.createdAt = Date.now() - 25 * 60 * 60_000;
    writeFileSync(record, JSON.stringify(candidate));
    let rebuilt = false;
    await withBackendImageCandidate({ ...sample.input, build: async directory => { rebuilt = true; await sample.input.build(directory); }, upload: async () => 'rebuilt' });
    assert.equal(rebuilt, true);
  } finally { sample.cleanup(); }
});

test('Docker ignore precedence, exceptions, case, modes and symlink targets participate in context binding', async () => {
  const sample = fixture();
  try {
    mkdirSync(join(sample.root, 'node_modules'), { recursive: true }); writeFileSync(join(sample.root, 'node_modules/ignored'), 'old');
    const original = await backendImageContextDigest(sample.root, sample.dockerfile);
    writeFileSync(join(sample.root, 'node_modules/ignored'), 'changed');
    assert.equal(await backendImageContextDigest(sample.root, sample.dockerfile), original);
    writeFileSync(join(sample.root, '.dockerignore'), 'node_modules\n!node_modules/included\n');
    writeFileSync(join(sample.root, 'node_modules/included'), 'included');
    const withException = await backendImageContextDigest(sample.root, sample.dockerfile);
    writeFileSync(join(sample.root, 'node_modules/included'), 'new');
    assert.notEqual(await backendImageContextDigest(sample.root, sample.dockerfile), withException);
    writeFileSync(`${sample.dockerfile}.dockerignore`, 'node_modules\n');
    const specific = await backendImageContextDigest(sample.root, sample.dockerfile);
    writeFileSync(join(sample.root, 'node_modules/included'), 'new again');
    assert.equal(await backendImageContextDigest(sample.root, sample.dockerfile), specific);
    chmodSync(join(sample.root, 'apps/server/main.ts'), 0o700);
    assert.notEqual(await backendImageContextDigest(sample.root, sample.dockerfile), specific);
    symlinkSync('apps/server/main.ts', join(sample.root, 'pointer'));
    const linked = await backendImageContextDigest(sample.root, sample.dockerfile);
    rmSync(join(sample.root, 'pointer')); symlinkSync('apps/server/Dockerfile', join(sample.root, 'pointer'));
    assert.notEqual(await backendImageContextDigest(sample.root, sample.dockerfile), linked);
  } finally { sample.cleanup(); }
});

test('source drift during a build and malformed cache metadata fail before upload', async () => {
  const sample = fixture();
  try {
    let uploads = 0;
    await assert.rejects(withBackendImageCandidate({ ...sample.input, build: async directory => {
      await sample.input.build(directory); writeFileSync(join(sample.root, 'apps/server/main.ts'), 'edited concurrently');
    }, upload: async () => { uploads++; } }), /CONTEXT_CHANGED/);
    assert.equal(uploads, 0);
    await assert.rejects(withBackendImageCandidate({ ...sample.input, upload: async () => { throw new Error('offline'); } }), /UPLOAD_PENDING/);
    const record = join(sample.cacheRoot, sample.entries()[0]!, 'candidate.json');
    writeFileSync(record, '{}');
    await assert.rejects(withBackendImageCandidate({ ...sample.input, upload: async () => { uploads++; } }), /CACHE_INVALID/);
    assert.equal(uploads, 0);
  } finally { sample.cleanup(); }
});

test('active reserved capacity cannot be evicted and cleanup failure preserves confirmed success', async () => {
  const sample = fixture();
  try {
    let started!: () => void, finish!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const first = withBackendImageCandidate({ ...sample.input, maxImageBytes: 8 * 1024 ** 3,
      upload: async () => { started(); await gate; return 'ready'; } });
    await began;
    await assert.rejects(withBackendImageCandidate({ ...sample.input, scope: { ...scope, userId: 'other' }, upload: async () => 'incorrect' }), /CACHE_FULL/);
    finish(); assert.equal(await first, 'ready');
    const result = await withBackendImageCandidate({ ...sample.input, upload: async () => {
      mkdirSync(join(sample.cacheRoot, '.registry.lock'));
      return 'remote succeeded';
    } });
    assert.equal(result, 'remote succeeded');
    assert.equal(sample.entries().length, 1);
    rmSync(join(sample.cacheRoot, '.registry.lock'), { recursive: true });
  } finally { sample.cleanup(); }
});

test('upload identity comes from current whoami and rejects incomplete identities', async () => {
  let valid = true;
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.example/service', token: 'secret-not-persisted', fetch: async (url, init) => {
    assert.equal(String(url), 'https://platform.example/service/openxiangda-api/v2/auth/whoami');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer secret-not-persisted');
    return Response.json({ code: 200, message: 'success', data: valid ? { user: { id: 'u1', name: 'not-retained' }, tenant: { id: 't1' } } : { user: null } });
  } });
  assert.deepEqual(await client.backendImageUploadIdentity(), { platform: scope.platform, tenantId: 't1', userId: 'u1' });
  valid = false;
  await assert.rejects(client.backendImageUploadIdentity(), (error: any) => error.code === 'OPENXIANGDA_BACKEND_IMAGE_IDENTITY_REQUIRED');
});
