import assert from 'node:assert/strict';
import test from 'node:test';
import { saveWorkflowDesignerDraft, previewWorkflowDesignerPublication, requestWorkflowDesignerProposal } from '../src/browser/platform-client';

test('designer management preserves platform session, exact write identity and refusal without an application login', async () => {
  const originalFetch=globalThis.fetch, originalDocument=globalThis.document;
  const meta:Record<string,string>={'openxiangda-runtime-base':'/platform/admin-console/design-test/preproduction/','openxiangda-app-code':'design-test','openxiangda-environment':'preproduction'};
  globalThis.document={querySelector:(selector:string)=>({content:meta[selector.match(/name="([^"]+)"/)?.[1]||'']||''})} as any;
  const writes:Array<{path:string;body:any}>=[];let loseReply=true,deny=false;
  globalThis.fetch=async(url,init)=>{
    const path=String(url);assert.ok(!path.includes('/auth/'),'management writes never bootstrap an application login');
    assert.equal(init?.credentials,'include');assert.equal(init?.method,'POST');
    const body=JSON.parse(String(init?.body));writes.push({path,body});
    assert.equal(body.environmentKey,'preproduction');
    if(loseReply){loseReply=false;throw new TypeError('response lost');}
    return deny?Response.json({code:403,errorCode:'WORKFLOW_MANAGEMENT_PERMISSION_REQUIRED',message:'denied'},{status:403}):Response.json({code:200,data:{revision:1}});
  };
  const input={expectedRevision:0,expectedHeadRevision:1,operationId:'original-designer-write',definition:{code:'review'},binding:{workflowCode:'review'}} as any;
  try {
    await assert.rejects(()=>saveWorkflowDesignerDraft('review',input),/未取得确定响应/);
    assert.equal(writes.length,1,'uncertain management writes do not automatically replay');
    await saveWorkflowDesignerDraft('review',input);assert.deepEqual(writes[0],writes[1]);
    assert.ok(writes[0]!.path.endsWith('/workflow/management/designers/review/draft'));
    await previewWorkflowDesignerPublication('review',{expectedRevision:1});
    await requestWorkflowDesignerProposal('review',{expectedRevision:1,operationId:'original-proposal',prompt:'rename the review node'});
    deny=true;await assert.rejects(()=>saveWorkflowDesignerDraft('review',input),(error:any)=>error.status===403&&error.code==='WORKFLOW_MANAGEMENT_PERMISSION_REQUIRED');
    assert.equal(writes.length,5,'a permission refusal is returned without changing identity');
  } finally {globalThis.fetch=originalFetch;if(originalDocument===undefined)delete(globalThis as any).document;else globalThis.document=originalDocument;}
});
