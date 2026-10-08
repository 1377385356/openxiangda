import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { browserSha256 } from '../src/browser/sha256';
import { workflowCommandTokenDigest, workflowTaskCommandScope,
  readPendingWorkflowTaskCommand, writePendingWorkflowTaskCommand } from '../src/browser/workflow-task-command-recovery';

test('SHA-256 remains identical with and without browser Web Crypto', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'crypto', descriptor) : Reflect.deleteProperty(globalThis, 'crypto'));
  const setCrypto = (value: unknown) => Object.defineProperty(globalThis, 'crypto', { configurable: true, value });
  const vectors = ['', 'abc', '合同审批🔐', 'x'.repeat(1024)];
  const storageData = new Map<string, string>();
  const storage = { getItem: (key: string) => storageData.get(key) ?? null,
    setItem: (key: string, value: string) => { storageData.set(key, value); },
    removeItem: (key: string) => { storageData.delete(key); } };
  for (const crypto of [undefined, {}, webcrypto]) {
    setCrypto(crypto);
    for (const token of vectors) {
      assert.equal(await workflowCommandTokenDigest(token), createHash('sha256').update(token).digest('hex'));
    }
    const bytes = new Uint8Array([9, 0, 128, 255, 9]).subarray(1, 4);
    assert.equal(await browserSha256(bytes), createHash('sha256').update(bytes).digest('hex'));
    const blob = new Blob([bytes]);
    assert.equal(await browserSha256(new Uint8Array(await blob.arrayBuffer())), createHash('sha256').update(bytes).digest('hex'));
    const scope = workflowTaskCommandScope('app', 'test', 'user', 'task');
    const command = { taskId: 'task', command: 'approve', idempotencyKey: 'original-key',
      requestedAt: new Date().toISOString(), tokenDigest: await workflowCommandTokenDigest('private-token'),
      commandToken: 'private-token', form: { secret: 'private-input' } };
    assert.equal(writePendingWorkflowTaskCommand(storage, scope, command), true);
    assert.equal(readPendingWorkflowTaskCommand(storage, scope)?.idempotencyKey, 'original-key');
    assert.doesNotMatch(storageData.get(scope)!, /private-token|private-input|commandToken|"form"/);
  }
  const failure = new Error('native digest failed');
  setCrypto({ subtle: { digest: async () => { throw failure; } } });
  await assert.rejects(browserSha256(new Uint8Array()), error => error === failure);
});
