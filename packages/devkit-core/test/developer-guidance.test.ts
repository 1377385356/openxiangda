import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { DOCUMENTATION_TOPICS, checkApplication, deployApplication, developerError, documentationIndex, readDocumentation, withWorkspaceOperation } from '../src/index.js';
import type { OpenXiangdaApplicationServices } from '../src/index.js';

function temporary(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'ox-guidance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
test('shared public operations enforce test defaults and production promotion without rebuilding', async t => {
  const root = temporary(t);
  writeFileSync(join(root, 'openxiangda.config.ts'), 'export default {};');
  const calls: unknown[] = [];
  const services = {
    check: async (...args: unknown[]) => { calls.push(['check', ...args]); return { ok: true }; },
    deploy: async (input: unknown) => { calls.push(['deploy', input]); return { ok: true }; },
    deployProduction: async (...args: unknown[]) => { calls.push(['promote', ...args]); return { ok: true }; },
    productionDeploymentPlan: async (...args: unknown[]) => { calls.push(['plan', ...args]); return { ok: true }; },
  } as unknown as OpenXiangdaApplicationServices;
  await checkApplication(services, { root });
  await checkApplication(services, { root, environment: 'production' });
  await deployApplication(services, { root, environment: 'production', from: 'tested-version', dryRun: true });
  await deployApplication(services, { root, environment: 'production', from: 'tested-version' });
  assert.deepEqual(calls, [['check', root, 'preproduction'], ['check', root, 'production'], ['plan', root, 'tested-version'], ['promote', root, 'tested-version']]);
  for (const input of [{ environment: 'preproduction' }, { environment: 'production' }, { from: 'not-production' }, { environment: 'production', from: 'id', environmentId: 'override' }]) {
    assert.throws(() => deployApplication(services, { root, ...input }), /INVALID|REQUIRED/);
  }
  assert.equal(calls.length, 4);
});
test('local check and deploy writers are mutually exclusive and release after errors', async t => {
  const root = temporary(t);
  let finish!: () => void;
  const started = withWorkspaceOperation(root, 'check', () => new Promise<void>(resolve => { finish = resolve; }));
  await assert.rejects(() => withWorkspaceOperation(root, 'deploy', async () => 'unexpected'), /WORKSPACE_OPERATION_BUSY/);
  finish(); await started;
  await assert.rejects(() => withWorkspaceOperation(root, 'check', async () => { throw new Error('expected'); }), /expected/);
  assert.equal(existsSync(join(root, '.openxiangda/operation.lock')), false);
});
test('documentation has bounded allowlisted topics, readable sections, version and digest', t => {
  const root = temporary(t);
  const topics = DOCUMENTATION_TOPICS.map(topic => {
    const content = `# ${topic.title}\n\n## 用法 {#usage}\n中文正文\n\n\`\`\`md\n## 代码中的标题\n\`\`\`\n\n## 结果\n完成\n`;
    const path = join(root, topic.file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content);
    return { id: topic.id, sha256: createHash('sha256').update(content).digest('hex') };
  });
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ version: '2.0.0-test', topics }));
  const index = documentationIndex(root);
  assert.equal(index.topics.length, DOCUMENTATION_TOPICS.length);
  const topic = readDocumentation('testing', 'usage', root);
  assert.equal(topic.version, '2.0.0-test');
  assert.match(topic.content, /中文正文/);
  assert.doesNotMatch(topic.content, /完成/);
  assert.equal(topic.sections.length, 2);
  assert.throws(() => readDocumentation('../secrets', undefined, root), /TOPIC_NOT_FOUND/);
  assert.throws(() => readDocumentation('testing', 'missing', root), /SECTION_NOT_FOUND/);
  writeFileSync(join(root, 'testing.md'), '# 篡改');
  assert.throws(() => readDocumentation('testing', undefined, root), /DIGEST_MISMATCH/);
  rmSync(join(root, 'testing.md'));
  symlinkSync(resolve(import.meta.dirname, '../package.json'), join(root, 'testing.md'));
  assert.throws(() => readDocumentation('testing', undefined, root), /PATH_FORBIDDEN/);
});
test('remote errors retain the retry decision and pointer on both transports', () => {
  const error = Object.assign(new Error('PLATFORM_INCOMPATIBLE: 契约不兼容'), { status: 422, data: { pointer: '/data/resources/0', required: 'v4', remediation: '升级目标平台' } });
  assert.deepEqual(developerError(error), { code: 'PLATFORM_INCOMPATIBLE', message: '契约不兼容', retryable: false, remediation: '升级目标平台', nextCommand: 'pnpm openxiangda docs', pointer: '/data/resources/0', details: error.data });
});
