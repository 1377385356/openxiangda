// Run against the existing TaskSpace, never create a browser or a new space:
// { echo 'const workflowPeopleTestOptions={spaceId:5};'; cat this-file; } | ego-browser nodejs
// Start vite.workflow-authoring-controls.config.ts first. All HTTP is synthetic.
const options=typeof workflowPeopleTestOptions==='object'?workflowPeopleTestOptions:{};
const spaceId=Number(options.spaceId);
if(!Number.isSafeInteger(spaceId)||spaceId<1)throw new Error('Existing TaskSpace id is required');
const task=await taskSpace(spaceId),page=task.page('p1');
const base='http://127.0.0.1:33335/workflow-authoring-controls.e2e.html';
const current=await page.url();
if(current&&!current.startsWith(base))throw new Error('Refusing to replace a non-fixture page');
const protectedInput=await page.evaluate(()=>{
  const output=document.querySelector('[aria-label="配置状态"]');return output?JSON.parse(output.textContent):null;
});
if(protectedInput?.dirty||protectedInput?.busy||protectedInput?.unknown)throw new Error('Finish or discard this fixture input explicitly first');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const results=[];
const observe=()=>page.evaluate(async()=>({
  state:JSON.parse(document.querySelector('[aria-label="配置状态"]').textContent),
  http:await(await fetch('/__people-source-fixture__/control')).json(),
}));
const open=async(query='',mode='success')=>{
  await page.goto(`${base}?node${query}`);await page.waitForSelector('[aria-label="配置状态"]');
  await page.evaluate(async(mode)=>{await fetch('/__people-source-fixture__/control',{method:'POST',body:JSON.stringify({mode})});},mode);
  assert(!(await observe()).state.dirty,'Opening must not dirty the input');
};
const selectDepartment=async(level)=>{
  await page.click('[aria-label="审批人类型"] label:has(input[value="released:department_supervisor"])',{label:'选择部门主管来源'});
  await page.fill('input[aria-label="主管级别"]',String(level));await page.press('input[aria-label="主管级别"]','Tab');
};
const switchMode=async(value)=>{
  await page.click(`[aria-label="已发布节点人员分派方式"] label:has(input[value="${value}"])`,{label:'切换人员分派方式'});
  await page.waitForSelector(value==='conditional'?'[aria-label="规则 1 名称"]':'[aria-label="审批人类型"]');
};
const save=async()=>{
  await page.fill('[aria-label="修改说明"]','合成HTTP：原生主管参数回归');
  await page.click('button[aria-label="保存办理设置"]',{label:'保存合成主管规则'});
};
const receipt=revision=>page.waitForFunction(revision=>document.querySelector('[aria-label="保存回执"]').textContent.includes(`"revision":${revision}`),revision);

await open('','unknown');await selectDepartment(3);await switchMode('conditional');await switchMode('standard');
assert(await page.evaluate(()=>document.querySelector('input[aria-label="主管级别"]').value)==='3','Mode roundtrip lost native parameters');
await save();await page.waitForFunction(()=>JSON.parse(document.querySelector('[aria-label="配置状态"]').textContent).unknown);
const unknown=await observe();
assert(await page.evaluate(()=>document.querySelector('input[aria-label="主管级别"]').disabled),'Unknown outcome must freeze parameter editing');
assert(unknown.http.requests.length===1&&unknown.http.requests[0].patch.assignee.level===3,'Save must send the full original source');
await page.click('button[aria-label="保存办理设置"]',{label:'恢复同一原始请求'});await receipt(1);
const recovered=await observe();
assert(recovered.http.requests.length===2&&JSON.stringify(recovered.http.requests[0])===JSON.stringify(recovered.http.requests[1]),'Unknown recovery changed operationId or input');
results.push({name:'whole-source roundtrip and exact unknown recovery',unknown,recovered});

await open('','conflict');await selectDepartment(4);await save();await page.waitForSelector('text=载入最新设置并保留输入');
await page.click('text=载入最新设置并保留输入',{label:'重读修订保留输入'});
await page.waitForFunction(()=>!document.body.textContent.includes('本地HTTP夹具：修订冲突'));
assert(await page.evaluate(()=>document.querySelector('input[aria-label="主管级别"]').value)==='4','CAS refresh lost whole local assignment');
await page.click('button[aria-label="保存办理设置"]',{label:'保存最新修订意图'});await receipt(3);
const conflict=await observe(),writes=conflict.http.requests;
assert(writes.length===2&&writes[1].expectedRevision===2&&writes[1].expectedHeadRevision===2,'CAS refresh did not use latest revisions');
assert(JSON.stringify(writes[0].patch.assignee)===JSON.stringify(writes[1].patch.assignee),'CAS refresh merged individual assignment fields');
results.push({name:'CAS refresh retains whole source',conflict});

await open();await selectDepartment(2);await switchMode('conditional');await save();await receipt(1);
const conditional=await observe(),entry=conditional.http.requests[0].patch.assignee;
assert(entry.provider==='conditional'&&entry.cases[0].assignee.level===2&&entry.otherwise.level===2,'Conditional save flattened or discarded native leaves');
results.push({name:'conditional save retains native leaves',conditional});

await open();await page.click('[aria-label="审批人类型"] label:has(input[value="released:supervisor_chain"])',{label:'选择逐级主管审批'});
await save();await receipt(1);const chain=await observe(),patch=chain.http.requests[0].patch;
assert(patch.mode==='sequence'&&patch.assignee.provider==='supervisor_chain'&&patch.assignee.continuous===true,'Continuous chain must save an allowed sequence mode');
results.push({name:'continuous chain saves sequence and complete parameters',chain});

await open('&readonly');
const readonly=await page.evaluate(()=>({disabled:Array.from(document.querySelectorAll('[aria-label="审批人类型"] input')).every(input=>input.disabled),saveButton:!!document.querySelector('button[aria-label="保存办理设置"]')}));
assert(readonly.disabled&&!readonly.saveButton,'Readonly controls must not permit a save');results.push({name:'readonly remains clean',readonly});
await open('&old');assert(!await page.evaluate(()=>!!document.querySelector('[aria-label="审批人类型"]')),'Old platform must not imply native authoring support');
results.push({name:'explicit native platform capability required'});
const evidence={observedAt:new Date().toISOString(),spaceId,page:'p1',kind:'actual SDK editor and synthetic HTTP, no live roles',results};
if(options.evidencePath){const fs=await import('node:fs/promises');await fs.writeFile(options.evidencePath,JSON.stringify(evidence,null,2));}
console.log({scenariosPassed:results.length,liveRoles:false});console.log(await page.snapshot());
