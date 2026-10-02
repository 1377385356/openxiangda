import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkflowTaskFileUpload, type WorkflowTaskFileUploadIntent, type WorkflowTaskFileUploadTransport } from '../src/browser/workflow-task-file-upload';

function fixture() {
  const file = new File(['proof'], 'proof.txt', { type: 'text/plain' });
  const intent: WorkflowTaskFileUploadIntent = { taskId: 'task-a', file, phase: 'initiate', input: { id: 'file-a', fieldCode: 'evidence', fileName: file.name, fileSize: file.size, contentType: file.type } };
  const ref = { schemaVersion: 'openxiangda.data-file-ref/v2' as const, id: 'file-a', name: file.name, size: file.size, contentType: file.type };
  const plan = { schemaVersion: 'openxiangda.data-file-upload-plan/v2' as const, fieldCode: 'evidence', resourceCode: 'requests', file: ref, state: 'pending' as const, uploadMethod: 'PUT' as const, uploadUrl: 'https://upload.invalid', headers: {}, expiresAt: new Date(Date.now() + 60000).toISOString() };
  const calls: string[] = [];
  const transport: WorkflowTaskFileUploadTransport = {
    initiate: async (task, input) => { assert.equal(task, intent.taskId); assert.deepEqual(input, intent.input); calls.push('initiate'); return plan; },
    read: async (task, id) => { assert.equal(task, intent.taskId); assert.equal(id, intent.input.id); calls.push('read'); return plan; },
    put: async (_plan, bytes) => { assert.equal(bytes, file); calls.push('put'); },
    complete: async (task, id) => { assert.equal(task, intent.taskId); assert.equal(id, intent.input.id); calls.push('complete'); return ref; },
  };
  return { file, intent, ref, plan, calls, transport };
}

test('lost initiate recovers the same intent and does not manufacture a second file', async () => {
  const f = fixture(); let initiated = false;
  f.transport.initiate = async (_task, input) => { assert.equal(input, f.intent.input); initiated = true; throw new TypeError('response lost'); };
  await assert.rejects(runWorkflowTaskFileUpload(f.intent, f.transport), /response lost/);
  assert.equal(f.intent.phase, 'initiate'); assert.equal(initiated, true);
  assert.deepEqual(await runWorkflowTaskFileUpload(f.intent, f.transport, true), f.ref);
  assert.deepEqual(f.calls, ['read', 'put', 'complete']);
});

test('lost complete is recovered from the ready receipt without rewriting uploaded bytes', async () => {
  const f = fixture();
  f.transport.complete = async () => { f.calls.push('complete'); throw new TypeError('response lost'); };
  await assert.rejects(runWorkflowTaskFileUpload(f.intent, f.transport), /response lost/);
  assert.equal(f.intent.phase, 'complete');
  f.transport.read = async () => { f.calls.push('read'); return { ...f.plan, state: 'ready' }; };
  assert.deepEqual(await runWorkflowTaskFileUpload(f.intent, f.transport, true), f.ref);
  assert.deepEqual(f.calls, ['initiate', 'put', 'complete', 'read']);
});

test('transient completion failure retries completion on the original pending file', async () => {
  const f = fixture(); let attempt = 0;
  f.transport.complete = async () => { f.calls.push('complete'); if (++attempt === 1) throw new TypeError('storage temporarily unavailable'); return f.ref; };
  await assert.rejects(runWorkflowTaskFileUpload(f.intent, f.transport));
  await runWorkflowTaskFileUpload(f.intent, f.transport, true);
  assert.deepEqual(f.calls, ['initiate', 'put', 'complete', 'read', 'complete']);
});

test('interrupted byte upload retains the original File and repeats only that pending intent', async () => {
  const f = fixture(); let attempt = 0;
  f.transport.put = async (_plan, file) => { assert.equal(file, f.file); f.calls.push('put'); if (++attempt === 1) throw new TypeError('upload interrupted'); };
  await assert.rejects(runWorkflowTaskFileUpload(f.intent, f.transport));
  assert.equal(f.intent.phase, 'upload'); await runWorkflowTaskFileUpload(f.intent, f.transport, true);
  assert.deepEqual(f.calls, ['initiate', 'put', 'read', 'put', 'complete']);
});

test('only an explicit original-file absence permits repeating initiate', async () => {
  const f = fixture();
  f.transport.read = async () => { throw Object.assign(new Error('absent'), { code: 'WORKFLOW_TASK_FILE_NOT_FOUND' }); };
  await runWorkflowTaskFileUpload(f.intent, f.transport, true);
  assert.deepEqual(f.calls, ['initiate', 'put', 'complete']);
  f.calls.length = 0; f.transport.read = async () => { throw Object.assign(new Error('denied'), { code: 'WORKFLOW_V2_TASK_FORBIDDEN' }); };
  await assert.rejects(runWorkflowTaskFileUpload(f.intent, f.transport, true), /denied/);
  assert.deepEqual(f.calls, []);
});

test('a receipt for another field, file or declared size cannot release the upload lock', async () => {
  for (const changed of [{ fieldCode: 'photos' }, { file: { id: 'file-b' } }, { file: { size: 999 } }]) {
    const f = fixture();
    f.transport.read = async () => ({ ...f.plan, ...changed, file: { ...f.ref, ...changed.file }, state: 'ready' });
    await assert.rejects(runWorkflowTaskFileUpload(f.intent, f.transport, true), /RESPONSE_INVALID/);
    assert.deepEqual(f.calls, []);
  }
});

test('owned recovery accepts only the original subtable and stable row, without rewriting ready bytes', async () => {
  const row = { subtableFieldCode: 'items', rowKey: 'row-a' };
  for (const actual of [row, undefined, { ...row, rowKey: 'row-b' }, { ...row, subtableFieldCode: 'other' }]) {
    const f = fixture(); f.intent.input.row = row;
    f.transport.read = async () => { f.calls.push('read'); return { ...f.plan, state: 'ready', row: actual }; };
    if (actual === row) assert.deepEqual(await runWorkflowTaskFileUpload(f.intent, f.transport, true), f.ref);
    else await assert.rejects(runWorkflowTaskFileUpload(f.intent, f.transport, true), /RESPONSE_INVALID/);
    assert.deepEqual(f.calls, ['read']);
  }
  const root = fixture();
  root.transport.read = async () => ({ ...root.plan, state: 'ready', row });
  await assert.rejects(runWorkflowTaskFileUpload(root.intent, root.transport, true), /RESPONSE_INVALID/);
});
