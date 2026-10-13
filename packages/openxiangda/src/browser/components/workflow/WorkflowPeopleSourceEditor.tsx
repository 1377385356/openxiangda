import { Input, Radio, Select } from 'antd';
import { useId } from 'react';
import type { WorkflowBindingEntry, WorkflowNodeConfigurations } from 'openxiangda-contracts/browser';
import { formatWorkflowSupervisorChain, type WorkflowSupervisorChainParameters } from 'openxiangda-contracts/browser';
import { PlatformDirectoryPicker } from '../platform-fields/PlatformDirectoryPicker';

const labels: Record<string, string> = { fixed_users: '指定成员', app_role: '应用角色', app_role_in_scope: '范围内角色', department_supervisor: '部门主管', supervisor_chain: '逐级主管', form_field_users: '表单成员字段', input_users: '申请成员变量', initiator: '发起人', previous_node_actor: '上个节点处理人', application_provider: '应用人员规则', business_relation: '业务关系' };
type StandardProvider = 'fixed_users' | 'app_role' | 'app_role_in_scope';
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export function WorkflowPeopleSourceEditor({ entry, sources, principals, disabled, onChange, allowedProviders = ['fixed_users', 'app_role'], scopeDimensions = [] }: {
  entry: WorkflowBindingEntry; sources: Record<string, WorkflowBindingEntry>; principals: WorkflowNodeConfigurations['principals']; disabled: boolean; onChange: (entry: WorkflowBindingEntry) => void;
  allowedProviders?: readonly StandardProvider[]; scopeDimensions?: readonly string[];
}) {
  const radioName = useId();
  // Entries with routing/bounds or scoped fact expressions remain exact references, not lossy editable copies.
  const editable = (value: WorkflowBindingEntry) => allowedProviders.includes(value.provider as StandardProvider) &&
    Object.keys(value).every(key => (value.provider === 'fixed_users' ? ['provider', 'users'] : value.provider === 'app_role' ? ['provider', 'roleCode', 'roleCodes'] : ['provider', 'roleCode', 'roleCodes', 'scope']).includes(key)) &&
    (value.provider !== 'app_role_in_scope' || !!value.scope && scopeDimensions.includes(value.scope.dimension) && value.scope.valueFrom === undefined);
  const rules = Object.entries(sources).filter(([, value]) => !editable(value));
  const matched = rules.find(([, value]) => JSON.stringify(canonical(value)) === JSON.stringify(canonical(entry)));
  const selection = editable(entry) ? entry.provider : matched ? `rule:${matched[0]}` : '';
  const change = (value: WorkflowBindingEntry) => { if (!disabled) onChange(value); };
  const roles = (values: string[]): WorkflowBindingEntry => ({ provider: entry.provider as 'app_role' | 'app_role_in_scope', ...(values.length === 1 ? { roleCode: values[0] } : values.length ? { roleCodes: values } : {}), ...(entry.provider === 'app_role_in_scope' ? { scope: entry.scope } : {}) });
  return <section className="oxa-workflow-people-sources" aria-label="人员来源配置">
    <Radio.Group name={radioName} optionType="button" buttonStyle="solid" disabled={disabled} value={selection} onChange={event => change(event.target.value === 'fixed_users' ? { provider: 'fixed_users', users: [] } : event.target.value === 'app_role_in_scope' ? { provider: 'app_role_in_scope', scope: { dimension: scopeDimensions[0] || '', value: '' } } : { provider: 'app_role' })} options={allowedProviders.filter(provider => provider !== 'app_role_in_scope' || scopeDimensions.length > 0).map(value => ({ value, label: labels[value] }))} />
    {selection === 'fixed_users' && <PlatformDirectoryPicker kind="user" multiple placeholder="从通讯录选择成员" disabled={disabled} value={(entry.users || []).map(value => ({ value, label: principals.users.find(user => user.value === value)?.label || '成员' }))} onChange={value => change({ provider: 'fixed_users', users: (Array.isArray(value) ? value : []).map(user => user.value) })} />}
    {['app_role', 'app_role_in_scope'].includes(selection) && <Select aria-label="应用角色" mode="multiple" disabled={disabled} placeholder="选择本应用角色" value={entry.roleCodes || (entry.roleCode ? [entry.roleCode] : [])} options={principals.roles.map(role => ({ value: role.code, label: role.name }))} onChange={values => change(roles(values))} maxCount={8} style={{ width: '100%' }} />}
    {selection === 'app_role_in_scope' && entry.provider === 'app_role_in_scope' && <><Select aria-label="人员范围维度" disabled={disabled} value={entry.scope?.dimension} options={scopeDimensions.map(value => ({ value, label: value }))} onChange={dimension => change({ ...entry, scope: { dimension, value: '' } })} /><Input aria-label="人员范围值" disabled={disabled} value={entry.scope?.value || ''} maxLength={255} placeholder="填写已授权的范围值" onChange={event => change({ ...entry, scope: { dimension: entry.scope?.dimension || '', value: event.target.value } })} /></>}
    {!!rules.length && <label>其他已发布人员来源<Select aria-label="其他人员来源" disabled={disabled} value={matched?.[0]} placeholder="选择已发布或当前节点冻结的来源" options={rules.map(([value, source]) => ({ value, label: source.provider === 'supervisor_chain' ? formatWorkflowSupervisorChain(source as WorkflowSupervisorChainParameters) : `${labels[source.provider] || '人员规则'} · ${value}` }))} onChange={value => change(structuredClone(sources[value]!))} /></label>}
    {!selection && <p className="oxa-workflow-config-help">当前来源不在可编辑目录内，原值仍被保留。请选择允许的来源或联系应用开发者。</p>}
    <p className="oxa-workflow-config-help">成员来自组织通讯录，角色来自本应用。复杂来源仅使用精确发布规则，不能自行编造。</p>
  </section>;
}
