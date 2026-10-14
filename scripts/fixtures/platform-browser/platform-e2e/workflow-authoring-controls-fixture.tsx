import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, Button, ConfigProvider, Space } from 'antd';
import { WorkflowPeopleSourceEditor } from '../../../../packages/openxiangda/src/browser/components/workflow/WorkflowPeopleSourceEditor';
import { WorkflowConditionEditor } from '../../../../packages/openxiangda/src/browser/components/workflow/WorkflowConditionEditor';
import { WorkflowConditionExamples } from '../../../../packages/openxiangda/src/browser/components/workflow/WorkflowConditionExamples';
import { workflowVariablesWithChoices, formatWorkflowCondition } from '../../../../packages/openxiangda/src/browser/components/workflow/workflow-variable-presentation';
import '../../../../packages/openxiangda/dist/browser/styles.css';

const sources = {
  handling: { provider: 'department_supervisor', departmentIdFrom: 'dept.value', level: 1, fallbackToAncestorSupervisor: false, min: 1, max: 1 },
  owning: { provider: 'department_supervisor', departmentIdFrom: 'ownerDept.value', level: 2, fallbackToAncestorSupervisor: true, min: 1, max: 1 },
  budget: { provider: 'form_field_users', inputPath: 'budgetOwnerUsers', min: 1, max: 10 },
  scoped: { provider: 'app_role_in_scope', roleCode: 'owner_dept_head', scope: { dimension: 'owner-department', valueFrom: 'ownerDept.value' } },
} as const;
const rawVariables: any[] = [
  { path: 'major.value', label: '是否重大合同', type: 'string', required: true, source: { kind: 'input' }, usedBy: [] },
  { path: 'dept.value', label: '承办部门', type: 'string', required: true, source: { kind: 'input' }, usedBy: [] },
  { path: 'ownerDept.value', label: '归口部门', type: 'string', required: true, source: { kind: 'input' }, usedBy: [] },
  { path: 'budgetOwnerUsers', label: '所选经费负责人', type: 'array', required: false, source: { kind: 'input' }, usedBy: [] },
];
const variables=workflowVariablesWithChoices(rawVariables, { 'major.value': [{ value: 'yes', label: '重大' }, { value: 'no', label: '一般' }] });
function Fixture() {
  const [entry,setEntry]=useState<any>(sources.handling),[condition,setCondition]=useState<any>({op:'eq',left:{op:'path',path:'major.value'},right:{op:'literal',value:'yes'}}),[disabled,setDisabled]=useState(false),[empty,setEmpty]=useState(false),[events,setEvents]=useState(0);
  return <ConfigProvider><App><main style={{maxWidth:1050, margin:'24px auto',padding:20}}><h1>实际SDK控件 · HTTP与角色未参与</h1>
    <Space><Button onClick={()=>setDisabled(value=>!value)}>切换禁用</Button><Button onClick={()=>setEmpty(value=>!value)}>切换空目录</Button><Button onClick={()=>setCondition({op:'eq',left:{op:'path',path:'major.value'},right:{op:'literal',value:'legacy'}})}>加载未知旧值</Button></Space>
    <WorkflowPeopleSourceEditor entry={entry} sources={empty?{}:sources as any} principals={{users:[],roles:[{code:'owner_dept_head',name:'归口部门负责人'}]}} variables={rawVariables} disabled={disabled} onChange={value=>{setEntry(value);setEvents(value=>value+1);}} />
    <section style={{marginTop:24}}><h2>中文条件选择</h2><WorkflowConditionEditor value={condition} variables={variables} disabled={disabled} onChange={value=>{setCondition(value);setEvents(value=>value+1);}}/><p aria-label="中文条件说明">{formatWorkflowCondition(condition,variables)}</p></section>
    <WorkflowConditionExamples node={{id:'route',kind:'condition',title:'测试条件',branches:[{label:'重大审批',when:condition,target:'major'}],otherwise:'normal'}} variables={variables}/>
    <output aria-label="控件原始状态">{JSON.stringify({entry,condition,events,disabled,empty})}</output>
  </main></App></ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
