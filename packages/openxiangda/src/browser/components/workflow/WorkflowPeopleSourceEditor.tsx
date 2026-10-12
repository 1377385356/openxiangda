import { Radio, Select } from 'antd';
import type { WorkflowBindingEntry, WorkflowNodeConfigurations } from 'openxiangda-contracts/browser';
import { formatWorkflowSupervisorChain, type WorkflowSupervisorChainParameters } from 'openxiangda-contracts/browser';
import { PlatformDirectoryPicker } from '../platform-fields/PlatformDirectoryPicker';

const labels: Record<string, string> = { fixed_users:'指定成员',app_role:'应用角色',app_role_in_scope:'范围内角色',department_supervisor:'部门主管',supervisor_chain:'逐级主管',form_field_users:'表单成员字段',input_users:'申请成员变量',initiator:'发起人',previous_node_actor:'上个节点处理人',application_provider:'应用人员规则',business_relation:'业务关系' };
export function WorkflowPeopleSourceEditor({ entry, sources, principals, disabled, onChange }: {
  entry: WorkflowBindingEntry; sources: Record<string,WorkflowBindingEntry>; principals: WorkflowNodeConfigurations['principals']; disabled: boolean; onChange: (entry: WorkflowBindingEntry) => void;
}) {
  const rules = Object.entries(sources).filter(([,value]) => !['fixed_users','app_role'].includes(value.provider));
  const equal = (value: unknown) => JSON.stringify(value) === JSON.stringify(entry);
  const matched = rules.find(([,value]) => equal(value));
  const selection = matched ? `rule:${matched[0]}` : ['fixed_users','app_role'].includes(entry.provider) ? entry.provider : '';
  return <section className="oxa-workflow-people-sources" aria-label="人员来源配置">
    <Radio.Group optionType="button" buttonStyle="solid" disabled={disabled} value={selection} onChange={event => onChange(event.target.value === 'fixed_users' ? { provider:'fixed_users',users:[] } : {provider:'app_role'})} options={[{ value:'fixed_users',label:'指定成员' },{ value:'app_role',label:'应用角色' }]} />
    {entry.provider === 'fixed_users' && <PlatformDirectoryPicker kind="user" multiple placeholder="从通讯录选择成员" disabled={disabled} value={(entry.users || []).map(value => ({value,label:principals.users.find(user => user.value===value)?.label || '成员'}))} onChange={value => onChange({provider:'fixed_users',users:(Array.isArray(value) ? value : []).map(user => user.value)})} />}
    {entry.provider === 'app_role' && <Select aria-label="应用角色" mode="multiple" disabled={disabled} placeholder="选择本应用角色" value={entry.roleCodes || (entry.roleCode ? [entry.roleCode] : [])} options={principals.roles.map(role => ({value:role.code,label:role.name}))} onChange={roles => onChange(roles.length === 1 ? {provider:'app_role',roleCode:roles[0]} : roles.length ? {provider:'app_role',roleCodes:roles} : {provider:'app_role'})} maxCount={8} style={{width:'100%'}} />}
    {!!rules.length && <label>其他已发布人员来源<Select aria-label="其他人员来源" disabled={disabled} value={matched?.[0]} placeholder="部门主管、逐级主管、表单成员等" options={rules.map(([value,source]) => ({value,label:source.provider==='supervisor_chain' ? formatWorkflowSupervisorChain(source as WorkflowSupervisorChainParameters) : `${labels[source.provider] || '人员规则'} · ${value}`}))} onChange={value => onChange(structuredClone(sources[value]!))} /></label>}
    <p className="oxa-workflow-config-help">成员来自组织通讯录，角色来自本应用。主管与表单成员来源仅使用应用发布的规则，未开放的来源不能自行编造。</p>
  </section>;
}
