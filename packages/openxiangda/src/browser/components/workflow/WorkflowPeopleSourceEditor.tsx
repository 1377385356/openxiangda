import { workflowPeopleSourceTemplateMatches, type WorkflowPeopleSourceTemplate } from 'openxiangda-contracts/browser';
import { WorkflowPeopleSourceParametersEditor } from './WorkflowPeopleSourceParametersEditor';
import { Input, Radio, Select } from 'antd';
import { useId } from 'react';
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
  const radioName = useId();
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
  const selectedType = matched || parameterTemplate ? `released:${entry.provider}` : selection;
  const currentRules = matched || parameterTemplate ? rules.filter(([, source])=>source.provider===entry.provider) : [];
  const needsSourceChoice = !parameterTemplate || currentRules.some(([, source]) => source.provider === 'conditional' || !workflowPeopleSourceTemplateMatches(source, parameterTemplate, false));
  const change = (value: WorkflowBindingEntry) => { if (!disabled) onChange(value); };
  const roles = (values: string[]): WorkflowBindingEntry => ({ provider: entry.provider as 'app_role' | 'app_role_in_scope', ...(values.length === 1 ? { roleCode: values[0] } : values.length ? { roleCodes: values } : {}), ...(entry.provider === 'app_role_in_scope' ? { scope: entry.scope } : {}) });
  return <section className="oxa-workflow-people-sources" aria-label="人员来源配置">
    <label>人员类型</label><Radio.Group aria-label="审批人类型" name={radioName} optionType="button" buttonStyle="solid" disabled={disabled} value={selectedType} onChange={event => {
      const type = String(event.target.value);
      if (type.startsWith('released:')) { const source = rules.find(([, source]) => `released:${source.provider}` === type)?.[1]; if (source) change(structuredClone(source)); }
      else change(type === 'fixed_users' ? { provider: 'fixed_users', users: [] } : type === 'app_role_in_scope' ? { provider: 'app_role_in_scope', scope: { dimension: scopeDimensions[0] || '', value: '' } } : { provider: 'app_role' });
    }} options={[...allowedProviders.filter(provider => provider !== 'app_role_in_scope' || scopeDimensions.length > 0).map(value => ({ value, label: labels[value] })), ...ruleTypes.map(provider => ({ value: `released:${provider}`, label: `${labels[provider] || '已发布人员规则'}${allowedProviders.includes(provider as StandardProvider) ? '（已发布规则）' : ''}` }))]} />
    {selection === 'fixed_users' && <PlatformDirectoryPicker kind="user" multiple placeholder="从通讯录选择成员" disabled={disabled} value={(entry.users || []).map(value => ({ value, label: principals.users.find(user => user.value === value)?.label || '成员' }))} onChange={value => change({ provider: 'fixed_users', users: (Array.isArray(value) ? value : []).map(user => user.value) })} />}
    {['app_role', 'app_role_in_scope'].includes(selection) && <Select aria-label="应用角色" mode="multiple" disabled={disabled} placeholder="选择本应用角色" value={entry.roleCodes || (entry.roleCode ? [entry.roleCode] : [])} options={principals.roles.map(role => ({ value: role.code, label: role.name }))} onChange={values => change(roles(values))} maxCount={8} style={{ width: '100%' }} />}
    {selection === 'app_role_in_scope' && entry.provider === 'app_role_in_scope' && <><Select aria-label="人员范围维度" disabled={disabled} value={entry.scope?.dimension} options={scopeDimensions.map(value => ({ value, label: value }))} onChange={dimension => change({ ...entry, scope: { dimension, value: '' } })} /><Input aria-label="人员范围值" disabled={disabled} value={entry.scope?.value || ''} maxLength={255} placeholder="填写已授权的范围值" onChange={event => change({ ...entry, scope: { dimension: entry.scope?.dimension || '', value: event.target.value } })} /></>}
    {(matched || parameterTemplate) && needsSourceChoice && <><label>{labels[entry.provider] || '已发布人员规则'}来源<Select aria-label="其他人员来源" showSearch optionFilterProp="label" disabled={disabled} value={matched?.[0] || (parameterTemplate?`authoring:${parameterTemplate.code}`:undefined)} options={currentRules.map(([value, source], index) => ({ value, label: `${templates.find(template=>source.provider!=='conditional'&&workflowPeopleSourceTemplateMatches(source,template,false))?.title || workflowPeopleSourceSummary(source, variables, principals)}${currentRules.length > 1 ? `（规则 ${index + 1}）` : ''}` }))} onChange={value => { if (Object.hasOwn(allSources, value)) change(structuredClone(allSources[value]!)); }} /></label>
      <p className="oxa-workflow-config-help">{workflowPeopleSourceSummary(entry, variables, principals)}{workflowPeopleSourceBounds(entry) ? `；${workflowPeopleSourceBounds(entry)}` : ''}。{parameterTemplate?'下方可调整已发布范围内的参数。':'规则参数来自已发布配置，选择不会更改这些参数。'}</p></>}
    {parameterTemplate && entry.provider!=='conditional' && <WorkflowPeopleSourceParametersEditor entry={entry} template={parameterTemplate} variables={variables} principals={principals} disabled={disabled} onChange={change} />}
    {!selection && <p className="oxa-workflow-config-help">当前来源不在可编辑目录内，原值仍被保留。请选择允许的来源或联系应用开发者。</p>}
    <p className="oxa-workflow-config-help">成员来自组织通讯录，角色来自本应用。复杂来源使用已发布规则或明确开放的参数范围，不能自行编造新的人员服务。</p>
  </section>;
}
