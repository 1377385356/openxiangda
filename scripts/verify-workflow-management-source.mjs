import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as freePort } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..');
const web = createRequire(resolve(root, 'templates/application/apps/web/package.json'));
const { createServer } = await import(pathToFileURL(web.resolve('vite')));
const { chromium, expect } = web('@playwright/test');
const output = resolve(root, '.cache/workflow-management-source');
mkdirSync(output, {recursive:true});
const port = await new Promise((accept,reject) => {
  const server = freePort(); server.once('error',reject); server.listen(0,'127.0.0.1',() => {const {port}=server.address();server.close(()=>accept(port));});
});
const server = await createServer({ configFile:resolve(root,'scripts/fixtures/platform-browser/vite.workflow-management-source.config.ts'), server:{port,host:'127.0.0.1'},logLevel:'error' });
const definition = {schemaVersion:'openxiangda.workflow-definition/v2',code:'approval',title:'合同审批',startAt:'review',inputSchema:{type:'object',properties:{amount:{type:'number'}}},acceptedCommandDeactivationPolicy:'finish-pinned',
  nodes:{review:{id:'review',kind:'approval',title:'业务审核',binding:'reviewer',mode:'single',onApprove:'end',onReject:'end',allowedOperations:['approve'],administration:{modes:['single','any'],assigneeProviders:['app_role'],operations:['approve']}},end:{id:'end',kind:'end',title:'结束',outcome:'approved'}}};
const binding = {schemaVersion:'openxiangda.workflow-binding/v2',workflowCode:'approval',bindings:{reviewer:{provider:'app_role',roleCode:'reviewer'}}};
const configuration = {schemaVersion:'openxiangda.workflow-node-configurations/v2',workflowCode:'approval',definitionVersion:1,bindingVersion:1,effect:'future_node_entries_keep_existing_tasks',history:[],principals:{users:[],roles:[{code:'reviewer',name:'业务审核员'}]},nodes:[{nodeId:'review',kind:'approval',defaults:{title:'业务审核',mode:'single',binding:binding.bindings.reviewer,allowedOperations:['approve']},effective:{revision:0,title:'业务审核',mode:'single',binding:binding.bindings.reviewer,allowedOperations:['approve']},configuration:{revision:0,patch:null,updatedAt:null,updatedBy:null},administration:definition.nodes.review.administration}]};
const draft = {workflowCode:'approval',environmentKey:'preproduction',revision:1,baseHeadRevision:3,definitionVersion:1,bindingVersion:1,definition,binding,publishedDefinition:definition,publishedBinding:binding,diagnostics:[],publishable:true,updatedAt:null,updatedBy:null};
const published = {view:'published',workflowCode:'approval',environmentKey:'preproduction',headRevision:3,definitionVersion:1,bindingVersion:1,definition,binding};
const actions = {reader:['definition.read'],handler:['definition.read','handling.configure'],editor:['definition.read','draft.edit'],publisher:['definition.read','publication.publish'],revoked:['definition.read','draft.edit'],'handling-revoked':['definition.read','handling.configure'],busy:['definition.read','handling.configure'],'unknown-revoked':['definition.read','draft.edit'],'outcome-undetermined':['definition.read','draft.edit']};
let browser;
const checks=[],errors=[];
try {
  await server.listen(); browser=await chromium.launch({headless:true});
  // Workflow administration is PC-only by the user's 2026-10-13 scope decision.
  for (const width of [1440]) for (const mode of ['reader','handler','editor','publisher','legacy','super','revoked','handling-revoked','busy','unknown-revoked','outcome-undetermined']) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
    const requests=[];let lost=false, writes=0;
    await page.route('**/*', async route => {
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==`http://127.0.0.1:${port}`){errors.push(`external request ${url.origin}`);return route.abort();}
      if(!url.pathname.startsWith('/service/'))return route.continue();
      const body=request.postDataJSON();requests.push({path:url.pathname,method:request.method(),body});
      if(url.pathname.includes('/designers/')||url.pathname.includes('/node-configurations'))assert.equal(request.headers()['x-openxiangda-workflow-designer-contract'],'2');
      let data,status=200,errorCode;
      if(url.pathname.endsWith('/admin/context'))data={authorization:mode==='super'?'application_super_admin':'workflow_manager',headRevision:3};
      else if(url.pathname.endsWith('/node-configurations'))data=configuration;
      else if(url.pathname.endsWith('/outcome'))data={state:mode==='outcome-undetermined'?'undetermined':'not_committed'};
      else if(request.method()==='POST') {
        writes++;
        if(mode==='unknown-revoked'&&writes===1){status=500;errorCode='TEST_LOST_RESPONSE';}
        else if(mode==='busy'&&writes===1){status=503;errorCode='WORKFLOW_DESIGNER_AUTHORITY_BUSY';}
        else if(['revoked','handling-revoked','unknown-revoked','outcome-undetermined'].includes(mode)){lost=true;status=403;errorCode='WORKFLOW_DESIGNER_AUTHORITY_REQUIRED';}
        else if(mode==='busy')data={...configuration.nodes[0].configuration,revision:1,workflowCode:'approval',nodeId:'review',effect:configuration.effect,replayed:false};
        else {errors.push(`unexpected write ${mode} ${url.pathname}`);return route.abort();}
      } else if(url.pathname.endsWith('/draft')) {
        const authority={actions:lost?['definition.read']:actions[mode],admittedBy:'grant',evaluatedAt:'2026-10-13T00:00:00Z'};
        data=['legacy','super'].includes(mode)?draft:!lost&&['editor','publisher','revoked','unknown-revoked','outcome-undetermined'].includes(mode)?{...draft,view:'draft',authority}:{...published,authority};
      } else if(url.pathname.endsWith('/publications'))data=[];
      else {errors.push(`unexpected request ${url.pathname}`);return route.abort();}
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status,data:status===200?data:null,errorCode,message:errorCode})});
    });
    try {
      await page.goto(`http://127.0.0.1:${port}/workflow-management.e2e.html`);
      await expect(page.getByText('合同审批',{exact:true}).first()).toBeVisible();
      const draftMode=['editor','publisher','legacy','super','revoked','unknown-revoked','outcome-undetermined'].includes(mode);
      if(draftMode){
        await expect(page.getByRole('button',{name:'发布并启用',exact:true}))[['publisher','super'].includes(mode)?'toBeEnabled':'toBeDisabled']();
        await expect(page.getByRole('button',{name:/AI 助手$/}))[['editor','super','revoked','unknown-revoked','outcome-undetermined'].includes(mode)?'toBeEnabled':'toBeDisabled']();
      }else await expect(page.getByRole('button',{name:'发布并启用',exact:true})).toHaveCount(0);
      const panel=page.getByRole('region',{name:'办理设置',exact:true});
      await expect(panel).toBeVisible();
      if(['handler','handling-revoked','busy'].includes(mode)) await expect(panel.getByRole('radio',{name:'或签',exact:true})).toBeEnabled();
      else if(mode!=='super') await expect(panel.getByRole('radio',{name:'或签',exact:true})).toBeDisabled();
      if(['revoked','unknown-revoked','outcome-undetermined'].includes(mode)) {
        await page.getByRole('button',{name:/collapsed 节点名称/}).click();
        await page.getByRole('textbox',{name:'节点名称',exact:true}).fill('未保存的合同审核');
        if(mode==='unknown-revoked') {
          await expect.poll(async()=>JSON.parse(await page.getByLabel('宿主离开保护状态').innerText()).unknown).toBe(true);
          await page.getByRole('button',{name:'重试原保存请求',exact:true}).click();
          await expect.poll(()=>writes).toBe(2);
          const bodies=requests.filter(row=>row.method==='POST').map(row=>row.body);assert.deepEqual(bodies[0],bodies[1]);
        }
        await expect(page.getByRole('textbox',{name:'保留的流程与人员规则'})).toBeVisible();
        const retained=JSON.parse(await page.getByRole('textbox',{name:'保留的流程与人员规则'}).inputValue());
        assert.equal(retained.definition.nodes.review.title,'未保存的合同审核');assert.deepEqual(retained.binding,binding);
      }
      if(['handling-revoked','busy'].includes(mode)) {
        await panel.getByRole('radio',{name:'或签',exact:true}).check();
        await panel.getByRole('textbox',{name:'修改说明',exact:true}).fill('保留这次办理设置说明');
        await panel.getByRole('button',{name:'保存办理设置',exact:true}).click();
        if(mode==='handling-revoked') {
          const retained=page.getByRole('textbox',{name:'保留的办理设置输入'});await expect(retained).toBeVisible();
          assert.equal(JSON.parse(await retained.inputValue()).reason,'保留这次办理设置说明');assert.equal(JSON.parse(await retained.inputValue()).mode,'any');
        } else {
          await expect(page.getByText('权限正在变更，本次未写入；请稍后重试原保存请求。')).toBeVisible();
          await expect.poll(async()=>JSON.parse(await page.getByLabel('宿主离开保护状态').innerText()).unknown).toBe(false);
          await panel.getByRole('button',{name:'保存办理设置',exact:true}).click();
          await expect.poll(()=>writes).toBe(2);
          assert.deepEqual(requests.filter(row=>row.method==='POST').map(row=>row.body)[0],requests.filter(row=>row.method==='POST').map(row=>row.body)[1]);
        }
      }
      if(['revoked','handling-revoked','unknown-revoked','outcome-undetermined'].includes(mode)) {
        await expect.poll(()=>requests.filter(row=>row.path.endsWith('/outcome')).length).toBe(1);
        await expect.poll(async()=>JSON.parse(await page.getByLabel('宿主离开保护状态').innerText())).toEqual({dirty:true,busy:false,unknown:mode==='outcome-undetermined'});
        await page.waitForTimeout(1200);assert.equal(writes,mode==='unknown-revoked'?2:1);assert.equal(requests.filter(row=>row.path.endsWith('/outcome')).length,1);
      }
      if(!['revoked','handling-revoked','busy','unknown-revoked','outcome-undetermined'].includes(mode))assert.equal(writes,0);
      await page.screenshot({path:resolve(output,`${mode}-${width}.png`),fullPage:true,animations:'disabled'});
      checks.push({width,mode,writes,passed:true});
    } catch(error) {
      await page.screenshot({path:resolve(output,`failure-${mode}-${width}.png`),fullPage:true});
      writeFileSync(resolve(output,`failure-${mode}-${width}.txt`),await page.locator('body').innerText());
      console.error({width,mode,errors,requests});throw error;
    } finally {await context.close();}
  }
  assert.deepEqual(errors,[]);
  const report={schema:'openxiangda.workflow-management-source-verification/v1',verifiedAt:new Date().toISOString(),checks,errors,scope:'Real SDK React with intercepted HTTP; not deployed or real-role business acceptance'};
  writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close();}
