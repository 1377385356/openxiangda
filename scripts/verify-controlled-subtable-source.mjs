import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=resolve(import.meta.dirname,'..'),web=join(root,'templates/application/apps/web');
const require=createRequire(join(web,'package.json'));
const {createServer}=await import(pathToFileURL(require.resolve('vite')));
const {chromium,expect}=require('@playwright/test');
const output=join(root,'.cache/c41-browser');mkdirSync(output,{recursive:true});
const temporary=mkdtempSync(join(output,'fixture-'));symlinkSync(join(web,'node_modules'),join(temporary,'node_modules'),'dir');
cpSync(join(root,'scripts/fixtures/controlled-subtable-source.tsx'),join(temporary,'fixture.tsx'));
writeFileSync(join(temporary,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="openxiangda-runtime-base" content="/"><meta name="openxiangda-app-code" content="controlled-subtable"><meta name="openxiangda-environment" content="preproduction"></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
const server=await createServer({configFile:false,root:temporary,resolve:{dedupe:['react','react-dom']},server:{host:'127.0.0.1',port:0,fs:{allow:[root]}},optimizeDeps:{entries:['index.html']},logLevel:'error'});
let browser;const checks=[];
try{
 await server.listen();const port=server.httpServer.address().port;
 const base=`http://127.0.0.1:${port}`;browser=await chromium.launch({headless:true});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:mobile?390:1440,height:1000},...(mobile?{isMobile:true,hasTouch:true}:{})});
  const page=await context.newPage(),errors=[],queries=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!url.pathname.startsWith('/service/'))return route.continue();
   let data;
   if(url.pathname.endsWith('/native/authz/current'))data={schemaVersion:'openxiangda.runtime-authorization/v2',state:'active',environment:{id:'env',key:'preproduction',activeAppVersionId:'version',headRevision:1,authzRevisionId:'authz',authzVersion:1,scopeDataVersion:'scope'},subjectProfile:{schemaVersion:'openxiangda.subject-profile/v2',userId:'actor',displayName:'合成账号',avatarUrl:null,jobNumber:null,affiliatedDepartment:null},roles:[],principal:{type:'user_union',userId:'actor',roleCodes:[],capabilityCodes:[],isAppSuperAdmin:false,identityScope:'fixture:actor'}};
   else if(url.pathname.endsWith('/source/query')){
    const body=req.postDataJSON(),fieldCode=url.pathname.includes('/fields/person/')?'person':'time';queries.push({fieldCode,body});
    data={schemaVersion:'openxiangda.data-field-source-page/v2',resourceCode:'controlled-lines',fieldCode,items:fieldCode==='person'?[{value:'person-a',label:'人物甲',resourceCode:'people',snapshot:{phone:'original-a'}},{value:'person-b',label:'人物乙',resourceCode:'people',snapshot:{phone:'original-b'}}]:[{value:'slot',label:'可选时段',resourceCode:'slots'}],nextCursor:null};
   }else throw new Error(`UNEXPECTED_PLATFORM_REQUEST:${url.pathname}`);
   await route.fulfill({status:200,contentType:'application/json',json:{code:200,data}});
  });
  const choose=async(label,value,index)=>{
   if(mobile){await page.getByRole('button',{name:`选择${label}`,exact:true}).nth(index).click();const picker=page.getByRole('dialog');await picker.getByText(value,{exact:true}).click();await picker.getByRole('button',{name:/^确\s*定/}).click();await expect(picker).not.toBeVisible();}
   else{await page.getByRole('combobox').nth(index*2+(label==='时段'?1:0)).click();await page.getByText(value,{exact:true}).last().click();}
  };
  await page.goto(base+(mobile?'/?mobile=1':'/'));await choose('姓名','人物甲',0);
  const phone=page.locator('input[id$="_phone"]');await expect(phone.first()).toHaveValue('original-a');await phone.first().fill('manual-a');
  await choose('姓名','人物乙',1);await expect(phone.first()).toHaveValue('manual-a');await expect(phone.nth(1)).toHaveValue('original-b');
  await choose('时段','可选时段',0);await expect(phone.first()).toHaveValue('manual-a');
  const employee=page.locator('input[id$="_employeeNumber"]');if(mobile){await expect(employee.first()).toBeDisabled();await expect(employee.first()).toHaveValue('derived-person-a');}else{await expect(employee).toHaveCount(0);await expect(page.getByText('derived-person-a',{exact:true})).toBeVisible();}
  assert.equal(queries.filter(q=>q.fieldCode==='time').at(-1).body.bindings.contextId,'config-0');
  const values=JSON.parse(await page.getByTestId('values').textContent());assert.equal(values.lines[0].data.person.snapshot,undefined);assert.equal(values.lines[1].data.person.snapshot,undefined);assert.equal(values.lines[0].data.contextId,'config-0');
  assert.deepEqual(errors,[]);await page.screenshot({path:join(output,`${mobile?'mobile':'pc'}.png`),fullPage:true});checks.push({mobile,hiddenBinding:true,manualFirstRowPreserved:true,snapshotConsumed:true,queries:queries.length});await context.close();
 }
 writeFileSync(join(output,'result.json'),JSON.stringify({sourceOnly:true,fixture:true,checks},null,2)+'\n');console.log(JSON.stringify({checks}));
}finally{await browser?.close();await server.close();}
