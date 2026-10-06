import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWorkflowDelegationCatalog, listWorkflowDelegations, listWorkflowDelegationCandidates,
  previewWorkflowDelegationMutation, executeWorkflowDelegationMutation, loadWorkflowDelegationMutationReceipt,
} from '../src/browser/platform-client';
import type { WorkflowDelegationMutationRequest } from 'openxiangda-contracts/browser';

test('delegation SDK binds reads and writes to the mounted environment and preserves original recovery bytes', async () => {
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  const metadata: Record<string,string> = { 'openxiangda-runtime-base':'/dev/delegation-fixture', 'openxiangda-app-code':'delegation-fixture', 'openxiangda-environment':'preproduction' };
  globalThis.document = { querySelector: (selector:string) => ({ content:metadata[selector.match(/name="([^"]+)"/)?.[1] || ''] || '' }) } as any;
  const calls: Array<{url:string;init?:RequestInit}> = [];
  let status=200;
  globalThis.fetch=async (url,init) => {
    calls.push({url:String(url),init});
    return new Response(JSON.stringify({code:status,data:status===200?{csrfToken:'fixture-csrf'}:{errorCode:'FIXTURE_DELEGATION_FAILURE'}}),{status});
  };
  const input: WorkflowDelegationMutationRequest = { schemaVersion:'openxiangda.workflow-delegation-mutation/v2', operation:'revoke',
    environmentKey:'preproduction', operationId:'761f3295-0e7f-4493-851e-052a0b8e9b74', delegationId:'9aad8f64-d7b6-4488-9f37-9c9cafb7746c', expectedRevision:2, reason:'合成撤销' };
  try {
    await loadWorkflowDelegationCatalog();
    await listWorkflowDelegations({all:true,keyword:'代理',offset:20,limit:20});
    await listWorkflowDelegationCandidates({delegatorRoleSubjectKey:'membership:9aad8f64-d7b6-4488-9f37-9c9cafb7746c',validFrom:'2026-10-02T00:00:00Z',validTo:'2026-10-03T00:00:00Z'});
    assert.ok(calls.every(call=>new URL(call.url,'http://fixture.local').searchParams.get('environmentKey')==='preproduction'));
    const before=calls.length;
    await assert.rejects(listWorkflowDelegations({environmentKey:'production'} as any),/ENVIRONMENT_MISMATCH/);
    await assert.rejects(listWorkflowDelegationCandidates({environmentKey:'production'} as any),/ENVIRONMENT_MISMATCH/);
    await assert.rejects(executeWorkflowDelegationMutation({...input,environmentKey:'production'}),/ENVIRONMENT_MISMATCH/);
    assert.equal(calls.length,before,'foreign environment is rejected before any request');
    await previewWorkflowDelegationMutation(input);
    status=503;
    await assert.rejects(executeWorkflowDelegationMutation(input));
    const writes=()=>calls.filter(call=>call.url.includes('/delegation-management/execute'));
    assert.equal(writes().length,1,'unknown writes are not automatically replayed');
    status=404;
    await assert.rejects(loadWorkflowDelegationMutationReceipt(input.operationId),(error:any)=>error.status===404);
    status=200;
    await executeWorkflowDelegationMutation(input);
    assert.equal(writes().length,2);
    assert.equal(writes()[0]!.init!.body,writes()[1]!.init!.body,'explicit retry keeps the exact request');
    assert.equal(new Headers(writes()[1]!.init!.headers).get('x-openxiangda-csrf-token'),'fixture-csrf');
    status=409;
    await assert.rejects(executeWorkflowDelegationMutation(input),(error:any)=>error.status===409);
    assert.equal(writes().length,3,'explicit CAS rejection never auto-retries');
    status=200;
    await listWorkflowDelegationCandidates({delegatorRoleSubjectKey:'membership:9aad8f64-d7b6-4488-9f37-9c9cafb7746c',workflowCode:'one',nodeId:'final',validFrom:'2026-10-02T00:00:00Z',validTo:'2026-10-03T00:00:00Z'});
    assert.equal(new URL(calls.at(-1)!.url,'http://fixture.local').searchParams.get('nodeId'),'final');
    const scoped:WorkflowDelegationMutationRequest={schemaVersion:input.schemaVersion,environmentKey:input.environmentKey,operation:'create',operationId:'86013ba0-3cd7-433a-874e-310fdd62e858',reason:'合成节点代理',workflowCode:'one',nodeId:'final',delegatorRoleSubjectKey:'membership:9aad8f64-d7b6-4488-9f37-9c9cafb7746c',expectedDelegatorRevision:1,delegateUserId:'delegate',delegateRoleSubjectKey:'membership:442e91ba-5a51-43a1-9ac4-94dc655f1e49',expectedDelegateRevision:1,validFrom:'2026-10-02T00:00:00Z',validTo:'2026-10-03T00:00:00Z'};
    await executeWorkflowDelegationMutation(scoped);
    const scopedBody=calls.at(-1)!.init!.body;
    await executeWorkflowDelegationMutation(scoped);
    assert.equal(calls.at(-1)!.init!.body,scopedBody,'node scope survives explicit original-request recovery');
    assert.equal(JSON.parse(String(scopedBody)).nodeId,'final');
    assert.ok(calls.every(call=>call.init?.credentials==='include'));
  } finally {
    globalThis.fetch=oldFetch;
    if(oldDocument===undefined) delete (globalThis as any).document; else globalThis.document=oldDocument;
  }
});
