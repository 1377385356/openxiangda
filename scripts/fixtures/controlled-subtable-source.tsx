import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App, Form } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { OpenXiangdaUiProvider, OpenXiangdaResourceDefinitionsProvider, RuntimeBoundary } from 'openxiangda/react';
import { SubtableField, type SurfaceField } from 'openxiangda/field-kit';
import 'openxiangda/react/styles.css';
import 'openxiangda/mobile/styles.css';

const caps = { readCapabilities: [], createCapabilities: [], updateCapabilities: [] };
const definition = {
 code: 'controlled-lines', name: '受控明细', capabilities: {read:'',create:'',update:'',delete:''},
 surface: { fields: {
  parentId: { label:'主记录', type:'uuid', widget:'readonly', ...caps },
  contextId: { label:'选择上下文', type:'text.short', widget:'text', hidden:true, ...caps },
  person: { label:'姓名', type:'resource-ref.single', widget:'resource', source:{kind:'resource',resourceCode:'people',labelField:'name',snapshotFields:['phone']}, ...caps },
  phone: { label:'电话', type:'text.short', widget:'text', ...caps },
  employeeNumber: {label:'工号',type:'text.short',widget:'text',...caps},
  time: { label:'时段', type:'resource-ref.single', widget:'resource', source:{kind:'resource',resourceCode:'slots',labelField:'name',filters:[{field:'configId',operator:'eq',binding:{kind:'field',field:'contextId'}}]}, ...caps },
 }, form:{layout:'flat',fieldOrder:['contextId','person','employeeNumber','phone','time']} },
} as any;
const field = { key:'lines',label:'明细',type:'subtable',widget:'subtable',subtable:{resourceCode:definition.code,foreignKey:'parentId',maxRows:10}, ...caps } as SurfaceField;
function Fixture() {
 const [form]=Form.useForm();const [values,setValues]=useState({lines:[0,1].map(n=>({key:`row-${n}`,state:'created',data:{contextId:`config-${n}`}}))});
 const mobile=new URLSearchParams(location.search).has('mobile');
 return <><Form form={form} initialValues={values} onValuesChange={(_,all)=>{
  const lines=all.lines.map((row:any)=>{const selected=row.data.person;if(!selected?.snapshot)return row;
   const {snapshot,...person}=selected;return {...row,data:{...row.data,person,phone:snapshot.phone,employeeNumber:`derived-${selected.value}`}};
  });form.setFields([{name:'lines',value:lines}]);setValues({lines});
 }}><Form.Item name="lines"><SubtableField field={field} operation="create" mobile={mobile}
  launch={{fieldCodes:['contextId','person','employeeNumber','phone','time'],readonlyFieldCodes:['employeeNumber'],upload:async()=>{throw new Error('NO_UPLOAD_IN_FIXTURE');}}}/></Form.Item></Form>
 <output data-testid="values">{JSON.stringify(values)}</output></>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><OpenXiangdaUiProvider><App><MemoryRouter><RuntimeBoundary>
 <OpenXiangdaResourceDefinitionsProvider definitions={{[definition.code]:definition}}><Fixture/></OpenXiangdaResourceDefinitionsProvider>
</RuntimeBoundary></MemoryRouter></App></OpenXiangdaUiProvider></React.StrictMode>);
