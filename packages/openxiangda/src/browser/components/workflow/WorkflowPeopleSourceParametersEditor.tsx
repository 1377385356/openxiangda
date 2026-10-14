import { InputNumber, Select } from 'antd';
import type { WorkflowGraphVariable, WorkflowNodeConfigurations, WorkflowStandardBindingEntry, WorkflowPeopleSourceTemplate } from 'openxiangda-contracts/browser';

const titles:Record<string,string>={departmentIdFrom:'部门来源',level:'主管级别',fallbackToAncestorSupervisor:'本级无人时',from:'起点成员',until:'审批终点',continuous:'办理范围',missing:'无主管层级处理',inputPath:'表单成员来源',roleCode:'应用角色',scope:'角色范围',min:'至少人数',max:'最多人数'};
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function workflowPeopleParameterOptionLabel(field:string,value:any,variables:readonly Pick<WorkflowGraphVariable,'path'|'label'>[],principals:WorkflowNodeConfigurations['principals']):string {
  const fact=(path:string)=>variables.find(v=>v.path===path)?.label||'已发布的表单字段';
  const role=(code:string)=>principals.roles.find(r=>r.code===code)?.name||'已发布角色（暂无名称）';
  if(field==='level')return `第 ${value} 级主管`;
  if(field==='min'||field==='max')return `${value} 人`;
  if(field==='fallbackToAncestorSupervisor')return value?'向上查找祖先部门主管':'阻止办理并提示配置';
  if(field==='continuous')return value?'从起点逐级依次办理':'仅审批终点办理';
  if(field==='missing')return value==='skip_level'?'跳过无人层级，继续向上':'阻止办理并提示配置';
  if(field==='departmentIdFrom'||field==='inputPath')return fact(value);
  if(field==='roleCode')return role(value);
  if(field==='from')return value==='initiator'?'本申请发起人':fact(value?.field);
  if(field==='until')return value==='top'?'最上级主管':value?.level?`第 ${value.level} 级主管`:role(value?.roleCode);
  if(field==='scope')return value?.valueFrom?`按${fact(value.valueFrom)}的授权范围`:'代码声明的固定授权范围';
  return '已发布参数选项';
}
/** Whole-value controlled edit. Opening never normalizes missing/unknown parameters. */
export function WorkflowPeopleSourceParametersEditor({entry,template,variables=[],principals,disabled,onChange}:{entry:WorkflowStandardBindingEntry;template:WorkflowPeopleSourceTemplate;variables?:readonly Pick<WorkflowGraphVariable,'path'|'label'>[];principals:WorkflowNodeConfigurations['principals'];disabled:boolean;onChange:(entry:WorkflowStandardBindingEntry)=>void}) {
  const change=(field:string,value:unknown)=>{if(!disabled)onChange({...entry,[field]:value});};
  return <section aria-label="人员来源参数" className="oxa-workflow-source-parameters" style={{display:'grid',gap:12}}><h4>{template.title}</h4>
    {Object.entries(template.parameters).map(([field,parameter])=>{
      const current=(entry as any)[field];const values=parameter.values;
      const selected=values?.findIndex(value=>JSON.stringify(canonical(value))===JSON.stringify(canonical(current)));
      return <label key={field} style={{display:'grid',gap:4}}>{titles[field]||'人员参数'}{values?<Select aria-label={titles[field]||'人员参数'} style={{width:'100%'}} disabled={disabled} showSearch optionFilterProp="label" value={selected===-1?'unknown':String(selected)}
        options={[...values.map((value,index)=>({value:String(index),label:workflowPeopleParameterOptionLabel(field,value,variables,principals)})),...(selected===-1?[{value:'unknown',label:current===undefined?'采用来源默认值':'当前值不在已发布范围，请修正',disabled:true}]:[])]}
        onChange={index=>{if(index!=='unknown'&&Object.hasOwn(values,index))change(field,structuredClone(values[Number(index)]));}}/>:
        <InputNumber aria-label={titles[field]||'人员参数'} style={{width:'100%'}} disabled={disabled} min={parameter.minimum} max={parameter.maximum} precision={0} value={typeof current==='number'?current:null} addonAfter={field==='level'?'级':'人'}
          onChange={value=>{if(value!==null)change(field,value);}}/>}</label>;
    })}<p className="oxa-workflow-config-help">仅可调整本应用已发布的参数范围。人员、部门、层级和授权在实际办理时由平台核验；缺少有效人员不会扩大范围或任意改选其他来源。</p>
  </section>;
}
