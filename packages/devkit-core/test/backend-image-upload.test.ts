import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { backendImageBuildTarget, publishBackendImage } from '../src/backend-image-build.js';
import { uploadBackendOciLayout, type BackendImageUploader, type BackendImageUploadReceipt } from '../src/backend-image-upload.js';

const chunkBytes = 8 * 1024 * 1024;
const digestOf = (content: Buffer | string) => `sha256:${createHash('sha256').update(content).digest('hex')}`;

function fixture(layerBytes = 1234) {
  const root = mkdtempSync(join(tmpdir(), 'oxa-image-upload-test-'));
  const directory = join(root, 'layout');
  mkdirSync(join(directory, 'blobs/sha256'), { recursive: true });
  const config = Buffer.from(JSON.stringify({ os: 'linux', architecture: 'amd64' }));
  const layer = Buffer.alloc(layerBytes, 41);
  const descriptor = (content: Buffer, mediaType: string) => ({ digest: digestOf(content), size: content.length, mediaType });
  const image = { schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: descriptor(config, 'application/vnd.oci.image.config.v1+json'),
    layers: [descriptor(layer, 'application/vnd.oci.image.layer.v1.tar+gzip')] };
  const manifest = JSON.stringify(image);
  const digest = digestOf(manifest);
  const blobs = new Map([[image.config.digest, config], [image.layers[0]!.digest, layer]]);
  for (const [hash, content] of [...blobs, [digest, Buffer.from(manifest)] as const]) {
    writeFileSync(join(directory, 'blobs/sha256', hash.slice(7)), content);
  }
  writeFileSync(join(directory, 'oci-layout'), JSON.stringify({ imageLayoutVersion: '1.0.0' }));
  writeFileSync(join(directory, 'index.json'), JSON.stringify({ schemaVersion: 2,
    manifests: [{ digest, size: Buffer.byteLength(manifest), mediaType: image.mediaType }] }));
  const receipt: BackendImageUploadReceipt = { digest, status: 'uploading', reference: null,
    sizeBytes: config.length + layer.length + Buffer.byteLength(manifest), maxChunkBytes: chunkBytes,
    blobs: [...blobs].map(([hash, content]) => ({ digest: hash, size: content.length, offset: 0, complete: false })) };
  return { root, directory, image, digest, blobs, receipt,
    cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function uploader(sample: ReturnType<typeof fixture>, loseResponse = false): BackendImageUploader {
  const stored = new Map<string, Buffer>();
  let lost = false;
  return {
    async beginBackendImage(appCode, input) {
      assert.equal(appCode, 'test-app');
      assert.equal(input.digest, sample.digest);
      return structuredClone(sample.receipt);
    },
    async uploadBackendImageChunk(appCode, digest, hash, offset, content) {
      assert.equal(appCode, 'test-app');
      assert.equal(digest, sample.digest);
      assert.ok(content.length <= chunkBytes);
      let previous = stored.get(hash) || Buffer.alloc(0);
      if (offset === previous.length) {
        previous = Buffer.concat([previous, Buffer.from(content)]);
        stored.set(hash, previous);
      }
      const complete = previous.length === sample.blobs.get(hash)!.length;
      if (complete) assert.equal(digestOf(previous), hash);
      if (loseResponse && !lost && previous.length === chunkBytes) {
        lost = true;
        throw Object.assign(new Error('simulated lost response'), { status: 503, retryable: true });
      }
      return { offset: previous.length, complete };
    },
    async completeBackendImage(appCode, digest) {
      assert.equal(appCode, 'test-app');
      assert.equal(digest, sample.digest);
      assert.equal(stored.size, sample.blobs.size);
      for (const [hash, content] of sample.blobs) assert.deepEqual(stored.get(hash), content);
      return { ...sample.receipt, status: 'ready', reference: `images.example.test/applications/t-test/test-app@${digest}` };
    },
  };
}

function capabilities() {
  return { deployment: { backendImageBuild: { available: false, repositoryPrefix: null },
    backendImageUpload: { schemaVersion: 'openxiangda.backend-image-upload/v2', owner: 'platform',
      available: true, format: 'oci-layout', platform: 'linux/amd64', maxChunkBytes: chunkBytes,
      maxImageBytes: 1024 ** 3, endpointTemplate: '/openxiangda-api/v2/applications/{appCode}/backend-images' } } } as any;
}

test('builds an OCI layout and uploads through the platform without a registry push target', async () => {
  const sample = fixture();
  try {
    mkdirSync(join(sample.root, 'apps/server'), { recursive: true });
    writeFileSync(join(sample.root, 'apps/server/Dockerfile'), 'FROM scratch\n');
    writeFileSync(join(sample.root, '.dockerignore'), 'node_modules\n');
    const docker = join(sample.root, 'docker');
    const marker = join(sample.root, 'build-args.json');
    writeFileSync(docker, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[1] === 'version') process.exit(0);
fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify(args));
const output = args[args.indexOf('--output') + 1];
fs.cpSync(${JSON.stringify(sample.directory)}, /dest=([^,]+)/.exec(output)[1], { recursive: true });
`, { mode: 0o755 });
    const result = await publishBackendImage({ root: sample.root, backendRoot: 'apps/server',
      target: backendImageBuildTarget(capabilities(), 'test-app'), dockerExecutable: docker, uploader: uploader(sample) });
    const args = JSON.parse(readFileSync(marker, 'utf8')) as string[];
    assert.equal(args.includes('--push'), false);
    assert.equal(args.includes('login'), false);
    assert.match(args[args.indexOf('--output') + 1]!, /^type=oci,dest=.+,tar=false$/);
    assert.equal(result.digest, sample.digest);
    assert.match(result.reference, /^images.example.test\/applications\//);
  } finally { sample.cleanup(); }
});

test('resends bounded chunks after response loss without appending bytes twice', async () => {
  const sample = fixture(chunkBytes + 111);
  try {
    const result = await uploadBackendOciLayout({ directory: sample.directory, appCode: 'test-app',
      maxImageBytes: 1024 ** 3, uploader: uploader(sample, true) });
    assert.equal(result.digest, sample.digest);
  } finally { sample.cleanup(); }
});

test('explains how to select an OCI exporter with a classic Docker image store', async () => {
  const sample = fixture();
  try {
    mkdirSync(join(sample.root, 'apps/server'), { recursive: true });
    writeFileSync(join(sample.root, 'apps/server/Dockerfile'), 'FROM scratch\n');
    writeFileSync(join(sample.root, '.dockerignore'), 'node_modules\n');
    const docker = join(sample.root, 'docker');
    writeFileSync(docker, `#!/usr/bin/env node
if (process.argv[3] === 'version') process.exit(0);
console.error('ERROR: OCI exporter is not supported for the docker driver.');
process.exit(1);
`, { mode: 0o755 });
    await assert.rejects(publishBackendImage({ root: sample.root, backendRoot: 'apps/server',
      target: backendImageBuildTarget(capabilities(), 'test-app'), dockerExecutable: docker, uploader: uploader(sample) }),
      error => error instanceof Error && /OCI_EXPORT_REQUIRED/.test(error.message) && /docker buildx create/.test(error.message));
  } finally { sample.cleanup(); }
});

test('rejects corrupted local blobs and oversized images before beginning upload', async () => {
  const sample = fixture();
  try {
    const transport = uploader(sample);
    transport.beginBackendImage = async () => { throw new Error('must not start'); };
    await assert.rejects(uploadBackendOciLayout({ directory: sample.directory, appCode: 'test-app',
      maxImageBytes: 1, uploader: transport }), /IMAGE_TOO_LARGE/);
    writeFileSync(join(sample.directory, 'blobs/sha256', sample.image.layers[0]!.digest.slice(7)), Buffer.alloc(1234, 99));
    await assert.rejects(uploadBackendOciLayout({ directory: sample.directory, appCode: 'test-app',
      maxImageBytes: 1024 ** 3, uploader: transport }), /UPLOAD_INVALID/);
  } finally { sample.cleanup(); }
});

test('does not fall back to personal registry push when platform upload is disabled', () => {
  const target = capabilities();
  target.deployment.backendImageUpload.available = false;
  assert.throws(() => backendImageBuildTarget(target, 'test-app'), /UPLOAD_UNAVAILABLE/);
});
