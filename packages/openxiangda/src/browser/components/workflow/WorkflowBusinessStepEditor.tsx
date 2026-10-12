import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, InputNumber, Select, Switch, Tag } from 'antd';
import { CheckCircleFilled, SearchOutlined } from '@ant-design/icons';
import { workflowBusinessStepValueMatches, type WorkflowBusinessStepNode, type WorkflowDesignerCatalog, type WorkflowGraphVariable } from 'openxiangda-contracts/browser';
export function WorkflowBusinessStepEditor({ node, catalog, variables, disabled, onChange, onAssistant, onValidityChange }: {
  node: WorkflowBusinessStepNode; catalog: WorkflowDesignerCatalog; variables: readonly WorkflowGraphVariable[]; disabled: boolean;
  onChange: (patch: Partial<WorkflowBusinessStepNode>) => void; onAssistant: () => void; onValidityChange?: (invalid: boolean) => void;
}) {
  const [keyword,setKeyword] = useState('');
  const [inputSources,setInputSources] = useState<Record<string,'fact'|'literal'|'null'>>({});
  const [invalidFields,setInvalidFields] = useState<Record<string,boolean>>({});
  const invalid = Object.values(invalidFields).some(Boolean);
  useEffect(()=>{onValidityChange?.(invalid);},[invalid,onValidityChange]);
  useEffect(()=>()=>onValidityChange?.(false),[onValidityChange]);
  const properties = (node.inputSchema.properties || {}) as Record<string,any>;
  const outputs = (node.outputSchema.properties || {}) as Record<string,any>;
  const mapping = (key: string,value?: WorkflowBusinessStepNode['inputs'][string]) => { setInvalidFields(current=>({...current,[key]:false}));const inputs = {...node.inputs};if(value) inputs[key]=value;else delete inputs[key];onChange({inputs}); };
  return <section className="oxa-designer-business-step" aria-label="业务步骤配置">
    <div className="oxa-designer-return-notice">流程结构 · 随草稿发布后生效</div><h3>选择业务步骤</h3>
    <Input aria-label="搜索已发布业务步骤" prefix={<SearchOutlined />} value={keyword} placeholder="搜索已发布的业务步骤" onChange={event => setKeyword(event.target.value)} />
    <div className="oxa-designer-step-catalog">{catalog.steps.filter(step => `${step.title} ${step.handler.code}`.toLowerCase().includes(keyword.toLowerCase())).map(step => {
      const selected = step.handler.code===node.handler.code && step.handler.version===node.handler.version;
      return <button type="button" disabled={disabled || invalid} aria-pressed={selected} key={`${step.handler.code}@${step.handler.version}`} onClick={() => {setInputSources({});setInvalidFields({});onChange({ handler:structuredClone(step.handler),inputSchema:structuredClone(step.inputSchema),outputSchema:structuredClone(step.outputSchema),inputs:{},title:step.title });}}><strong>{step.title}</strong><Tag>{step.handler.mode==='pure' ? '计算' : '业务处理'}</Tag><span>v{step.handler.version}</span>{selected && <CheckCircleFilled />}</button>;
    })}</div><p>应用发布处理逻辑；流程只决定执行时机和输入数据。版本、逻辑及输入输出类型不可在画布改写。</p>
    <h3>输入</h3><table className="oxa-workflow-operation-table"><thead><tr><th>输入项</th><th>类型</th><th>数据来源</th></tr></thead><tbody>{Object.entries(properties).map(([key,schema]) => {
      const input=node.inputs[key];const types=Array.isArray(schema.type)?schema.type:[schema.type||'unknown'];const type=types.find((type:string)=>type!=='null')||'null';const required=(node.inputSchema.required as string[] || []).includes(key);
      const factOptions=variables.filter(variable => type==='unknown' || variable.type.split(',').every(sourceType=>types.includes(sourceType)||sourceType==='integer'&&types.includes('number'))).map(variable=>({value:variable.path,label:variable.label || variable.path}));
      return <tr key={key}><th>{schema.title || key}{required && <span className="oxa-designer-required"> *</span>}</th><td>{types.join(" / ")}</td><td>
        <Select aria-label={`${key}输入来源`} disabled={disabled} value={input?.source==='literal'&&input.value===null?'null':input?.source || inputSources[key]} placeholder="请选择" options={[{value:'fact',label:'流程变量'},{value:'literal',label:'固定值'},...(types.includes('null')?[{value:'null',label:'空值（null）'}]:[])]} onChange={source=>{setInputSources(current=>({...current,[key]:source}));mapping(key,source==='fact' ? undefined : {source:'literal',value:source==='null'?null:type==='number'||type==='integer'?0:type==='boolean'?false:type==='array'?[]:type==='object'?{}:''});}} />
        {/* Unset mappings stay absent; choosing a fact never manufactures a default. */}
        {input?.source!=='literal' ? <Select aria-label={`${key}流程变量`} disabled={disabled} allowClear value={input?.source==='fact'?input.path:undefined} placeholder="选择类型匹配的变量" options={factOptions} onChange={path=>mapping(key,path ? {source:'fact',path} : undefined)} /> : input.value===null ? <span>空值（null）</span> : type==='number'||type==='integer' ? <InputNumber aria-label={`${key}固定值`} disabled={disabled} precision={type==='integer'?0:undefined} value={typeof input.value==='number'?input.value:undefined} onChange={value=>{if(typeof value==='number')mapping(key,{source:'literal',value});}} /> : type==='boolean' ? <Switch aria-label={`${key}固定值`} disabled={disabled} checked={input.value===true} onChange={value=>mapping(key,{source:'literal',value})} /> : type==='array'||type==='object' ? <JsonLiteral key={`${node.id}:${key}`} disabled={disabled} value={input.value} onChange={value=>mapping(key,{source:'literal',value})} onInvalidChange={invalid=>setInvalidFields(current=>({...current,[key]:invalid}))} /> : <Input aria-label={`${key}固定值`} disabled={disabled} value={typeof input.value==='string'?input.value:''} onChange={event=>mapping(key,{source:'literal',value:event.target.value})} />}
        {input?.source==='literal' && !workflowBusinessStepValueMatches(schema,input.value) && <small role="alert">固定值不符合发布的类型约束</small>}
      </td></tr>;
    })}</tbody></table>
    {!Object.keys(properties).length && <p>此步骤无需输入。</p>}
    <h3>输出（只读）</h3><table className="oxa-workflow-operation-table"><thead><tr><th>输出项</th><th>类型</th><th>后续变量</th></tr></thead><tbody>{Object.entries(outputs).map(([key,schema])=><tr key={key}><td>{schema.title||key}</td><td>{schema.type}</td><td><code>steps.{node.id}.{key}</code></td></tr>)}</tbody></table>
    <Alert type="info" showIcon title="后续节点的条件可使用这些结果；必须保证执行路径上此步骤已完成。" />
    <Button type="link" onClick={onAssistant}>没有合适的步骤？让 AI 助手提出新增能力方案</Button>
  </section>;
}
function JsonLiteral({value,disabled,onChange,onInvalidChange}:{value:unknown;disabled:boolean;onChange:(value:unknown)=>void;onInvalidChange:(invalid:boolean)=>void}) {
  const serialized=JSON.stringify(value);
  const accepted=useRef(serialized);
  const [text,setText]=useState(()=>serialized);const [invalid,setInvalid]=useState(false);
  useEffect(()=>{if(serialized!==accepted.current){accepted.current=serialized;setText(serialized);setInvalid(false);onInvalidChange(false);}},[serialized,onInvalidChange]);
  return <Input.TextArea aria-label="JSON固定值" disabled={disabled} maxLength={16384} value={text} status={invalid?'error':undefined} onChange={event=>{setText(event.target.value);try{const parsed=JSON.parse(event.target.value);accepted.current=JSON.stringify(parsed);onChange(parsed);setInvalid(false);onInvalidChange(false);}catch{setInvalid(true);onInvalidChange(true);}}} />;
}
