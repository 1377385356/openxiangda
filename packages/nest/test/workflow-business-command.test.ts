import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenXiangdaBusinessProcessService } from '../src/business-process.js';
import { sha256Digest } from 'openxiangda-contracts';

test('business command SDK forwards verified action and original CSRF and refuses undeclared commands before HTTP', async () => {
  const request: any = { headers: { 'x-openxiangda-csrf-token': 'issued-csrf' }, openxiangda: {
    authorization: 'Bearer invocation', perspectiveCode: null, principal: { principalType: 'user', userId: 'reviewer', environmentKey: 'preproduction' },
    operation: { code: 'decide-request', requiredCapability: 'app:command-review:request:decide',
      platformAccess: { workflow: { codes: ['request-approval'], businessCommands: ['approve'] } } },
  } };
  const calls: any[] = [];
  const platform: any = { commandBusinessProcessWithData: async (...args: any[]) => { calls.push(args); return { status: 'approved', dataRevision: 4 }; } };
  const service = new OpenXiangdaBusinessProcessService(request, platform);
  const input: any = { workflow: { workflowCode: 'request-approval', target: { kind: 'task', id: 'task', command: 'approve' },
    recordId: 'record', expectedRevision: 3, commandToken: 'original-token', idempotencyKey: 'original', input: { comment: '同意' } },
    subject: { fromOperation: 'subject' }, data: { operations: [{ key: 'subject', kind: 'update', resourceCode: 'requests', id: 'record', expectedRevision: 3, data: { status: 'active' } }] },
    expectedTransition: { status: 'approved', outcome: 'approved', currentNodeId: null } };
  assert.equal((await service.commandWithData(input)).dataRevision, 4);
  assert.equal(calls[0][0], 'Bearer invocation'); assert.equal(calls[0][2].code, 'decide-request'); assert.equal(calls[0][3], 'issued-csrf');
  assert.deepEqual(calls[0][1], { ...input, schemaVersion: 'openxiangda.business-process-command-with-data/v2', environmentKey: 'preproduction' });
  await assert.rejects(() => service.commandWithData({ ...input, workflow: { ...input.workflow, target: { kind: 'task', id: 'task', command: 'reject' } } }), /COMMAND_NOT_DECLARED/);
  delete request.headers['x-openxiangda-csrf-token'];
  await assert.rejects(() => service.commandWithData(input), /CSRF_INVALID/);
  request.openxiangda.principal.principalType = 'application';
  await assert.rejects(() => service.commandWithData(input), /USER_CONTEXT_REQUIRED/);
  assert.equal(calls.length, 1);
});

test('original correction receipt is checked before current data and cannot restore another operation or input', async () => {
  const request: any = { headers: {}, openxiangda: { authorization:'Bearer user', perspectiveCode:null,
    principal:{principalType:'user',userId:'applicant',environmentKey:'preproduction'},
    operation:{code:'revalidate',requiredCapability:'request:submit',platformAccess:{workflow:{codes:['request-approval'],businessCommands:['resubmit']}}} } };
  const input: any = {workflowCode:'request-approval',target:{kind:'task',id:'task',command:'resubmit'},recordId:'record',expectedRevision:1,idempotencyKey:'original',commandToken:'old',input:{form:{expectedRevision:1,values:{amount:100}}}};
  const receipt: any = {status:'succeeded',taskId:'task',idempotencyKey:'original',command:'resubmit',result:{status:'running'},
    businessCommand:{operationCode:'revalidate',workflowCode:'request-approval',recordId:'record',inputDigest:sha256Digest(input.input)}};
  const calls: any[] = [];
  const platform: any = {workflowTaskCommandReceipt:async (...args:any[])=>{calls.push(args);return receipt;}};
  const service=new OpenXiangdaBusinessProcessService(request,platform);
  assert.equal((await service.resolveOriginalTaskCommand(input)).status,'succeeded');
  assert.deepEqual(calls[0],['Bearer user','task','original']);
  for (const changed of [{...input,recordId:'other'}, {...input,input:{form:{expectedRevision:1,values:{amount:200}}}}])
    await assert.rejects(()=>service.resolveOriginalTaskCommand(changed),/RECEIPT_INPUT_MISMATCH/);
  receipt.businessCommand.operationCode='other';
  await assert.rejects(()=>service.resolveOriginalTaskCommand(input),/RECEIPT_INPUT_MISMATCH/);
});
