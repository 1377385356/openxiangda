import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import Ajv from 'ajv';
import { assertNativeRoleMembershipBatchInput, contractSchemas } from 'openxiangda-contracts';

const input = (items: unknown[]) => ({ schemaVersion: 'openxiangda.native-role-membership-batch-request/v2', items });
const create = (userId = 'member-a') => ({ operation: 'create', operationId: randomUUID(), reason: '合成角色维护', userId, roleCode: 'reviewer' });
const ajv = new Ajv({ strict: false, allErrors: true, formats: {
  uuid: /^[0-9a-f-]{36}$/i,
  'date-time': { type: 'string', validate: (value: string) => /T/.test(value) && Number.isFinite(Date.parse(value)) },
} });
const requestSchema = ajv.compile(contractSchemas.nativeRoleMembershipBatchRequest);
const resultSchema = ajv.compile(contractSchemas.nativeRoleMembershipBatchResult);

test('batch input rejects cross-authority fields, duplicate targets, mixed actions and resource excess', () => {
  const valid = input([create('a'),create('b')]);
  assertNativeRoleMembershipBatchInput(valid); assert.equal(requestSchema(valid),true);
  const first = create();
  for (const invalid of [
    { ...input([first]), actorUserId: 'forged' },
    input([first,{ ...create(), operationId: first.operationId }]),
    input([first,create()]),
    input([first,{ operation:'revoke', operationId:randomUUID(),membershipId:randomUUID(),expectedRevision:1,reason:'撤销' }]),
    input([]), input(Array.from({length:51},(_,i)=>create(`member-${i}`))),
    input([{ ...first, scopeGrants:[{ dimensionCode:'college',values:['x'.repeat(140000)] }] }]),
  ]) assert.throws(()=>assertNativeRoleMembershipBatchInput(invalid));
});

test('the public response separates an uncommitted proposal, durable receipt and unconfirmed outcome', () => {
  const proposed = {userId:'member-a',roleCode:'reviewer',roleSource:'package',sourceCode:'manual',scopeGrants:[],status:'active',validFrom:null,validTo:null};
  const identity = {index:0,operationId:randomUUID(),operation:'create'};
  const envelope = {schemaVersion:'openxiangda.native-role-membership-batch-result/v2',mode:'preview',requestDigest:'a'.repeat(64),succeeded:1,failed:0,unconfirmed:0,effect:'future_assignment_keep_existing_tasks'};
  const ready = { ...identity,status:'ready',before:null,after:proposed };
  assert.equal(resultSchema({...envelope,items:[ready]}),true,JSON.stringify(resultSchema.errors));
  assert.equal(resultSchema({...envelope,items:[{...ready,after:{...proposed,id:randomUUID()}}]}),false);
  const member = { ...proposed,id:randomUUID(),environmentId:randomUUID(),maintainable:true,immutableReason:null,revision:1 };
  const committed = { ...identity,status:'committed',result:{membership:member,roleSubjectSetVersion:'1',receipt:{
    schemaVersion:'openxiangda.native-authorization-mutation-receipt/v2',operationId:identity.operationId,operationKind:'membership.create',requestDigest:'a'.repeat(64),actorUserId:'admin',reason:'合成维护',result:{membership:member},replayed:false,createdAt:'2026-10-02T00:00:00.000Z',
  }} };
  assert.equal(resultSchema({...envelope,mode:'execute',items:[committed]}),true,JSON.stringify(resultSchema.errors));
  assert.equal(resultSchema({...envelope,items:[committed]}),false);
  assert.equal(resultSchema({...envelope,mode:'execute',items:[ready]}),false);
  const uncertain = {...identity,status:'unconfirmed',error:{code:'OPENXIANGDA_NATIVE_AUTHZ_BATCH_ITEM_FAILED',status:503,pointer:'/items/0',retryable:true}};
  assert.equal(resultSchema({...envelope,mode:'execute',succeeded:0,unconfirmed:1,items:[uncertain]}),true);
  assert.equal(resultSchema({...envelope,mode:'execute',succeeded:0,unconfirmed:1,items:[{...uncertain,error:{...uncertain.error,message:'private sql'}}]}),false);
});
