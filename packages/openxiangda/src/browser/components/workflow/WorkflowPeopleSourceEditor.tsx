import { workflowPeopleSourceTemplateMatches, type WorkflowPeopleSourceTemplate } from 'openxiangda-contracts/browser';
import { WorkflowPeopleSourceParametersEditor } from './WorkflowPeopleSourceParametersEditor';
import { Input, Select } from 'antd';
import type { WorkflowBindingEntry, WorkflowGraphVariable, WorkflowNodeConfigurations } from 'openxiangda-contracts/browser';
import { workflowPeopleProviderLabels as labels, workflowPeopleSourceSummary, workflowPeopleSourceBounds } from './workflow-people-source-presentation';
import { PlatformDirectoryPicker } from '../platform-fields/PlatformDirectoryPicker';

type StandardProvider = 'fixed_users' | 'app_role' | 'app_role_in_scope';
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export function WorkflowPeopleSourceEditor({ entry, sources, principals, disabled, onChange, allowedProviders = ['fixed_users', 'app_role'], scopeDimensions = [], variables = [], templates = [] }: {
  entry: WorkflowBindingEntry; sources: Record<string, WorkflowBindingEntry>; principals: WorkflowNodeConfigurations['principals']; disabled: boolean; onChange: (entry: WorkflowBindingEntry) => void;
  templates?: readonly WorkflowPeopleSourceTemplate[]; allowedProviders?: readonly StandardProvider[]; scopeDimensions?: readonly string[];
  variables?: readonly Pick<WorkflowGraphVariable, 'path' | 'label'>[];
}) {
  // Entries with routing/bounds or scoped fact expressions remain exact references, not lossy editable copies.
  const editable = (value: WorkflowBindingEntry) => allowedProviders.includes(value.provider as StandardProvider) &&
    Object.keys(value).every(key => (value.provider === 'fixed_users' ? ['provider', 'users'] : value.provider === 'app_role' ? ['provider', 'roleCode', 'roleCodes'] : ['provider', 'roleCode', 'roleCodes', 'scope']).includes(key)) &&
    (value.provider !== 'app_role_in_scope' || !!value.scope && scopeDimensions.includes(value.scope.dimension) && value.scope.valueFrom === undefined);
  const allSources={...Object.fromEntries(templates.map(template=>[`authoring:${template.code}`,template.entry])),...sources};
  const parameterTemplate=entry.provider!=='conditional'?templates.find(template=>workflowPeopleSourceTemplateMatches(entry,template,false)):undefined;
  const rules = Object.entries(allSources).filter(([, value]) => !editable(value)).filter(([,value],index,all)=>all.findIndex(([,candidate])=>JSON.stringify(canonical(candidate))===JSON.stringify(canonical(value)))===index);
  const matched = rules.find(([, value]) => JSON.stringify(canonical(value)) === JSON.stringify(canonical(entry)));
  const selection = editable(entry) ? entry.provider : matched ? `rule:${matched[0]}` : parameterTemplate ? `template:${parameterTemplate.code}` : '';
  const ruleTypes = [...new Set(rules.map(([, source]) => source.provider))];
  const currentRules = rules.filter(([, source])=>['app_role','app_role_in_scope'].includes(entry.provider)?['app_role','app_role_in_scope'].includes(source.provider):source.provider===entry.provider);
  const needsSourceChoice = !parameterTemplate || currentRules.some(([, source]) => source.provider === 'conditional' || !workflowPeopleSourceTemplateMatches(source, parameterTemplate, false));
  const change = (value: WorkflowBindingEntry) => { if (!disabled) onChange(value); };
  const roles = (values: string[]): WorkflowBindingEntry => ({ provider: entry.provider as 'app_role' | 'app_role_in_scope', ...(values.length === 1 ? { roleCode: values[0] } : values.length ? { roleCodes: values } : {}), ...(entry.provider === 'app_role_in_scope' ? { scope: entry.scope } : {}) });
  return <section className="oxa-workflow-people-sources" aria-label="人员来源配置">
    <label>审批人来源</label><Select aria-label="审批人来源" style={{width:'100%'}} disabled={disabled} value={entry.provider==='app_role_in_scope'?'app_role':entry.provider}
      options={[...new Set([...allowedProviders,...ruleTypes].map(provider=>provider==='app_role_in_scope'?'app_role':provider))].map(value=>({value,label:({app_role:'按角色',department_supervisor:'部门主管',form_field_users:'表单中选择的人员'} as Record<string,string>)[value]||labels[value]||'应用人员规则'}))}
      onChange={type=>{
        if(type===(entry.provider==='app_role_in_scope'?'app_role':entry.provider))return;
        const source=rules.find(([,source])=>(source.provider==='app_role_in_scope'?'app_role':source.provider)===type)?.[1];
        if(type==='fixed_users'&&allowedProviders.includes('fixed_users'))change({provider:'fixed_users',users:[]});
        else if(type==='app_role'&&allowedProviders.includes('app_role'))change({provider:'app_role'});
        else if(type==='app_role'&&allowedProviders.includes('app_role_in_scope')&&scopeDimensions.length)change({provider:'app_role_in_scope',scope:{dimension:scopeDimensions[0]!,value:''}});
        else if(source)change(structuredClone(source));
      }} />
    {selection === 'fixed_users' && <PlatformDirectoryPicker kind="user" multiple placeholder="从通讯录选择成员" disabled={disabled} value={(entry.users || []).map(value => ({ value, label: principals.users.find(user => user.value === value)?.label || '成员' }))} onChange={value => change({ provider: 'fixed_users', users: (Array.isArray(value) ? value : []).map(user => user.value) })} />}
    {['app_role', 'app_role_in_scope'].includes(selection) && <Select aria-label="应用角色" mode="multiple" disabled={disabled} placeholder="选择本应用角色" value={entry.roleCodes || (entry.roleCode ? [entry.roleCode] : [])} options={principals.roles.map(role => ({ value: role.code, label: role.name }))} onChange={values => change(roles(values))} maxCount={8} style={{ width: '100%' }} />}
    {selection === 'app_role_in_scope' && entry.provider === 'app_role_in_scope' && <><Select aria-label="人员范围维度" disabled={disabled} value={entry.scope?.dimension} options={scopeDimensions.map(value => ({ value, label: value }))} onChange={dimension => change({ ...entry, scope: { dimension, value: '' } })} /><Input aria-label="人员范围值" disabled={disabled} value={entry.scope?.value || ''} maxLength={255} placeholder="填写已授权的范围值" onChange={event => change({ ...entry, scope: { dimension: entry.scope?.dimension || '', value: event.target.value } })} /></>}
    {currentRules.length>0 && (needsSourceChoice || ['app_role','app_role_in_scope'].includes(entry.provider)) && <label>取人配置<Select aria-label="取人配置" style={{width:'100%'}} disabled={disabled} value={matched?.[0]||(parameterTemplate?'authoring:'+parameterTemplate.code:selection)}
      options={[...(['app_role','app_role_in_scope'].includes(entry.provider)&&allowedProviders.includes('app_role')?[{value:'app_role',label:'直接选择应用角色'}]:[]),...currentRules.map(([value,source])=>({value,label:[workflowPeopleSourceSummary(source,variables,principals),workflowPeopleSourceBounds(source)].filter(Boolean).join('；')}))]}
      onChange={value=>{if(value==='app_role')change({provider:'app_role'});else if(Object.hasOwn(allSources,value))change(structuredClone(allSources[value]!));}} /></label>}
    {parameterTemplate && entry.provider!=='conditional' && <WorkflowPeopleSourceParametersEditor entry={entry} template={parameterTemplate} variables={variables} principals={principals} disabled={disabled} onChange={change} />}
    {!selection && <p className="oxa-workflow-config-help">当前来源不在可编辑目录内，原值仍被保留。请选择允许的来源或联系应用开发者。</p>}
    <p className="oxa-workflow-config-help">仅显示本节点允许的来源；已有的人员范围和人数限制会完整保留。</p>
  </section>;
}
