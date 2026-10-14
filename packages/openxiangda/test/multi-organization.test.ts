import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRuntimeAuthorization, loadCurrentDirectoryClasses, loadCurrentDirectoryRoleFacts, loadCurrentOrganizationMemberships,
  switchCurrentOrganization, subscribePlatformOrganizationInvalidation, createManagedConcurrencyClient } from '../src/browser/platform-client';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const reply = (data: unknown, status = 200) => new Response(JSON.stringify({ code: status, data }), { status });
const auth = (org?: string) => ({ schemaVersion: 'openxiangda.runtime-authorization/v2', state: 'active', roles: [], subjectProfile: {},
  environment: { id: 'environment', key: 'preproduction', headRevision: 1, ...(org ? { activeOrganizationId: org } : {}) },
  principal: { type: 'user_union', userId: 'user', roleCodes: ['teacher'], capabilityCodes: ['claim'], isAppSuperAdmin: false,
    identityScope: `verified:${org || 'legacy'}`, ...(org ? { activeOrganizationId: org } : {}) } });
const receipt = (id: string) => ({ activeOrganizationId: id, organization: { id, corpId: 'corp', name: '测试学校', providerName: null,
  parentId: null, level: 1, ancestorIds: [] }, memberships: [], accessToken: 'must-not-be-returned', token: 'must-not-be-returned' });
let scenario = 0;
async function withRuntime(run: (set: (handler: (url: string, init: RequestInit) => Promise<Response>) => void) => Promise<void>) {
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document;
  const meta: Record<string,string> = { 'openxiangda-runtime-base': '/runtime/organization', 'openxiangda-app-code': `organization-${++scenario}`, 'openxiangda-environment': 'preproduction' };
  globalThis.document = { querySelector: (selector: string) => ({ content: meta[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  let handler = async (_url: string, _init: RequestInit) => reply(auth(A));
  globalThis.fetch = async (url, init) => String(url).includes('/organization/switch-surface') ? reply({ csrfToken: 'verified-csrf' }) : handler(String(url), init || {});
  try { await run(next => { handler = next; }); }
  finally { globalThis.fetch = previousFetch; if (previousDocument === undefined) delete (globalThis as any).document; else globalThis.document = previousDocument; }
}

test('working organization survives the projection, traditional context remains optional, mismatch retires stale authority', async () => {
  await withRuntime(async set => {
    assert.equal((await loadRuntimeAuthorization()).identity?.activeOrganizationId, A);
    const client = createManagedConcurrencyClient();
    set(async () => reply({ ...auth(A), environment: auth(B).environment }));
    await assert.rejects(loadRuntimeAuthorization({ refresh: true }), /OPENXIANGDA_RUNTIME_ORGANIZATION_MISMATCH/);
    await assert.rejects(client.result({ command: 'claim', requestKey: 'original' }), { code: 'CONCURRENCY_IDENTITY_CHANGED' });
    set(async () => reply(auth()));
    assert.equal((await loadRuntimeAuthorization({ refresh: true })).identity?.activeOrganizationId, undefined);
  });
});

test('switch retires cached authority and a late former-school read without exposing tokens', async () => {
  await withRuntime(async set => {
    await loadRuntimeAuthorization();
    const client = createManagedConcurrencyClient();
    let finish!: (response: Response) => void, invalidations = 0;
    const unsubscribe = subscribePlatformOrganizationInvalidation(() => invalidations++);
    set(async (url) => url.includes('memberships') ? new Promise(resolve => { finish = resolve; }) : reply(receipt(B)));
    const reading = assert.rejects(loadCurrentOrganizationMemberships(), /OPENXIANGDA_READ_SCOPE_CHANGED/);
    const result = await switchCurrentOrganization(B);
    assert.deepEqual(Object.keys(result).sort(), ['activeOrganizationId', 'memberships', 'organization']);
    assert.equal(invalidations, 1);
    finish(reply([])); await reading;
    await assert.rejects(client.result({ command: 'claim', requestKey: 'original' }), { code: 'CONCURRENCY_IDENTITY_CHANGED' });
    set(async () => reply(auth(B)));
    assert.equal((await loadRuntimeAuthorization()).identity?.activeOrganizationId, B);
    unsubscribe();
  });
});

test('explicit denial preserves authority; transport uncertainty invalidates and never replays the switch', async () => {
  await withRuntime(async set => {
    const original = await loadRuntimeAuthorization(); let writes = 0;
    set(async () => { writes++; return reply(null, 403); });
    await assert.rejects(switchCurrentOrganization(B));
    assert.equal(await loadRuntimeAuthorization(), original);
    assert.equal(writes, 1);
    set(async () => { writes++; throw new TypeError('network disconnected'); });
    await assert.rejects(switchCurrentOrganization(B)); assert.equal(writes, 2);
    set(async () => reply(auth(B)));
    assert.equal((await loadRuntimeAuthorization()).identity?.activeOrganizationId, B);
  });
});

test('facts use bounded current-user pagination and reject cross-school responses', async () => {
  await withRuntime(async set => {
    await loadRuntimeAuthorization(); const requests: string[] = [];
    set(async url => { requests.push(url); return reply({ schemaVersion: 'openxiangda.directory-role-facts/v1', organizationId: A, userId: 'user',
      items: [{ id: B, subjectId: A, source: 'dingtalk_school_contact', roleCode: 'head_teacher', scopeType: 'class', scopeValue: 'same-source-class' }], nextCursor: B }); });
    const facts = await loadCurrentDirectoryRoleFacts({ limit: 1, after: A });
    assert.equal(facts.items[0].scopeValue, 'same-source-class'); assert.match(requests[0], /limit=1&after=/);
    await assert.rejects(loadCurrentDirectoryRoleFacts({ limit: 201 }), /PLATFORM_DIRECTORY_PAGE_INVALID/); assert.equal(requests.length, 1);
    set(async () => reply({ ...facts, organizationId: B }));
    await assert.rejects(loadCurrentDirectoryRoleFacts(), /PLATFORM_DIRECTORY_CONTEXT_MISMATCH/);
  });
});

test('class projections reject cross-context replies, oversized pages and former-school in-flight results', async () => {
  await withRuntime(async set => {
    await loadRuntimeAuthorization();
    const result={schemaVersion:'openxiangda.directory-class-page/v1',organizationId:A,userId:'user',nextCursor:null,
      items:[{directoryClassId:B,sourceClassId:'same-source',name:'合成班级',sourceCampusId:'c',sourcePeriodId:'p',sourceGradeId:'g',campusName:null,periodName:null,gradeName:null,roleCodes:['guardian']}]};
    let requests=0;
    set(async()=>{requests++;return reply(result);});
    assert.equal((await loadCurrentDirectoryClasses({limit:1})).items[0]?.sourceClassId,'same-source');
    await assert.rejects(loadCurrentDirectoryClasses({limit:201}),/PAGE_INVALID/);assert.equal(requests,1);
    set(async()=>reply({...result,organizationId:B}));
    await assert.rejects(loadCurrentDirectoryClasses(),/RESPONSE_INVALID/);
    let finish!:(response:Response)=>void;
    set(async url=>url.includes('directory-classes')?new Promise(resolve=>{finish=resolve;}):reply(receipt(B)));
    const old=assert.rejects(loadCurrentDirectoryClasses(),/OPENXIANGDA_READ_SCOPE_CHANGED/);
    await switchCurrentOrganization(B);finish(reply(result));await old;
  });
});
