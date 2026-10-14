import { type WorkflowConditionVariable } from './workflow-variable-presentation';
import { WorkflowChoiceValue } from './WorkflowConditionEditor';
import { useState } from 'react';
import { Button, Input, InputNumber, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { evaluateWorkflowExpression, workflowExpressionPaths, type WorkflowNode } from 'openxiangda-contracts/browser';
type ConditionNode=Extract<WorkflowNode,{kind:'condition'}>;
/** Ephemeral hypothetical facts, never written into the executable draft or a business record. */
export function WorkflowConditionExamples({ node,variables }: {node:ConditionNode;variables:readonly WorkflowConditionVariable[]}) {
  const [examples,setExamples]=useState<Array<{id:number;name:string;values:Record<string,unknown>}>>([{id:0,name:'示例 1',values:{}}]);
  const [serial,setSerial]=useState(1);
  const paths=[...new Set(node.branches.flatMap(branch=>workflowExpressionPaths(branch.when).paths))].slice(0,32);
  const update=(id:number,path:string,value:unknown)=>setExamples(current=>current.map(example=>example.id===id?{...example,values:{...example.values,[path]:value}}:example));
  const facts=(values:Record<string,unknown>)=>{
    const result:Record<string,any>={};
    for(const [path,value] of Object.entries(values)){const keys=path.split('.');if(keys.some(key=>['__proto__','prototype','constructor'].includes(key)))continue;let target=result;for(const key of keys.slice(0,-1))target=target[key]||=( {} );target[keys.at(-1)!]=value;}
    return result;
  };
  return <section className="oxa-designer-condition-examples" aria-label="条件示例结果"><h3>示例结果</h3><p>仅用于检查条件，使用与运行内核相同的判断规则；不修改申请数据，不保存为流程版本。</p>
    {examples.map(example=>{let result='';try{const branch=node.branches.find(branch=>Boolean(evaluateWorkflowExpression(branch.when,facts(example.values))));result=branch?.label|| (branch ? `条件 ${node.branches.indexOf(branch)+1}` : '其他情况');}catch{result='示例数据或条件暂不可计算';}
      return <article key={example.id}><header><Input aria-label="示例名称" maxLength={80} value={example.name} onChange={event=>setExamples(current=>current.map(value=>value.id===example.id?{...value,name:event.target.value}:value))} /><Button aria-label={`删除${example.name}`} icon={<DeleteOutlined />} onClick={()=>setExamples(current=>current.filter(value=>value.id!==example.id))} /></header>
        <div className="oxa-designer-example-fields">{paths.map(path=>{const variable=variables.find(variable=>variable.path===path),type=variable?.type;return <label key={path}>{variable?.label||path}{variable?.choices?.length ? <WorkflowChoiceValue choices={variable.choices} current={example.values[path]} multiple={false} disabled={false} label={`${example.name}${variable.label}`} onChange={value=>update(example.id,path,value)} /> : type==='number'||type==='integer'?<InputNumber aria-label={`${example.name}${path}`} value={example.values[path] as number|undefined} precision={type==='integer'?0:undefined} onChange={value=>update(example.id,path,value??undefined)} />:type==='boolean'?<Select aria-label={`${example.name}${path}`} allowClear value={example.values[path]} options={[{value:true,label:'是'},{value:false,label:'否'}]} onChange={value=>update(example.id,path,value)} />:<ExampleTextValue key={`${example.id}:${path}`} label={`${example.name}${path}`} json={type==='array'||type==='object'} onChange={value=>update(example.id,path,value)} />}</label>;})}</div>
        <p aria-live="polite"><strong>进入分支：</strong><span>{result}</span></p>
      </article>;
    })}<Button icon={<PlusOutlined />} disabled={examples.length>=20} onClick={()=>{setExamples(current=>[...current,{id:serial,name:`示例 ${serial+1}`,values:{}}]);setSerial(value=>value+1);}}>添加示例</Button>
  </section>;
}

function ExampleTextValue({label,json,onChange}:{label:string;json:boolean;onChange:(value:unknown)=>void}) {
  const [text,setText]=useState(''),[invalid,setInvalid]=useState(false);
  return <Input aria-label={label} maxLength={1024} value={text} status={invalid?'error':undefined} placeholder={json?'输入JSON值':'未填写'} onChange={event=>{setText(event.target.value);if(json){try{onChange(JSON.parse(event.target.value));setInvalid(false);}catch{onChange(undefined);setInvalid(true);}}else onChange(event.target.value||undefined);}} />;
}
