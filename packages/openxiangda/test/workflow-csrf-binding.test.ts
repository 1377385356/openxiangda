import assert from 'node:assert/strict';
import test from 'node:test';
import {logoutCurrentUser,loadApplicationLoginSurface,loadWorkflowTaskDetail,loadWorkflowTaskSurface,loadWorkflowInstanceDetail,loadWorkflowInstanceSurface,loadWorkflowRecordDetail,executeWorkflowOperation,fetchWorkflowDataFileBlob,loadWorkflowDataFilePreview} from '../src/browser/platform-client';

test('workflow commands keep the CSRF binding of their issued surface after another login surface loads',async()=>{
 const oldFetch=globalThis.fetch,oldDocument=globalThis.document;
 const meta:Record<string,string>={'openxiangda-runtime-base':'/dev/workflow-binding','openxiangda-app-code':'workflow-binding','openxiangda-environment':'preproduction'};
 globalThis.document={querySelector:(s:string)=>({content:meta[s.match(/name="([^"]+)"/)?.[1]||'']||''})} as any;
 let generation=0,issued=0;const bindings=new Map<string,string>();let calls=0;
 const ok=(data:unknown)=>new Response(JSON.stringify({code:200,data}),{status:200});
 const operation={key:'approve',kind:'workflow_command',visible:true,enabled:true,execute:{href:'/openxiangda-api/v2/applications/workflow-binding/workflow/tasks/task/commands/approve',method:'POST'}};
 globalThis.fetch=async(url,init)=>{
  const path=String(url),csrf=new Headers(init?.headers).get('x-openxiangda-csrf-token');
  if(path.includes('/auth/surface'))return ok({csrfToken:`csrf-${++generation}`});
  if(path.includes('/commands/')){calls++;const input=JSON.parse(String(init?.body));assert.equal(csrf,bindings.get(input.commandToken),'command must retain the exact header used to issue its surface');return ok({advanced:true});}
  const commandToken=`issued-${++issued}`;bindings.set(commandToken,csrf!);const surface={commandToken,commandTokenExpiresAt:new Date(Date.now()+60000).toISOString(),operations:[operation],presentation:{}};
  return ok(path.includes('/detail')?{surface}:surface);
 };
 try{
  for(const load of [()=>loadWorkflowTaskDetail('task'),()=>loadWorkflowTaskSurface('task'),()=>loadWorkflowInstanceDetail('instance'),()=>loadWorkflowInstanceSurface('instance'),()=>loadWorkflowRecordDetail('activities','record')]){
   if(issued>0)await loadApplicationLoginSurface({device:'desktop',returnTo:'/'});
   const result:any=await load();const surface=result.surface||result;
   await loadApplicationLoginSurface({device:'desktop',returnTo:'/'});
   await executeWorkflowOperation(surface,surface.operations[0],{},{idempotencyKey:`once-${issued}`});
  }
  assert.equal(calls,5);
 }finally{globalThis.fetch=oldFetch;if(oldDocument===undefined)delete(globalThis as any).document;else globalThis.document=oldDocument;}
});

test('workflow file metadata and thumbnails carry CSRF and preserve denied responses',async()=>{
 const oldFetch=globalThis.fetch,oldDocument=globalThis.document;
 const meta:Record<string,string>={'openxiangda-runtime-base':'/dev/workflow-files','openxiangda-app-code':'workflow-files','openxiangda-environment':'preproduction'};
 globalThis.document={querySelector:(s:string)=>({content:meta[s.match(/name="([^"]+)"/)?.[1]||'']||''})} as any;
 let deny=false;const calls:string[]=[];globalThis.fetch=async(url,init)=>{
  const path=String(url);if(path.includes('/auth/surface'))return new Response(JSON.stringify({code:200,data:{csrfToken:'file-csrf'}}));
  assert.equal(init?.credentials,'include');assert.equal(new Headers(init?.headers).get('x-openxiangda-csrf-token'),'file-csrf');calls.push(path);
  if(deny)return new Response(JSON.stringify({code:403,errorCode:'WORKFLOW_V2_FILE_FIELD_FORBIDDEN'}),{status:403});
  return path.includes('/preview?')?new Response(JSON.stringify({code:200,data:{canPreview:true}})):new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/webp'}});
 };
 try{
  await loadApplicationLoginSurface({device:'desktop',returnTo:'/'});const binding={instanceId:'instance',resourceCode:'activities',recordId:'record',fieldCode:'cover'};
  await loadWorkflowDataFilePreview(binding,'file');const blob=await fetchWorkflowDataFileBlob(binding,'file','thumbnail');assert.equal(blob.size,3);assert.ok(calls[1].includes('variant=thumbnail'));
  deny=true;await assert.rejects(()=>fetchWorkflowDataFileBlob(binding,'file'),/HTTP_403/);await assert.rejects(()=>loadWorkflowDataFilePreview(binding,'file'),/WORKFLOW_V2_FILE_FIELD_FORBIDDEN/);assert.equal(calls.length,4,'denial must not be retried with broader access');
 }finally{globalThis.fetch=oldFetch;if(oldDocument===undefined)delete(globalThis as any).document;else globalThis.document=oldDocument;}
});


test('logout clears a previous surface binding and does not retry a rejected command',async()=>{
 const oldFetch=globalThis.fetch,oldDocument=globalThis.document;
 const meta:Record<string,string>={'openxiangda-runtime-base':'/dev/workflow-logout','openxiangda-app-code':'workflow-logout','openxiangda-environment':'preproduction'};
 globalThis.document={querySelector:(s:string)=>({content:meta[s.match(/name="([^\"]+)"/)?.[1]||'']||''})} as any;
 let csrf='before-logout',writes=0;const ok=(data:unknown)=>new Response(JSON.stringify({code:200,data}));
 const operation={key:'approve',kind:'workflow_command',visible:true,enabled:true,execute:{href:'/approve',method:'POST'}};
 globalThis.fetch=async(url,init)=>{
  const path=String(url);if(path.includes('/auth/surface'))return ok({csrfToken:csrf});
  if(path.includes('/auth/logout'))return ok({});
  if(path==='/service/approve'){writes++;assert.equal(new Headers(init?.headers).get('x-openxiangda-csrf-token'),'after-logout');return new Response(JSON.stringify({code:403,errorCode:'WORKFLOW_V2_COMMAND_TOKEN_BINDING_INVALID'}),{status:403});}
  return ok({commandToken:'before-logout-command',commandTokenExpiresAt:new Date(Date.now()+60000).toISOString(),operations:[operation],presentation:{}});
 };
 try{
  await loadApplicationLoginSurface({device:'desktop',returnTo:'/'});const surface=await loadWorkflowTaskSurface('task');
  await logoutCurrentUser();csrf='after-logout';
  await assert.rejects(()=>executeWorkflowOperation(surface,surface.operations[0],{},{idempotencyKey:'original'}),(e:any)=>e.code==='WORKFLOW_V2_COMMAND_TOKEN_BINDING_INVALID');
  assert.equal(writes,1,'old approval must not be automatically retried after session change');
 }finally{globalThis.fetch=oldFetch;if(oldDocument===undefined)delete(globalThis as any).document;else globalThis.document=oldDocument;}
});

test('administrator step recovery retains its preview CSRF and original request across an unknown result',async()=>{
 const {previewWorkflowBusinessStepRecovery,executeWorkflowBusinessStepRecovery}=await import('../src/browser/platform-client');
 const oldFetch=globalThis.fetch,oldDocument=globalThis.document;
 const meta:Record<string,string>={'openxiangda-runtime-base':'/dev/step-recovery','openxiangda-app-code':'step-recovery','openxiangda-environment':'preproduction'};
 globalThis.document={querySelector:(s:string)=>({content:meta[s.match(/name="([^"]+)"/)?.[1]||'']||''})} as any;
 let csrf='preview-csrf',previewCsrf='',writes=0;const bodies:string[]=[];
 globalThis.fetch=async(url,init)=>{
  const path=String(url),ok=(data:unknown)=>Response.json({code:200,data});
  if(path.includes('/auth/surface'))return ok({csrfToken:csrf});
  if(path.endsWith('/preview')){previewCsrf=new Headers(init?.headers).get('x-openxiangda-csrf-token')!;assert.deepEqual(JSON.parse(String(init?.body)),{environmentKey:'preproduction',action:'admin_retry_step'});return ok({action:'admin_retry_step',canCommit:true,commandToken:'step-preview',expiresAt:new Date(Date.now()+60000).toISOString(),target:{nodeId:'calculate'}});}
  if(path.includes('/commands/admin_retry_step')){writes++;assert.equal(new Headers(init?.headers).get('x-openxiangda-csrf-token'),previewCsrf);bodies.push(String(init?.body));if(writes===1)throw new TypeError('response lost');return ok({advanced:true});}
  throw new Error(`unexpected path: ${path}`);
 };
 try{
  await loadApplicationLoginSurface({device:'desktop',returnTo:'/'});const preview=await previewWorkflowBusinessStepRecovery('instance');csrf='later-login-csrf';await loadApplicationLoginSurface({device:'desktop',returnTo:'/'});
  const input={commandToken:preview.commandToken!,idempotencyKey:'original-recovery-key',input:{reason:'修复后续人员'}};
  await assert.rejects(()=>executeWorkflowBusinessStepRecovery('instance',input),/未取得确定响应/);
  assert.equal(writes,1,'SDK must not blindly repeat an uncertain write');await executeWorkflowBusinessStepRecovery('instance',input);assert.equal(bodies[0],bodies[1]);
 }finally{globalThis.fetch=oldFetch;if(oldDocument===undefined)delete(globalThis as any).document;else globalThis.document=oldDocument;}
});
