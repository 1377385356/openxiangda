import { useState } from 'react';
import { PlatformDirectoryPicker } from '../platform-fields/PlatformDirectoryPicker.js';
import { Input, Select } from 'antd';
import type { WorkflowBusinessStepNode, WorkflowNotificationRecipient } from 'openxiangda-contracts/browser';

export function WorkflowNotificationEditor({ node, variables, roles, users, disabled, onChange }: {
  node: WorkflowBusinessStepNode;
  variables: { path: string; type: string; label: string }[];
  roles: { code: string; name: string }[];
  users: { value: string; label: string }[];
  disabled: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const recipient = node.notification!.recipients;
  const [pickedLabels,setPickedLabels] = useState<Record<string,string>>({});
  const labels = { ...Object.fromEntries(users.map(user => [user.value,user.label])), ...pickedLabels };
  const roleCodes = roles.map(role => role.code);
  const update = (recipients: WorkflowNotificationRecipient) => onChange({ notification: { template: 'workflow_message', recipients } });
  const text = node.inputs.text;
  return <>
    <label>接收人<Select disabled={disabled} value={recipient.provider} options={[
      { value: 'initiator', label: '申请人' }, { value: 'fixed_users', label: '指定成员' },
      ...(roleCodes.length ? [{ value: 'app_role', label: '应用角色' }] : []),
      ...(variables.length ? [{ value: 'form_field_users', label: '申请变量中的成员' }] : []),
    ]} onChange={provider => update(provider === 'fixed_users' ? { provider, users: [] } : provider === 'app_role' ? { provider, roleCode: roleCodes[0]! } : provider === 'form_field_users' ? { provider, inputPath: variables[0]!.path } : { provider: 'initiator' })} /></label>
    {recipient.provider === 'fixed_users' && <label>成员标识<PlatformDirectoryPicker kind="user" multiple disabled={disabled} placeholder="从通讯录选择接收人（最多 50 位）" value={recipient.users.map(value => ({ value, label: labels[value] || '人员信息待载入' }))} onChange={value => { const entries=Array.isArray(value)?value:value?[value]:[];setPickedLabels(current=>({...current,...Object.fromEntries(entries.map(person=>[person.value,person.label]))}));update({provider:'fixed_users',users:entries.map(person=>person.value)}); }} /></label>}
    {recipient.provider === 'app_role' && <label>应用角色<Select disabled={disabled} value={recipient.roleCode} options={roles.map(role => ({ value: role.code, label: role.name }))} onChange={roleCode => update({ provider: 'app_role', roleCode })} /></label>}
    {recipient.provider === 'form_field_users' && <label>成员变量<Select disabled={disabled} value={recipient.inputPath} options={variables.map(variable => ({ value: variable.path, label: variable.label }))} onChange={inputPath => update({ provider: 'form_field_users', inputPath })} /></label>}
    <label>通知内容来源<Select disabled={disabled} value={text?.source || 'literal'} options={[{ value: 'literal', label: '固定文本' }, ...(variables.some(variable => variable.type === 'string') ? [{ value: 'fact', label: '文本变量' }] : [])]} onChange={source => onChange({ inputs: { text: source === 'fact' ? { source, path: variables.find(variable => variable.type === 'string')!.path } : { source: 'literal', value: '' } } })} /></label>
    {text?.source === 'fact' ? <label>文本变量<Select disabled={disabled} value={text.path} options={variables.filter(variable => variable.type === 'string').map(variable => ({ value: variable.path, label: variable.label }))} onChange={path => onChange({ inputs: { text: { source: 'fact', path } } })} /></label> : <label>通知内容<Input.TextArea disabled={disabled} maxLength={2048} showCount value={String(text?.source === 'literal' ? text.value : '')} onChange={event => onChange({ inputs: { text: { source: 'literal', value: event.target.value } } })} /></label>}
    <p>通过通知中心发送消息，每次经过此节点发送一次；直接续办不会重复发送。通知不授予申请读取权限。</p>
  </>;
}
