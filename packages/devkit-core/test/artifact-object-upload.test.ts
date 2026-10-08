import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { OpenXiangdaControlPlaneClient, ControlPlaneError } from '../src/control-plane-client.js';

const capability = { schemaVersion: 'openxiangda.artifact-transfer/v1', provider: 'oss',
  directUpload: true, frontendDelivery: 'object-storage', maxChunkBytes: 8388608, maxArtifactBytes: 52428800 };
const session = { schemaVersion: 'openxiangda.artifact-upload-session/v1', storageFingerprint: 'f'.repeat(64),
  uploadMethod: 'POST', uploadUrl: 'https://bucket.oss-cn-hangzhou.aliyuncs.com/',
  formFields: { key: 'openxiangda/application-staging/test/app/digest', 'x-oss-object-acl': 'private', policy: 'secret-policy', Signature: 'secret-signature' },
  expiresAt: new Date(Date.now() + 300000).toISOString() };
const success = (data: unknown) => Response.json({ code: 200, message: 'success', data });

test('uploads UTF-8 artifact bytes directly without platform headers, then imports metadata', async () => {
  const content = '校验前端包';
  const bytes = Buffer.from(content);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.test/service', token: 'platform-secret',
    fetch: async (input, init) => {
      const url = String(input); requests.push({ url, init });
      if (url.endsWith('/artifact-transfer')) return success(capability);
      if (url.endsWith('/object-session')) {
        assert.equal(JSON.parse(String(init?.body)).size, bytes.length);
        return success(session);
      }
      if (url === session.uploadUrl) {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('Authorization'), null);
        assert.equal(headers.get('X-CSRF-Token'), null);
        assert.equal(init?.redirect, 'error');
        const form = init!.body as FormData;
        assert.equal([...form.keys()].at(-1), 'file');
        assert.deepEqual(Buffer.from(await (form.get('file') as Blob).arrayBuffer()), bytes);
        return new Response('', { status: 200 });
      }
      assert.ok(url.endsWith('/object-import'));
      const metadata = JSON.parse(String(init?.body));
      assert.equal(metadata.storageFingerprint, session.storageFingerprint);
      assert.equal(metadata.size, bytes.length);
      assert.ok(!metadata.uploadUrl && !metadata.policy);
      return success({ digest });
    } });
  assert.deepEqual(await client.uploadArtifact({ appCode: 'app', digest, kind: 'frontend', contentType: 'application/json', content }), { digest });
  assert.equal(requests.length, 4);
});

test('uses raw bounded image chunks with their SHA and preserves Registry progress', async () => {
  const raw = Buffer.from('image layer bytes');
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.test/service', token: 'platform-secret',
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith('/artifact-transfer')) return success(capability);
      if (url.endsWith('/object-session')) {
        assert.deepEqual(JSON.parse(String(init?.body)), { offset: 8, size: raw.length, sha256: createHash('sha256').update(raw).digest('hex') });
        return success({ session });
      }
      if (url === session.uploadUrl) return new Response('', { status: 200 });
      return success({ offset: 8, complete: false });
    } });
  assert.deepEqual(await client.uploadBackendImageChunk('app', 'sha256:' + 'a'.repeat(64), 'sha256:' + 'b'.repeat(64), 8, gzipSync(raw), 'gzip'), { offset: 8, complete: false });
});

test('skips direct bytes for an already present Registry layer', async () => {
  let cloud = 0;
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.test/service', token: 'platform-secret',
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith('/artifact-transfer')) return success(capability);
      if (url.endsWith('/object-session')) return success({ progress: { offset: 3, complete: true } });
      cloud++; throw new Error('must not upload');
    } });
  assert.deepEqual(await client.uploadBackendImageChunk('app', 'sha256:' + 'a'.repeat(64), 'sha256:' + 'b'.repeat(64), 0, Buffer.from('abc')), { offset: 3, complete: true });
  assert.equal(cloud, 0);
});

test('redacts signed sessions on failure and never silently changes channels', async () => {
  let imports = 0;
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.test/service', token: 'platform-secret',
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith('/artifact-transfer')) return success(capability);
      if (url.endsWith('/object-session')) return success(session);
      if (url === session.uploadUrl) throw new Error(session.uploadUrl + 'secret-signature');
      imports++; return success({});
    } });
  await assert.rejects(client.uploadArtifact({ appCode: 'app', digest: 'a'.repeat(64), kind: 'frontend', contentType: 'application/json', content: 'abc' }), error => {
    assert.ok(error instanceof ControlPlaneError);
    assert.equal(error.code, 'OPENXIANGDA_OBJECT_UPLOAD_FAILED');
    assert.doesNotMatch(JSON.stringify(error) + error.message, /secret-signature|secret-policy|aliyuncs|platform-secret/);
    return true;
  });
  assert.equal(imports, 0);
});

test('rejects unknown transport schemas without falling back', async () => {
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.test/service', token: 'platform-secret',
    fetch: async () => success({ ...capability, schemaVersion: 'future-version' }) });
  await assert.rejects(client.artifactTransferCapability('app'), (error: any) => error.code === 'OPENXIANGDA_ARTIFACT_TRANSFER_INVALID');
});
