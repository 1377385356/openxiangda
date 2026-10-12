import { mkdtempSync, rmSync, symlinkSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const sdk=process.argv[2] || resolve(import.meta.dirname,'..');
const { createWorkspace }=await import('file://'+sdk+'/packages/cli/dist/create-workspace.js');
const { loadWorkspace, compileApplicationSources }=await import('file://'+sdk+'/packages/devkit-core/dist/index.js');
const temporary=mkdtempSync(join(tmpdir(),'composed-app-check-'));
try{for(const [index,selection] of [{scenario:'visitor'},{scenario:'visitor',admin:'topbar',pc:'workbench',mobile:'task-list',login:'centered',with:['public-entry']},{scenario:'crud'}].entries()){
 const root=join(temporary,'app-'+index);await createWorkspace({directory:root,appCode:'template-test-'+index,name:'模板验证',selection,install:false});
 const {config}=await loadWorkspace(root);const compiled=compileApplicationSources(config);writeFileSync(join(root,'packages/contracts/src/generated.ts'),compiled.contracts.typescript);
 symlinkSync(resolve(sdk,'templates/application/node_modules'),join(root,'node_modules'),'dir');symlinkSync(resolve(sdk,'templates/application/apps/web/node_modules'),join(root,'apps/web/node_modules'),'dir');
 for(const [command,args] of [['node',['scripts/check-public-imports.mjs']],['node',[sdk+'/node_modules/typescript/bin/tsc','-p','tsconfig.json','--noEmit']]]){
   const result=spawnSync(command,args,{cwd:join(root,'apps/web'),encoding:'utf8'});if(result.status!==0)throw new Error('SOURCE_TEMPLATE_CHECK_FAILED '+JSON.stringify(selection)+'\n'+result.stdout+result.stderr);
 }
 const privateFile=join(root,'apps/web/src/private-import-negative.ts');writeFileSync(privateFile,"import 'openxiangda/dist/browser/runtime';\n");
 const rejected=spawnSync(process.execPath,['scripts/check-public-imports.mjs'],{cwd:join(root,'apps/web'),encoding:'utf8'});unlinkSync(privateFile);
 if(rejected.status===0 || !rejected.stderr.includes('TEMPLATE_PRIVATE_IMPORT_FORBIDDEN'))throw new Error('PRIVATE_IMPORT_NEGATIVE_CHECK_FAILED');
 console.log(JSON.stringify({selection,result:'compiled generated contracts + public imports + real app TypeScript passed'}));
}}finally{rmSync(temporary,{recursive:true,force:true});}
