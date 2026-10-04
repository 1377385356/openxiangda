import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataRecordDeletionMutation, DataRecordDeletionPreview, DataRecordDeletionReceipt } from 'openxiangda-contracts/browser';
import { previewNativeRecordDeletion, deleteNativeRecordWithPreview, recoverNativeRecordDeletion, loadApplicationLoginSurface, OpenXiangdaPlatformRequestError } from '../src/browser/platform-client';
import { ResourceRecordDeletion, previewNativeRecordDeletion as publicPreview } from '../src/react';
import { createRecordDeletionSession, type RecordDeletionState } from '../src/browser/components/resource/record-deletion-session';

const preview: DataRecordDeletionPreview = { schemaVersion: 'openxiangda.data-record-deletion-preview/v1', resourceCode: 'requests', resourceName: '申请',
  recordId: 'record/id', appVersionId: 'v1', environmentHeadRevision: 1, recordRevision: 3,
  affectedRecords: 2, workflowCount: 1, pendingLaunchCount: 0, cancelledTaskCount: 1, canCommit: true,
  receiptOwner: 'workflow-command', previewToken: 'a'.repeat(100), expiresAt: new Date(Date.now()+300000).toISOString() };
const receipt = (key = 'original'): DataRecordDeletionReceipt => ({ schemaVersion: 'openxiangda.data-record-deletion-receipt/v1', resourceCode: 'requests', recordId: 'record/id',
  idempotencyKey: key, receiptOwner: 'workflow-command', receiptId: 'command', deleted: true, replayed: false });
const fail = (status: number, code = `HTTP_${status}`) => new OpenXiangdaPlatformRequestError({ status, code, message: code });

test('public maintenance client uses current-user writes and exact original records and keys', async () => {
  const savedFetch = globalThis.fetch, savedDocument = globalThis.document, savedNow = Date.now;
  const meta: Record<string,string> = { 'openxiangda-runtime-base': '/apps/deletion-app', 'openxiangda-app-code': 'deletion-app', 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: meta[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  const calls: Array<{ url: URL; body: any; csrf: string | null }> = [];
  let csrf = 'original-csrf', previews = 0;
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url),'http://localhost');
    if (target.pathname.endsWith('/auth/surface')) return new Response(JSON.stringify({ code: 200, data: { csrfToken: csrf } }));
    const body = JSON.parse(String(init?.body)); calls.push({ url: target, body, csrf: new Headers(init?.headers).get('x-openxiangda-csrf-token') });
    const result = target.pathname.endsWith('/preview')
      ? previews++ === 0 ? preview : { ...preview, previewToken: 'b'.repeat(100), expiresAt: new Date(Date.now()+300000).toISOString() }
      : receipt(body.idempotencyKey);
    return new Response(JSON.stringify({ code: 200, data: result }));
  };
  try {
    assert.equal(publicPreview,previewNativeRecordDeletion); assert.equal(typeof ResourceRecordDeletion,'function');
    await publicPreview('requests','record/id');
    csrf = 'rotated-csrf';
    await loadApplicationLoginSurface({ device: 'desktop', returnTo: '/' });
    const input: DataRecordDeletionMutation = { schemaVersion: 'openxiangda.data-record-deletion-request/v1', previewToken: preview.previewToken!, reason: '原因', idempotencyKey: 'original' };
    await deleteNativeRecordWithPreview('requests','record/id',input);
    Date.now = () => savedNow()+400000;
    await publicPreview('requests','record/id');
    await recoverNativeRecordDeletion('requests','record/id',input);
    assert.match(calls[0]!.url.pathname,/record%2Fid\/deletion\/preview$/);
    assert.deepEqual(calls[1]!.body,calls[3]!.body); assert.equal(calls[1]!.body.idempotencyKey,'original');
    assert.equal(calls[0]!.csrf,'original-csrf'); assert.equal(calls[1]!.csrf,'original-csrf');
    assert.equal(calls[2]!.csrf,'rotated-csrf'); assert.equal(calls[3]!.csrf,'original-csrf');
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 200, data: { ...preview, receiptOwner: 'native-transaction' } }));
    await assert.rejects(publicPreview('requests','record/id'),/RECORD_DELETION_RESPONSE_INVALID/);
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 200, data: { ...receipt(), recordId: 'another' } }));
    await assert.rejects(recoverNativeRecordDeletion('requests','record/id',input),/RECORD_DELETION_RESPONSE_INVALID/);
  } finally { globalThis.fetch=savedFetch; Date.now=savedNow; if (savedDocument===undefined) delete (globalThis as any).document; else globalThis.document=savedDocument; }
});

test('only an explicit fresh preview and trimmed reason can produce a deletion', async () => {
  const sent: DataRecordDeletionMutation[]=[]; const states: RecordDeletionState[]=[]; let keys=0;
  const session=createRecordDeletionSession(async()=>preview,async input=>{sent.push(input);return receipt(input.idempotencyKey);},async()=>receipt(),state=>states.push(state),()=>`key-${++keys}`);
  await session.confirm('reason'); assert.equal(sent.length,0);
  await session.preview(); await session.confirm('   '); assert.equal(sent.length,0);
  await session.confirm(' original reason ');
  assert.equal(sent[0]!.reason,'original reason'); assert.equal(keys,1); assert.equal(states.at(-1)?.receipt?.deleted,true);
});
test('unknown submission retains token/reason/key and blocks re-preview or a replacement request',async()=>{
  const sent: DataRecordDeletionMutation[]=[];const states: RecordDeletionState[]=[];let keys=0;
  const session=createRecordDeletionSession(async()=>preview,async input=>{sent.push(input);if(sent.length===1)throw fail(503);return receipt(input.idempotencyKey);},
    async()=>{throw fail(404,'OPENXIANGDA_NATIVE_RECORD_DELETION_RECEIPT_NOT_FOUND');},state=>states.push(state),()=>`key-${++keys}`);
  await session.preview();await session.confirm('original');await session.preview();await session.confirm('replacement');await session.retry();
  assert.equal(sent.length,1);assert.equal(keys,1);assert.equal(states.at(-1)?.pending?.reason,'original');
  await session.recover();assert.equal(states.at(-1)?.retryAllowed,true);await session.retry();assert.deepEqual(sent[1],sent[0]);
});
test('receipt recovery completes without another deletion call',async()=>{
  const states:RecordDeletionState[]=[];let sends=0;
  const session=createRecordDeletionSession(async()=>preview,async()=>{sends++;throw fail(503);},async input=>receipt(input.idempotencyKey),state=>states.push(state),()=>'original');
  await session.preview();await session.confirm('reason');await session.recover();await session.retry();
  assert.equal(sends,1);assert.equal(states.at(-1)?.pending,undefined);assert.equal(states.at(-1)?.receipt?.deleted,true);
});
test('expiry, access rejection and an ordinary record 404 never authorize replay',async()=>{
  for(const error of [fail(403),fail(404,'OPENXIANGDA_NATIVE_DATA_RECORD_NOT_FOUND'),fail(503)]){
    let sends=0;const states:RecordDeletionState[]=[];
    const session=createRecordDeletionSession(async()=>preview,async()=>{sends++;throw fail(503);},async()=>{throw error;},state=>states.push(state),()=>'original');
    await session.preview();await session.confirm('reason');await session.recover();await session.retry();assert.equal(sends,1);assert.equal(states.at(-1)?.retryAllowed,false);
  }
  let now=Date.now(),sends=0;
  const session=createRecordDeletionSession(async()=>preview,async()=>{sends++;throw fail(503);},async()=>{throw fail(404,'OPENXIANGDA_NATIVE_RECORD_DELETION_RECEIPT_NOT_FOUND');},()=>{},()=>'original',()=>now);
  await session.preview();await session.confirm('reason');now+=400000;await session.recover();await session.retry();assert.equal(sends,1);
});
test('double clicks share one command and close drops late results',async()=>{
  let resolve!:(value:DataRecordDeletionReceipt)=>void;const waiting=new Promise<DataRecordDeletionReceipt>(done=>{resolve=done;});let sends=0;
  const states:RecordDeletionState[]=[];
  const session=createRecordDeletionSession(async()=>preview,async()=>{sends++;return waiting;},async()=>receipt(),state=>states.push(state),()=>'original');
  await session.preview();const first=session.confirm('reason');await session.confirm('reason');await session.recover();assert.equal(sends,1);
  session.close();const count=states.length;resolve(receipt());await first;assert.equal(states.length,count);
});
test('definite rejection requires another preview; the original reason remains with the caller',async()=>{
  const states:RecordDeletionState[]=[];let sends=0;
  const session=createRecordDeletionSession(async()=>preview,async()=>{sends++;throw fail(409);},async()=>receipt(),state=>states.push(state),()=>'original');
  await session.preview();await session.confirm('reason');await session.confirm('reason');assert.equal(sends,1);
  assert.equal(states.at(-1)?.pending,undefined);assert.equal(states.at(-1)?.preview,undefined);
});
