import { createReadStream, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { IMAGE_STORAGE_BUDGET_EXCEEDED } from './backend-image-upload-failure.js';

export type BackendImageChunkEncoding = 'gzip';

export interface BackendImageUploadReceipt {
  digest: string;
  status: 'uploading' | 'ready';
  reference: string | null;
  sizeBytes: number;
  maxChunkBytes: number;
  blobs: Array<{ digest: string; size: number; offset: number; complete: boolean }>;
}

export interface BackendImageUploader {
  beginBackendImage(appCode: string, input: { digest: string; manifest: string }): Promise<BackendImageUploadReceipt>;
  uploadBackendImageChunk(appCode: string, digest: string, blobDigest: string, offset: number,
    content: Uint8Array, chunkEncoding?: BackendImageChunkEncoding): Promise<{ offset: number; complete: boolean }>;
  completeBackendImage(appCode: string, digest: string): Promise<BackendImageUploadReceipt>;
}

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const CHUNK_BYTES = 8 * 1024 * 1024;

function invalid(): never {
  throw Object.assign(new Error('OPENXIANGDA_BACKEND_IMAGE_UPLOAD_INVALID: OCI 镜像或上传回执无效'),
    { code: 'OPENXIANGDA_BACKEND_IMAGE_UPLOAD_INVALID' });
}

function metadata(path: string, maxBytes = 256 * 1024): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) invalid();
  return readFileSync(path, 'utf8');
}

function blobPath(directory: string, digest: string): string {
  if (!DIGEST.test(digest)) invalid();
  return join(directory, 'blobs', 'sha256', digest.slice(7));
}

async function retry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); } catch (error) {
      // An admission budget needs operator recovery; immediate retries cannot reclaim space.
      if ((error as { code?: unknown })?.code === IMAGE_STORAGE_BUDGET_EXCEEDED) throw error;
      const status = Number((error as any)?.status || 0);
      const retryable = (error as any)?.retryable ?? (error as any)?.remote?.retryable;
      const transient = retryable === true || !status || [408, 429, 502, 503, 504].includes(status);
      if (attempt >= 2 || !transient || retryable === false) throw error;
      await new Promise(resolve => setTimeout(resolve, [500, 1500][attempt]));
    }
  }
}

export async function inspectBackendOciLayout(input: {
  directory: string;
  maxImageBytes: number;
}) {
  for (const path of [input.directory, join(input.directory, 'blobs'), join(input.directory, 'blobs', 'sha256')]) {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalid();
  }
  const layout = JSON.parse(metadata(join(input.directory, 'oci-layout')));
  const index = JSON.parse(metadata(join(input.directory, 'index.json')));
  if (layout.imageLayoutVersion !== '1.0.0' || index.schemaVersion !== 2 ||
    !Array.isArray(index.manifests) || index.manifests.length !== 1) invalid();
  const descriptor = index.manifests[0];
  const manifest = metadata(blobPath(input.directory, descriptor.digest));
  const digest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`;
  if (descriptor.digest !== digest || Buffer.byteLength(manifest) !== descriptor.size) invalid();
  const parsed = JSON.parse(manifest);
  if (parsed.schemaVersion !== 2 || parsed.mediaType !== 'application/vnd.oci.image.manifest.v1+json' ||
    !Array.isArray(parsed.layers) || parsed.layers.length > 128) invalid();
  const blobs = new Map<string, { digest: string; size: number }>();
  for (const blob of [parsed.config, ...parsed.layers]) {
    if (!blob || !DIGEST.test(blob.digest) || !Number.isSafeInteger(blob.size) || blob.size < 1 || blob.urls || blob.data) invalid();
    if (blobs.has(blob.digest) && blobs.get(blob.digest)!.size !== blob.size) invalid();
    blobs.set(blob.digest, blob);
  }
  const sizeBytes = [...blobs.values()].reduce((total, blob) => total + blob.size, Buffer.byteLength(manifest));
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes > input.maxImageBytes) {
    throw Object.assign(new Error('OPENXIANGDA_BACKEND_IMAGE_TOO_LARGE: 镜像超过平台上传额度'),
      { code: 'OPENXIANGDA_BACKEND_IMAGE_TOO_LARGE' });
  }
  const expected = new Set([digest, ...blobs.keys()].map(value => value.slice(7)));
  const paths = readdirSync(join(input.directory, 'blobs', 'sha256'));
  const rootEntries = readdirSync(input.directory);
  // Buildx/containerd leaves this empty staging directory after a completed export.
  if (rootEntries.includes('ingest')) {
    const ingest = join(input.directory, 'ingest');
    const stat = lstatSync(ingest);
    if (!stat.isDirectory() || stat.isSymbolicLink() || readdirSync(ingest).length) invalid();
  }
  if (rootEntries.filter(name => name !== 'ingest').sort().join(',') !== 'blobs,index.json,oci-layout' ||
    readdirSync(join(input.directory, 'blobs')).join(',') !== 'sha256' ||
    paths.length !== expected.size || paths.some(path => !expected.has(path))) invalid();
  for (const blob of blobs.values()) {
    const path = blobPath(input.directory, blob.digest);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== blob.size) invalid();
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (`sha256:${hash.digest('hex')}` !== blob.digest) invalid();
  }
  return { digest, manifest, sizeBytes, blobs };
}

export async function uploadBackendOciLayout(input: {
  directory: string;
  appCode: string;
  maxImageBytes: number;
  chunkEncoding?: BackendImageChunkEncoding;
  uploader: BackendImageUploader;
  expectedDigest?: string;
  assertOwnership?: () => void;
}): Promise<{ digest: string; reference: string }> {
  const { digest, manifest, sizeBytes, blobs } = await inspectBackendOciLayout(input);
  if (input.expectedDigest !== undefined && input.expectedDigest !== digest) invalid();
  const owned = async <T>(operation: () => Promise<T>) => {
    input.assertOwnership?.();
    return operation();
  };
  let receipt = await retry(() => owned(() => input.uploader.beginBackendImage(input.appCode, { digest, manifest })));
  if (receipt.digest !== digest || receipt.sizeBytes !== sizeBytes || receipt.maxChunkBytes !== CHUNK_BYTES ||
    !['ready', 'uploading'].includes(receipt.status) ||
    !Array.isArray(receipt.blobs) || receipt.blobs.length !== blobs.size ||
    new Set(receipt.blobs.map(blob => blob.digest)).size !== blobs.size) invalid();
  for (const progress of receipt.blobs) {
    const blob = blobs.get(progress.digest);
    if (!blob || progress.size !== blob.size || !Number.isSafeInteger(progress.offset) || progress.offset < 0 ||
      progress.offset > blob.size || typeof progress.complete !== 'boolean' || (progress.complete && progress.offset !== blob.size)) invalid();
  }
  if (receipt.status !== 'ready') {
    for (const progress of receipt.blobs) {
      const blob = blobs.get(progress.digest);
      if (!blob || progress.size !== blob.size) invalid();
      const file = await open(blobPath(input.directory, blob.digest), 'r');
      let offset = progress.offset;
      let complete = progress.complete;
      let stagnant = 0;
      try {
        while (!complete) {
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > blob.size) invalid();
          const content = Buffer.alloc(Math.min(CHUNK_BYTES, blob.size - offset));
          const read = await file.read(content, 0, content.length, offset);
          if (read.bytesRead !== content.length) invalid();
          const encoded = input.chunkEncoding === 'gzip' ? gzipSync(content) : content;
          const result = await retry(() => owned(() => input.uploader.uploadBackendImageChunk(
            input.appCode, digest, blob.digest, offset, encoded, input.chunkEncoding)));
          if (!Number.isSafeInteger(result.offset) || result.offset < 0 || result.offset > blob.size ||
            typeof result.complete !== 'boolean' || (result.complete && result.offset !== blob.size)) invalid();
          stagnant = result.offset === offset && !result.complete ? stagnant + 1 : 0;
          if (stagnant > 3) invalid();
          offset = result.offset;
          complete = result.complete;
        }
      } finally { await file.close(); }
    }
    receipt = await retry(() => owned(() => input.uploader.completeBackendImage(input.appCode, digest)));
  }
  if (receipt.digest !== digest || receipt.status !== 'ready' || typeof receipt.reference !== 'string' ||
    !receipt.reference.endsWith(`@${digest}`) || /[\s?#\\]/.test(receipt.reference)) invalid();
  return { digest, reference: receipt.reference };
}
