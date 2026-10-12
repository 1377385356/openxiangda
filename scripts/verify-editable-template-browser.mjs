import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer as freePortServer } from 'node:net';
import { createWorkspace } from '../packages/cli/dist/create-workspace.js';
import { loadWorkspace, compileApplicationSources } from '../packages/devkit-core/dist/index.js';

// Browser fixtures verify source composition; no real platform or model is contacted.
const sdk=resolve(import.meta.dirname,'..');
const webTools=createRequire(join(sdk,'templates/application/apps/web/package.json'));
const {chromium,expect}=webTools('@playwright/test');
const {build}=createRequire(join(sdk,'packages/devkit-core/package.json'))('esbuild');
const {createServer}=await import(pathToFileURL(webTools.resolve('vite')));
const temporary=mkdtempSync(join(tmpdir(),'editable-template-browser-'));
const root=join(temporary,'visitor');const output=resolve(process.env.OPENXIANGDA_TEMPLATE_EVIDENCE_DIR||join(sdk,'.cache/editable-template-browser'));
mkdirSync(output,{recursive:true});let server,browser;
const checks=[],errors=[],queries=[],consoleMessages=[];let preference=null;
try{
 await createWorkspace({directory:root,appCode:'openxiangda-application',name:'访客接待',selection:{scenario:'visitor'},install:false});
 const {config}=await loadWorkspace(root);const compiled=compileApplicationSources(config);
 writeFileSync(join(root,'packages/contracts/src/generated.ts'),compiled.contracts.typescript);
 symlinkSync(join(sdk,'templates/application/node_modules'),join(root,'node_modules'),'dir');
 symlinkSync(join(sdk,'templates/application/apps/web/node_modules'),join(root,'apps/web/node_modules'),'dir');
 const web=realpathSync(join(root,'apps/web'));const helperDir=join(web,'platform-e2e');mkdirSync(helperDir);
 cpSync(join(sdk,'scripts/fixtures/platform-browser/platform-e2e/resource-platform-mock.ts'),join(helperDir,'resource-platform-mock.ts'));
 const bundled=await build({entryPoints:[join(helperDir,'resource-platform-mock.ts')],bundle:true,write:false,platform:'node',format:'esm'});
 const {mockPlatform,runtimeAuthorization}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
 const sourceList=join(web,'src/admin/visits/ListPage.tsx');
 writeFileSync(sourceList,readFileSync(sourceList,'utf8').replace('columnRenderers:{status:', 'columnRenderers:{visitorName:({value})=><strong data-testid="editable-column">{String(value)}</strong>,status:').replace('<ResourceListActions controller={controller}/><ResourceListQueryBar controller={controller}/>', '<ResourceListQueryBar controller={controller}/><ResourceListActions controller={controller}/>'));
 const html=readFileSync(join(web,'index.html'),'utf8').replace('<head>','<head><meta name="openxiangda-runtime-base" content="/"/><meta name="openxiangda-app-code" content="openxiangda-application"/><meta name="openxiangda-environment" content="preproduction"/>');writeFileSync(join(web,'index.html'),html);
 const port=await new Promise((accept,reject)=>{const probe=freePortServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const value=probe.address().port;probe.close(()=>accept(value));});});
 server=await createServer({root:web,configFile:join(web,'vite.config.ts'),server:{port,host:'127.0.0.1',strictPort:true,fs:{allow:[realpathSync(sdk),realpathSync(root)]}},logLevel:'error'});await server.listen();
 const transformed=await server.transformRequest('/src/main.tsx');writeFileSync(join(output,'transformed-main.js'),transformed?.code||'');
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});const page=await context.newPage();page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));page.on('console',message=>consoleMessages.push({type:message.type(),text:message.text()}));
 const rows=[{id:'visit-1',revision:1,visitorName:'张伟',company:'华辰科技',area:{value:'building-3',label:'3 号楼'},arriveAt:'2026-10-12T07:00:00Z',purpose:'合同交流',created_at:'2026-10-11T06:00:00Z'}, {id:'visit-2',revision:1,visitorName:'李婷',company:'远山设计',area:{value:'building-5',label:'5 号楼'},arriveAt:'2026-10-12T08:00:00Z',purpose:'项目会议',status:{value:'arrived',label:'已到访'},created_at:'2026-10-11T06:00:00Z'}];
 await mockPlatform(page,true,'/view/openxiangda-application',false,{visits:rows});
 await page.route('**/service/**/admin-list/preferences/**',async route=>{const method=route.request().method();if(method==='PUT')preference=route.request().postDataJSON();if(method==='DELETE')preference=null;await route.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:preference})});});
 page.on('request',request=>{if(request.url().endsWith('/native/data/visits/query'))queries.push(request.postDataJSON());});
 await page.goto('http://127.0.0.1:'+port+'/admin/resources/visits');
 await expect(page.locator('[data-app-admin-shell]')).toHaveCount(1);await expect(page.locator('.oxa-sider')).toHaveCount(0);await expect(page.getByTestId('editable-column').first()).toHaveText('张伟');
 assert.ok(await page.locator('.oxa-list-toolbar-secondary').evaluate(node=>node.parentElement.firstElementChild===node));
 checks.push('one app-source admin shell, reordered query bar and custom column renderer');
 await page.getByRole('button',{name:'新增',exact:true}).click();await expect(page.locator('[data-app-resource-form]')).toHaveCount(1);await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);checks.push('drawer uses the app-source form contribution');
 await page.getByLabel('搜索数据').fill('张伟');await page.getByLabel('搜索数据').press('Enter');await expect.poll(()=>JSON.stringify(queries.at(-1))).toContain('张伟');checks.push('source query bar serializes its search through the controller');
 await page.locator('tr[data-row-key="visit-1"] .ant-checkbox-input').check();await expect(page.getByRole('button',{name:/批量/}).first()).toBeVisible();checks.push('batch selection survives copied composition');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出',exact:true}).click();await download;checks.push('export still uses the platform resource client');
 await page.getByRole('button',{name:'显示列',exact:true}).click();await page.getByRole('checkbox',{name:'来访单位',exact:true}).uncheck();await page.getByRole('button',{name:'显示列',exact:true}).click();await page.getByRole('button',{name:'保存显示列配置',exact:true}).click();await expect.poll(()=>Boolean(preference)).toBe(true);assert.equal(preference.columns.find(column=>column.key==='company').visible,false);checks.push('column preferences save through the existing platform owner');
 await page.screenshot({path:join(output,'visitor-admin-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:'+port+'/m/my/visits');await expect(page.locator('.app-mobile--tabbar')).toBeVisible();await expect(page.locator('.oxa-mobile-record-card')).toHaveCount(2);await expect(page.locator('[data-app-admin-shell]')).toHaveCount(0);await page.screenshot({path:join(output,'visitor-user-mobile.png'),fullPage:true});checks.push('390px source user frame and source task page work without an admin mount');
 const denied=await context.newPage();await mockPlatform(denied,false);const deniedQueries=[];denied.on('request',request=>{if(request.url().includes('/native/data/'))deniedQueries.push(request.url());});await denied.goto('http://127.0.0.1:'+port+'/admin/resources/visits');await expect(denied.locator('.ant-result-403')).toBeVisible();await expect(denied.locator('[data-app-admin-shell]')).toHaveCount(0);assert.equal(deniedQueries.length,0);checks.push('unauthorized route refuses the copied page before querying business data');
 assert.deepEqual(errors,[]);writeFileSync(join(output,'receipt.json'),JSON.stringify({scope:'browser fixtures; synthetic API responses, not live role/business acceptance',checks,errors,sourceBaseline:process.env.OPENXIANGDA_TEMPLATE_SOURCE_COMMIT||'working source'},null,2)+'\n');console.log(JSON.stringify({output,checks,errors},null,2));
}catch(error){
 for(const [index,page] of (browser?.contexts().flatMap(context=>context.pages())||[]).entries()){
   writeFileSync(join(output,'failure-dom-'+index+'.txt'),await page.locator('body').innerText().catch(()=>''));
   await page.screenshot({path:join(output,'failure-'+index+'.png'),fullPage:true}).catch(()=>{});
 }
 writeFileSync(join(output,'failure-diagnostics.json'),JSON.stringify({error:String(error),checks,errors,consoleMessages},null,2));
 throw error;
}finally{await browser?.close();await server?.close();rmSync(temporary,{recursive:true,force:true});}
