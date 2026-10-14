import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, Button, ConfigProvider, Space } from 'antd';
import { WorkflowPeopleSourceEditor } from '../../../../packages/openxiangda/src/browser/components/workflow/WorkflowPeopleSourceEditor';
import { WorkflowConditionEditor } from '../../../../packages/openxiangda/src/browser/components/workflow/WorkflowConditionEditor';
import { WorkflowConditionExamples } from '../../../../packages/openxiangda/src/browser/components/workflow/WorkflowConditionExamples';
import { WorkflowNodeConfigurationEditor } from '../../../../packages/openxiangda/src/browser/components/workflow/WorkflowNodeConfigurationEditor';
import { workflowVariablesWithChoices, formatWorkflowCondition } from '../../../../packages/openxiangda/src/browser/components/workflow/workflow-variable-presentation';
import { sources, rawVariables, peopleTemplates, peopleConfigurations } from './workflow-people-source-data';
import '../../../../packages/openxiangda/dist/browser/styles.css';

const variables=workflowVariablesWithChoices(rawVariables, { 'major.value': [{ value: 'yes', label: '重大' }, { value: 'no', label: '一般' }] });
function NodeFixture() {
  const [state,setState]=useState({dirty:false,busy:false,unknown:false}),[receipt,setReceipt]=useState<unknown>();
  const params=new URLSearchParams(location.search);
  const context=params.has('old')?{...peopleConfigurations.conditionalAssignment,nativePeopleAuthoring:undefined,peopleSourceTemplates:undefined}:peopleConfigurations.conditionalAssignment;
  return <ConfigProvider><App><main style={{maxWidth:800,margin:'24px auto',padding:20}}><h1>实际已发布节点编辑器 · 仅本地合成HTTP</h1>
    <output aria-label="配置状态">{JSON.stringify(state)}</output><output aria-label="保存回执">{JSON.stringify(receipt)}</output>
    <WorkflowNodeConfigurationEditor workflowCode="review" node={peopleConfigurations.nodes[0]} principals={peopleConfigurations.principals} conditionalAssignment={context} variableChoices={{'major.value':[{value:'yes',label:'重大'},{value:'no',label:'一般'}]}} expectedHeadRevision={1} presentation="inline" readOnly={params.has('readonly')} onClose={()=>{}} onStateChange={setState} onSaved={setReceipt}/>
  </main></App></ConfigProvider>;
}
function Fixture() {
  const [entry,setEntry]=useState<any>(sources.handling),[condition,setCondition]=useState<any>({op:'eq',left:{op:'path',path:'major.value'},right:{op:'literal',value:'yes'}}),[disabled,setDisabled]=useState(false),[empty,setEmpty]=useState(false),[events,setEvents]=useState(0);
  return <ConfigProvider><App><main style={{maxWidth:1050, margin:'24px auto',padding:20}}><h1>实际SDK控件 · HTTP与角色未参与</h1>
    <Space><Button onClick={()=>setDisabled(value=>!value)}>切换禁用</Button><Button onClick={()=>setEmpty(value=>!value)}>切换空目录</Button><Button onClick={()=>setCondition({op:'eq',left:{op:'path',path:'major.value'},right:{op:'literal',value:'legacy'}})}>加载未知旧值</Button></Space>
    <WorkflowPeopleSourceEditor templates={empty?[]:peopleTemplates} entry={entry} sources={empty?{}:sources as any} principals={{users:[],roles:[{code:'owner_dept_head',name:'归口部门负责人'}]}} variables={rawVariables} disabled={disabled} onChange={value=>{setEntry(value);setEvents(value=>value+1);}} />
    <section style={{marginTop:24}}><h2>中文条件选择</h2><WorkflowConditionEditor value={condition} variables={variables} disabled={disabled} onChange={value=>{setCondition(value);setEvents(value=>value+1);}}/><p aria-label="中文条件说明">{formatWorkflowCondition(condition,variables)}</p></section>
    <WorkflowConditionExamples node={{id:'route',kind:'condition',title:'测试条件',branches:[{label:'重大审批',when:condition,target:'major'}],otherwise:'normal'}} variables={variables}/>
    <output aria-label="控件原始状态">{JSON.stringify({entry,condition,events,disabled,empty})}</output>
  </main></App></ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('node')?<NodeFixture/>:<Fixture/>);
