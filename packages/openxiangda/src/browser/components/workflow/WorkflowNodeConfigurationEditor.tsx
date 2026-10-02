import { useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Drawer, Empty, Form, Input, Radio, Select, Space, Tabs, Tag, Typography } from 'antd';
import type { WorkflowNodeConfigurations, WorkflowNodeConfigurationPatch, WorkflowNodeConfigurationMutation, WorkflowNodeConfigurationReceipt } from 'openxiangda-contracts/browser';
import { validateWorkflowNodeConfigurationPatch } from 'openxiangda-contracts/browser';
import { PlatformDirectoryPicker } from '../platform-fields/PlatformDirectoryPicker';
import { loadApplicationAdministrationContext, loadWorkflowNodeConfigurations, saveWorkflowNodeConfiguration } from '../../platform-client';

type Node = WorkflowNodeConfigurations['nodes'][number];
type Values = {
  title: string; description?: string; provider?: 'fixed_users' | 'app_role' | 'app_role_in_scope';
  users?: Array<{ value: string; label?: string }>; roleCode?: string; mode?: Node['effective']['mode']; reason: string;
  operations?: WorkflowNodeConfigurationPatch['operations'];
};
const labels: Record<string, string> = { approve: '同意', reject: '拒绝', return: '退回', transfer: '转交', delegate: '委托', add_assignee: '加签' };
const modes: Record<string, string> = { single: '单人审批', any: '或签：一人通过即可', all: '会签：全部通过', sequence: '依次审批' };
const modeDescriptions: Record<string, string> = { single: '只分派给一位审批人。', any: '任一审批人同意后，此节点完成。', all: '所有审批人同意后，此节点完成。', sequence: '按候选人顺序逐一处理。' };
const providers: Record<string, string> = { fixed_users: '指定人员', app_role: '应用角色', app_role_in_scope: '范围内的应用角色' };
const effect = '保存后，后续进入此节点的任务使用新配置。当前待办保留进入时的审批方式、人员和按钮。';

function initialValues(node: Node, principals: WorkflowNodeConfigurations['principals']): Partial<Values> {
  return {
    title: node.effective.title, description: node.effective.description || '', mode: node.effective.mode || node.defaults.mode,
    provider: node.effective.binding?.provider as Values['provider'], roleCode: node.effective.binding?.roleCode,
    users: (node.effective.binding?.users || []).map(value => ({ value, label: principals.users.find(person => person.value === value)?.label || '人员信息不可用' })),
    operations: Object.fromEntries((node.administration?.operations || []).map(operation => [operation, {
      enabled: node.effective.allowedOperations?.includes(operation) ?? true,
      label: node.effective.operationPolicy?.[operation]?.label || labels[operation],
      commentRequired: operation === 'reject' || node.effective.operationPolicy?.[operation]?.commentRequired === true,
    }])),
  };
}

/** Shared editor: platform console and application pages use the same bounded SDK write. */
export function WorkflowNodeConfigurationEditor({ workflowCode, node: initialNode, principals: initialPrincipals, expectedHeadRevision, onClose, onSaved }: {
  workflowCode: string; node: Node; principals: WorkflowNodeConfigurations['principals']; expectedHeadRevision: number;
  onClose: () => void; onSaved: (receipt: WorkflowNodeConfigurationReceipt) => void;
}) {
  const { modal } = App.useApp();
  const [node, setNode] = useState(initialNode);
  const [principals, setPrincipals] = useState(initialPrincipals);
  const [form] = Form.useForm<Values>();
  const basis = useRef({ expectedHeadRevision, expectedRevision: initialNode.configuration.revision });
  const frozen = useRef<WorkflowNodeConfigurationMutation | null>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false), [error, setError] = useState('');
  const [tab, setTab] = useState(['approval', 'cc'].includes(initialNode.kind) ? 'people' : 'general');
  const isCc = node.kind === 'cc';
  const selectedProvider = Form.useWatch('provider', form) || node.effective.binding?.provider;
  const binding = node.defaults.binding;
  const allowedProviders = node.administration?.assigneeProviders || (!isCc && binding && providers[binding.provider] ? [binding.provider] : []);
  const close = () => {
    if (busy) return;
    if (form.isFieldsTouched() || uncertain) modal.confirm({ title: '关闭节点配置？', content: uncertain ? '操作结果尚未确认。请保留原操作 ID，重新打开后先查询配置和修改记录。' : '未保存的草稿将离开编辑器。', okText: '关闭', cancelText: '继续编辑', onOk: onClose });
    else onClose();
  };
  const buildPatch = (values: Values): WorkflowNodeConfigurationPatch => {
    const patch = structuredClone(node.configuration.patch || {});
    if (form.isFieldTouched('title')) patch.title = values.title;
    if (form.isFieldTouched('description')) patch.description = values.description || '';
    if (form.isFieldTouched('mode')) patch.mode = values.mode;
    if ((['provider', 'users', 'roleCode'] as const).some(name => form.isFieldTouched(name)) && allowedProviders.length) {
      patch.assignee = values.provider === 'fixed_users' ? { provider: 'fixed_users', users: (values.users || []).map(person => person.value) } : { provider: values.provider as 'app_role' | 'app_role_in_scope', roleCode: values.roleCode || '' };
    }
    for (const operation of node.administration?.operations || []) {
      const changed: Record<string, unknown> = {};
      for (const key of ['enabled', 'label', 'commentRequired'] as const) if (form.isFieldTouched(['operations', operation, key])) changed[key] = values.operations?.[operation]?.[key];
      if (Object.keys(changed).length) patch.operations = { ...patch.operations, [operation]: { ...patch.operations?.[operation], ...changed } };
    }
    return patch;
  };
  const save = async () => {
    if (!frozen.current) {
      let values: Values;
      try { values = await form.validateFields(); } catch (failure) {
        const first = (failure as { errorFields?: Array<{ name: Array<string | number> }> }).errorFields?.[0]?.name[0];
        if (first) setTab(['title', 'description'].includes(String(first)) ? 'general' : first === 'operations' ? 'operations' : first === 'reason' ? tab : 'people');
        return;
      }
      const patch = buildPatch(values);
      const errors = validateWorkflowNodeConfigurationPatch({
        kind: node.kind, mode: node.defaults.mode, administration: node.administration,
        allowedOperations: node.defaults.allowedOperations, operationPolicy: node.defaults.operationPolicy,
        fieldPolicy: node.defaults.fieldPolicy,
      }, binding, patch);
      if (errors.length) { setError(errors.join('；')); return; }
      frozen.current = { ...basis.current, patch, reason: values.reason, operationId: crypto.randomUUID() };
    }
    setBusy(true); setError('');
    try {
      const receipt = await saveWorkflowNodeConfiguration(workflowCode, node.nodeId, frozen.current);
      onSaved(receipt);
    } catch (failure) {
      const detail = failure as Error & { code?: string; status?: number };
      setError(detail.message);
      if (['WORKFLOW_V2_NODE_CONFIGURATION_REVISION_CONFLICT', 'WORKFLOW_V2_NODE_CONFIGURATION_HEAD_CHANGED'].includes(detail.code || '')) {
        setConflict(true); frozen.current = null; setUncertain(false);
      } else if (detail.status && detail.status >= 400 && detail.status < 500) {
        frozen.current = null; setUncertain(false);
      } else setUncertain(true);
    } finally { setBusy(false); }
  };
  const refreshKeepingDraft = async () => {
    setBusy(true); setError('');
    try {
      const [configuration, context] = await Promise.all([loadWorkflowNodeConfigurations(workflowCode), loadApplicationAdministrationContext()]);
      const latest = configuration.nodes.find(item => item.nodeId === node.nodeId);
      if (!latest || context.headRevision == null) throw new Error('当前定义已移除此节点或没有激活版本，请关闭后重新查看流程。');
      const values = initialValues(latest, configuration.principals);
      for (const key of ['title', 'description', 'mode', 'provider', 'users', 'roleCode'] as const) if (!form.isFieldTouched(key)) form.setFieldValue(key, values[key]);
      for (const operation of latest.administration?.operations || []) for (const key of ['enabled', 'label', 'commentRequired'] as const) if (!form.isFieldTouched(['operations', operation, key])) form.setFieldValue(['operations', operation, key], values.operations?.[operation]?.[key]);
      basis.current = { expectedHeadRevision: context.headRevision, expectedRevision: latest.configuration.revision };
      setNode(latest); setPrincipals(configuration.principals); setConflict(false); frozen.current = null;
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  return <Drawer open title="调整节点配置" size={620} rootClassName="oxa-workflow-config" onClose={close} closable={!busy} mask={{ closable: !busy }} footer={<div className="oxa-workflow-config-footer"><span>当前待办保留原配置</span><Space><Button disabled={busy} onClick={close}>取消</Button><Button aria-label="保存节点配置" type="primary" loading={busy} disabled={conflict} onClick={() => void save()}>{uncertain ? '重试相同操作' : '保存配置'}</Button></Space></div>}>
    <div className="oxa-workflow-config-context"><Typography.Title level={4}>{node.effective.title}</Typography.Title><Space wrap><Tag>{node.configuration.patch ? '后台覆盖' : '代码默认值'}</Tag><Tag>修订 {basis.current.expectedRevision}</Tag></Space></div>
    <Alert type="info" showIcon title="对后续进入的节点生效" description={isCc ? '后续进入使用新配置；已抄送的接收人和记录保留。' : effect} style={{ marginBottom: 16 }} />
    {error && <Alert type="error" showIcon title={conflict ? '配置已有新的修订，草稿已保留' : uncertain ? '操作结果未确认' : '配置未保存'} description={error} style={{ marginBottom: 16 }} />}
    {conflict && <Button onClick={() => void refreshKeepingDraft()} disabled={busy} style={{ marginBottom: 16 }}>载入最新配置并保留草稿</Button>}
    {uncertain && <Typography.Paragraph>继续使用原操作 ID：<Typography.Text code>{frozen.current?.operationId}</Typography.Text>。重试时不修改请求。</Typography.Paragraph>}
    <Form form={form} layout="vertical" disabled={busy || uncertain} initialValues={initialValues(initialNode, initialPrincipals)}>
      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'people', label: isCc ? '抄送人' : '审批人', forceRender: true, children: <>
          <p className="oxa-workflow-config-help">{isCc ? '抄送来源由开发者开放；保存时校验人员、角色及范围。抄送只提供流程查阅权。' : '人员来源和可选审批方式由开发者开放；保存时平台校验人员、角色及范围。'}</p>
          {allowedProviders.length > 0 ? <>
            <Form.Item name="provider" label="人员来源" rules={[{ required: true }]}><Radio.Group className="oxa-workflow-provider-options" options={allowedProviders.map(value => ({ value, label: providers[value] }))} /></Form.Item>
            {selectedProvider === 'fixed_users' && <Form.Item name="users" label={isCc ? '指定抄送人' : '指定审批人'} rules={[{ required: true, type: 'array', min: 1, max: isCc ? 20 : 200 }]}><PlatformDirectoryPicker kind="user" multiple placeholder="从通讯录选择人员" /></Form.Item>}
            {['app_role', 'app_role_in_scope'].includes(selectedProvider || '') && <Form.Item name="roleCode" label={isCc ? '抄送角色' : '审批角色'} rules={[{ required: true }]}><Select showSearch={{ optionFilterProp: 'label' }} options={principals.roles.map(role => ({ value: role.code, label: `${role.name}（${role.code}）` }))} /></Form.Item>}
          </> : <Alert type="info" title="人员来源由开发者维护" description="此节点未开放人员来源调整。" />}
          {binding?.scope && <p className="oxa-workflow-config-scope">范围来源：{binding.scope.dimension} · {binding.scope.valueFrom || binding.scope.value}<br />范围计算由流程代码维护。</p>}
          {!isCc && (node.administration?.modes ? <Form.Item name="mode" label="审批方式" rules={[{ required: true }]}><Radio.Group className="oxa-workflow-mode-options" options={node.administration.modes.map(value => ({ value, label: <span><b>{modes[value]}</b><small>{modeDescriptions[value]}</small></span> }))} /></Form.Item> : <p className="oxa-workflow-config-help">审批方式：{modes[node.effective.mode || ''] || '由开发者维护'}</p>)}
        </> },
        { key: 'operations', label: '审批按钮', forceRender: true, children: <>
          <p className="oxa-workflow-config-help">修改显示文字、开关和意见要求。同意与拒绝保持启用；拒绝必须填写意见。</p>
          {(node.administration?.operations || []).map(operation => <section key={operation} className="oxa-workflow-operation-row">
            <div className="oxa-workflow-operation-heading"><b>{labels[operation]}</b>{!['approve', 'reject'].includes(operation) ? <Form.Item name={['operations', operation, 'enabled']} valuePropName="checked" noStyle><Checkbox>启用</Checkbox></Form.Item> : <Tag>始终启用</Tag>}</div>
            <Form.Item name={['operations', operation, 'label']} label={`${labels[operation]}按钮文字`} rules={[{ required: true, whitespace: true, max: 40 }]}><Input maxLength={40} /></Form.Item>
            {['approve', 'reject'].includes(operation) ? <Form.Item name={['operations', operation, 'commentRequired']} valuePropName="checked"><Checkbox disabled={busy || uncertain || operation === 'reject' || node.defaults.operationPolicy?.[operation]?.commentRequired === true}>必须填写审批意见</Checkbox></Form.Item> : <small>操作时须填写原因。</small>}
          </section>)}
          {!node.administration?.operations?.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此节点的按钮由开发者维护" />}
        </> },
        { key: 'general', label: '名称与说明', forceRender: true, children: <>
          <Form.Item name="title" label="节点名称" rules={[{ required: true, whitespace: true }]}><Input maxLength={255} /></Form.Item>
          <Form.Item name="description" label="节点说明"><Input.TextArea rows={4} maxLength={1000} /></Form.Item>
          <p className="oxa-workflow-config-help">流程连线、条件分支及业务代码由开发者维护。修改名称和说明不会改变流转逻辑。</p>
        </> },
      ].filter(item => node.kind === 'approval' || item.key === 'general' || isCc && item.key === 'people')} />
      <div className="oxa-workflow-config-reason"><Form.Item name="reason" label="修改原因" rules={[{ required: true, whitespace: true }]} extra="将记录在配置修改历史中。"><Input.TextArea rows={2} maxLength={1000} placeholder="说明本次调整的原因" /></Form.Item></div>
    </Form>
  </Drawer>;
}
