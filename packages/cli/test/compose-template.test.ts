import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileApplicationSources, loadWorkspace, resolveApplicationTemplateSelection } from 'openxiangda-devkit-core';
import { composeWorkspaceTemplate } from '../src/compose-template.js';
import { calculateTemplateDigest, createWorkspace } from '../src/create-workspace.js';

test('invalid composition fails before creating the destination', async()=>{
 const temporary=mkdtempSync(join(tmpdir(),'template-invalid-'));const target=join(temporary,'app');
 try{for(const selection of [{scenario:'absent'},{scenario:'visitor',style:'absent'},{scenario:'visitor',admin:'absent'},{scenario:'visitor',without:['time-slot']},{scenario:'visitor',with:['absent']},{scenario:'visitor',with:['my-records'],without:['my-records']}]){
  await assert.rejects(createWorkspace({directory:target,appCode:'test-app',name:'测试',install:false,selection}),/TEMPLATE_/);
  assert.equal(existsSync(target),false);
 }}finally{rmSync(temporary,{recursive:true,force:true});}
});

test('visitor composition has stable digests and compiles with explicit source pages and least role access',async()=>{
 const first=composeWorkspaceTemplate({scenario:'visitor'}),second=composeWorkspaceTemplate({scenario:'visitor'});
 try{
  assert.equal(calculateTemplateDigest(first.root),calculateTemplateDigest(second.root));
  assert.deepEqual(first.components,second.components);
  const {config}=await loadWorkspace(first.root);const compiled=compileApplicationSources(config);
  assert.equal(config.backend.enabled,false);
  assert.deepEqual(config.data?.resources.map(item=>item.code).sort(),['companies','visits']);
  const host=config.authz?.roles.find(role=>role.code==='host');
  assert.ok(host?.capabilities.includes('app:openxiangda-application:data:visits:create'));
  assert.ok(!host?.capabilities.includes('app:openxiangda-application:data:visits:update'));
  assert.equal(config.frontend.admin?.access?.anyOf?.includes('app:openxiangda-application:data:visits:update'),true);
  assert.ok(compiled.contracts.value);
  for(const file of ['frames/admin/AdminShell.tsx','frames/pc/PcFrame.tsx','frames/mobile/MobileFrame.tsx','login/LoginForm.tsx','admin/visits/ListPage.tsx'])assert.ok(existsSync(join(first.root,'apps/web/src',file)));
  assert.match(readFileSync(join(first.root,'apps/web/src/main.tsx'),'utf8'),/resourcePages/);
 }finally{first.cleanup();second.cleanup();}
});

test('creation records component provenance and keeps the plain starter compatible',async()=>{
 const temporary=mkdtempSync(join(tmpdir(),'template-create-'));
 try{
  const result=await createWorkspace({directory:join(temporary,'visitor'),appCode:'test-visitor',name:'测试访客',install:false,selection:{scenario:'visitor',style:'graphite-blue',admin:'topbar',pc:'workbench',mobile:'task-list',login:'centered'}});
  assert.equal(result.template.ref,'builtin:composed:visitor');
  assert.equal(result.template.components?.length,11);
  const {config}=await loadWorkspace(result.root);
  assert.equal(config.app.code,'test-visitor');
  assert.ok(config.authz?.roles.find(role=>role.code==='host')?.capabilities.includes('app:test-visitor:data:visits:create'));
  const plain=await createWorkspace({directory:join(temporary,'plain'),appCode:'plain-app',name:'普通',install:false});
  assert.equal(plain.template.ref,'builtin:application');assert.equal(plain.template.components,undefined);
 }finally{rmSync(temporary,{recursive:true,force:true});}
});

test('simple CRUD is independent and retains source ownership without a backend',async()=>{
 const composed=composeWorkspaceTemplate({scenario:'crud'});
 try{const {config}=await loadWorkspace(composed.root);assert.equal(config.backend.enabled,false);assert.equal(config.data?.resources[0]?.code,'records');compileApplicationSources(config);assert.ok(existsSync(join(composed.root,'apps/web/src/admin/records/ListPage.tsx')));}finally{composed.cleanup();}
});


test('optional public entry uses the anonymous draft owner and exposes only declared fields',async()=>{
 const composed=composeWorkspaceTemplate({scenario:'visitor',with:['public-entry']});
 try{const {config}=await loadWorkspace(composed.root);const policy=config.frontend.publicAccess?.policies[0];assert.equal(policy?.mode,'anonymous');assert.equal(policy?.draft?.enabled,true);assert.ok(!policy?.fields.includes('status'));compileApplicationSources(config);assert.match(readFileSync(join(composed.root,'apps/web/src/main.tsx'),'utf8'),/visitorRegistration: Registration/);}finally{composed.cleanup();}
});
