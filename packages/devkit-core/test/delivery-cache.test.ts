import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { canonicalJson, sha256Digest, CURRENT_APPLICATION_CONTRACT } from 'openxiangda-contracts';
import { deliveryInputDigest, recordValidation, reusableValidation, recordSealedCandidate, reusableSealedCandidate, type DeliveryCacheContext } from '../src/delivery-cache.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oxa-delivery-cache-'));
  mkdirSync(join(root, 'web/dist'), { recursive: true });
  writeFileSync(join(root, 'web/index.ts'), 'export const value = 1;');
  writeFileSync(join(root, 'web/dist/index.html'), '<main>ready</main>');
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  const context: DeliveryCacheContext = { root, frontendRoot: 'web', toolchain: { version: '1' }, environment: { MODE: 'production', SECRET: 'not-persisted' } };
  return { root, context };
}

test('只复用同一源码、锁定依赖、环境和完整输出；提交本身不使验证失效', () => {
  const { root, context } = fixture();
  try {
    const digest = deliveryInputDigest(context);
    assert.ok(digest);
    assert.ok(recordValidation(context, digest));
    assert.ok(reusableValidation(context));
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git/HEAD'), 'a new commit');
    assert.ok(reusableValidation(context));
    assert.equal(reusableValidation({ ...context, environment: { MODE: 'other' } }), null);
    assert.equal(reusableValidation({ ...context, toolchain: { version: '2' } }), null);
    writeFileSync(join(root, '.env.production'), 'API=https://changed.example');
    assert.equal(reusableValidation(context), null);
    rmSync(join(root, '.env.production'));
    writeFileSync(join(root, 'web/dist/index.html'), '<main>damaged</main>');
    assert.equal(reusableValidation(context), null);
    assert.doesNotMatch(readFileSync(join(root, '.openxiangda/build/validation-evidence.json'), 'utf8'), /not-persisted|SECRET/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('检查期间输入改变不能记录通过；缺少锁文件、外部依赖或符号链接走完整检查', () => {
  const { root, context } = fixture();
  try {
    const before = deliveryInputDigest(context);
    writeFileSync(join(root, 'web/index.ts'), 'changed');
    assert.throws(() => recordValidation(context, before), { code: 'OPENXIANGDA_VALIDATION_INPUT_CHANGED' });
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'resolution: file:../outside');
    assert.equal(deliveryInputDigest(context), null);
    rmSync(join(root, 'pnpm-lock.yaml'));
    assert.equal(deliveryInputDigest(context), null);
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9');
    symlinkSync(join(root, 'web/index.ts'), join(root, 'linked.ts'));
    assert.equal(deliveryInputDigest(context), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('封存候选绑定精确主线来源且重新校验清单，不能借新检查复用旧候选', async () => {
  const { root, context } = fixture();
  try {
    const source = { repository: 'https://example.invalid/app.git', commit: 'a'.repeat(40), dirty: false };
    const manifest = { appCode: 'test-app', source, artifacts: [], manifests: {}, compatibility: { applicationContract: CURRENT_APPLICATION_CONTRACT } } as any;
    const compiled = { manifest, digest: sha256Digest(manifest) };
    recordValidation(context, deliveryInputDigest(context));
    writeFileSync(join(root, '.openxiangda/build/app-package.json'), canonicalJson(manifest));
    recordSealedCandidate(context, compiled);
    assert.ok(await reusableSealedCandidate(context, source));
    assert.equal(await reusableSealedCandidate(context, { ...source, commit: 'b'.repeat(40) }), null);
    writeFileSync(join(root, 'web/index.ts'), 'new code');
    recordValidation(context, deliveryInputDigest(context));
    assert.equal(await reusableSealedCandidate(context, source), null);
    recordSealedCandidate(context, compiled);
    writeFileSync(join(root, '.openxiangda/build/app-package.json'), canonicalJson({ ...manifest, metadata: 'tampered' }));
    assert.equal(await reusableSealedCandidate(context, source), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
