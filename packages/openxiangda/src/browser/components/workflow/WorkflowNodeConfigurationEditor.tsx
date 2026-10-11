import { createBrowserUuid } from '../../uuid';
import { useEffect, useRef, useState } from 'react';
import { useUnsavedChangesGuard } from '../../navigation-guard';
import { Alert, App, Button, Drawer, Empty, Form, Input, Radio, Select, Space, Switch, Tag, Typography } from 'antd';
import type { WorkflowNodeConfigurations, WorkflowNodeConfigurationPatch, WorkflowNodeConfigurationMutation, WorkflowNodeConfigurationReceipt } from 'openxiangda-contracts/browser';
import { formatWorkflowCompletionDeadline, validateWorkflowNodeConfigurationPatch, workflowOperationOpinion, workflowOperationMinimumOpinion, WORKFLOW_AUTOMATIC_CC_DEFAULT_RECIPIENTS, WORKFLOW_AUTOMATIC_CC_MAX_RECIPIENTS } from 'openxiangda-contracts/browser';
import { PlatformDirectoryPicker } from '../platform-fields/PlatformDirectoryPicker';
import { loadApplicationAdministrationContext, loadWorkflowNodeConfigurations, saveWorkflowNodeConfiguration } from '../../platform-client';

type Node = WorkflowNodeConfigurations['nodes'][number];
type Values = {
  title: string; description?: string; provider?: 'fixed_users' | 'app_role' | 'app_role_in_scope';
  users?: Array<{ value: string; label?: string }>; roleCodes?: string[]; mode?: Node['effective']['mode']; reason: string;
  operations?: WorkflowNodeConfigurationPatch['operations'];
};
const labels: Record<string, string> = { complete: '办理完成', approve: '同意', reject: '拒绝', save_form: '保存', return: '退回', transfer: '转交', delegate: '委托', add_assignee: '加签' };
const modes: Record<string, string> = { single: '单人审批', any: '或签：一人通过即可', all: '会签：全部通过', sequence: '依次审批' };
const modeDescriptions: Record<string, string> = { single: '只分派给一位审批人。', any: '任一审批人同意后，此节点完成。', all: '所有审批人同意后，此节点完成。', sequence: '按候选人顺序逐一处理。' };
const providers: Record<string, string> = { fixed_users: '指定人员', app_role: '应用角色', app_role_in_scope: '范围内的应用角色' };
const effect = '保存后，后续进入此节点的任务使用新配置。当前待办保留进入时的审批方式、人员、按钮和填写要求。';

function initialValues(node: Node, principals: WorkflowNodeConfigurations['principals']): Partial<Values> {
  return {
    title: node.effective.title, description: node.effective.description || '', mode: node.effective.mode || node.defaults.mode,
    provider: node.effective.binding?.provider as Values['provider'], roleCodes: node.effective.binding?.roleCodes || (node.effective.binding?.roleCode ? [node.effective.binding.roleCode] : []),
    users: (node.effective.binding?.users || []).map(value => ({ value, label: principals.users.find(person => person.value === value)?.label || '人员信息不可用' })),
    operations: Object.fromEntries((node.administration?.operations || []).map(operation => [operation, {
      enabled: node.effective.allowedOperations?.includes(operation) ?? true,
      label: node.effective.operationPolicy?.[operation]?.label || labels[operation],
      ...(operation !== 'save_form' ? { opinion: workflowOperationOpinion(operation, node.effective.operationPolicy?.[operation]) } : {}),
    }])),
  };
}

/** Shared editor: platform console and application pages use the same bounded SDK write. */
export function WorkflowNodeConfigurationEditor({ workflowCode, node: initialNode, principals: initialPrincipals, expectedHeadRevision, onClose, onSaved, presentation = 'drawer' }: {
  workflowCode: string; node: Node; principals: WorkflowNodeConfigurations['principals']; expectedHeadRevision: number;
  onClose: () => void; onSaved: (receipt: WorkflowNodeConfigurationReceipt) => void;
  presentation?: 'drawer' | 'panel';
}) {
  const { modal } = App.useApp();
  const [node, setNode] = useState(initialNode);
  const [principals, setPrincipals] = useState(initialPrincipals);
  const [form] = Form.useForm<Values>();
  const basis = useRef({ expectedHeadRevision, expectedRevision: initialNode.configuration.revision });
  const frozen = useRef<WorkflowNodeConfigurationMutation | null>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false), [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedChangesGuard({ when: dirty || busy || uncertain, preventNavigation: busy || uncertain, optionalProvider: true,
    message: uncertain ? '节点配置操作尚未确认，请先使用原请求核对结果。' : '节点配置尚未保存，离开将丢失草稿。' });
  useEffect(() => {
    if (!dirty && !busy && !uncertain) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, busy, uncertain]);
  const isCc = node.kind === 'cc';
  const selectedProvider = Form.useWatch('provider', form) || node.effective.binding?.provider;
  const binding = node.defaults.binding;
  const recipientMinimum = isCc ? binding?.min ?? 1 : node.effective.emptyPolicy === 'skip' ? 0 : 1;
  const recipientMaximum = isCc ? Math.min(binding?.max ?? WORKFLOW_AUTOMATIC_CC_DEFAULT_RECIPIENTS, WORKFLOW_AUTOMATIC_CC_MAX_RECIPIENTS) : 200;
  const allowedProviders = node.administration?.assigneeProviders || (!isCc && binding && providers[binding.provider] ? [binding.provider] : []);
  const close = () => {
    if (busy || uncertain) return;
    const finish = () => { guard.release(); onClose(); };
    if (form.isFieldsTouched()) modal.confirm({ title: '关闭节点配置？', content: '未保存的草稿将离开编辑器。', okText: '放弃草稿', cancelText: '继续编辑', onOk: finish });
    else finish();
  };
  const buildPatch = (values: Values): WorkflowNodeConfigurationPatch => {
    const patch = structuredClone(node.configuration.patch || {});
    if (form.isFieldTouched('title')) patch.title = values.title;
    if (form.isFieldTouched('description')) patch.description = values.description || '';
    if (form.isFieldTouched('mode')) patch.mode = values.mode;
    if ((['provider', 'users', 'roleCodes'] as const).some(name => form.isFieldTouched(name)) && allowedProviders.length) {
      patch.assignee = values.provider === 'fixed_users' ? { provider: 'fixed_users', users: (values.users || []).map(person => person.value) } : { provider: values.provider as 'app_role' | 'app_role_in_scope', ...(values.roleCodes?.length === 1 ? { roleCode: values.roleCodes[0]! } : { roleCodes: values.roleCodes || [] }) };
    }
    for (const operation of node.administration?.operations || []) {
      const changed: Record<string, unknown> = {};
      for (const key of ['enabled', 'label', 'opinion'] as const) if (form.isFieldTouched(['operations', operation, key])) changed[key] = values.operations?.[operation]?.[key];
      if (Object.keys(changed).length) {
        const policy = { ...patch.operations?.[operation], ...changed };
        if (changed.opinion !== undefined) { delete policy.commentRequired; delete policy.reasonRequired; }
        patch.operations = { ...patch.operations, [operation]: policy };
      }
    }
    return patch;
  };
  const save = async () => {
    if (!frozen.current) {
      let values: Values;
      try { values = await form.validateFields(); } catch (failure) {
        const first = (failure as { errorFields?: Array<{ name: Array<string | number> }> }).errorFields?.[0]?.name;
        if (first) form.scrollToField(first, { focus: true });
        return;
      }
      const patch = buildPatch(values);
      const errors = validateWorkflowNodeConfigurationPatch({
        kind: node.kind, mode: node.defaults.mode, administration: node.administration,
        allowedOperations: node.defaults.allowedOperations, requiredOperations: node.defaults.requiredOperations, taskPageCode: node.defaults.taskPageCode, operationPolicy: node.defaults.operationPolicy,
        fieldPolicy: node.defaults.fieldPolicy,
        completionDeadline: node.defaults.completionDeadline,
      }, binding, patch);
      if (errors.length) { setError(errors.join('；')); return; }
      frozen.current = { ...basis.current, patch, reason: values.reason, operationId: createBrowserUuid() };
    }
    setBusy(true); setError('');
    try {
      const receipt = await saveWorkflowNodeConfiguration(workflowCode, node.nodeId, frozen.current);
      guard.release();
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
      for (const key of ['title', 'description', 'mode', 'provider', 'users', 'roleCodes'] as const) if (!form.isFieldTouched(key)) form.setFieldValue(key, values[key]);
      for (const operation of latest.administration?.operations || []) for (const key of ['enabled', 'label', 'opinion'] as const) if (!form.isFieldTouched(['operations', operation, key])) form.setFieldValue(['operations', operation, key], values.operations?.[operation]?.[key]);
      basis.current = { expectedHeadRevision: context.headRevision, expectedRevision: latest.configuration.revision };
      setNode(latest); setPrincipals(configuration.principals); setConflict(false); frozen.current = null;
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  const footer = <div className="oxa-workflow-config-footer"><span>对后续节点生效</span><Space><Button disabled={busy || uncertain} onClick={close}>取消</Button><Button aria-label="保存节点配置" type="primary" loading={busy} disabled={conflict} onClick={() => void save()}>{uncertain ? '核对并重试' : '保存办理设置'}</Button></Space></div>;
  const content = <>
    <div className="oxa-workflow-config-context"><Typography.Title level={4}>{node.effective.title}</Typography.Title><Space wrap><Tag>{node.configuration.patch ? '后台覆盖' : '代码默认值'}</Tag><Tag>修订 {basis.current.expectedRevision}</Tag></Space></div>
    <Alert type="info" showIcon title="对后续进入的节点生效" description={isCc ? '后续进入使用新配置；已抄送的接收人和记录保留。' : effect} style={{ marginBottom: 16 }} />
    {error && <Alert type="error" showIcon title={conflict ? '配置已有新的修订，草稿已保留' : uncertain ? '操作结果未确认' : '配置未保存'} description={error} style={{ marginBottom: 16 }} />}
    {conflict && <Button onClick={() => void refreshKeepingDraft()} disabled={busy} style={{ marginBottom: 16 }}>载入最新配置并保留草稿</Button>}
    {uncertain && <Typography.Paragraph>正在核对本次保存结果。再次尝试将使用同一请求，避免重复修改。</Typography.Paragraph>}
    <Form form={form} layout="vertical" disabled={busy || uncertain} onValuesChange={() => setDirty(true)} scrollToFirstError={{ focus: true }} initialValues={initialValues(initialNode, initialPrincipals)}>
      <section className="oxa-workflow-config-section" aria-labelledby="workflow-node-basics">
        <h3 id="workflow-node-basics">名称与说明</h3>
        <Form.Item name="title" label="节点名称" rules={[{ required: true, whitespace: true }]}><Input maxLength={255} /></Form.Item>
        <Form.Item name="description" label="节点说明"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
      </section>
      {['approval', 'cc'].includes(node.kind) && <section className="oxa-workflow-config-section" aria-labelledby="workflow-node-people">
        <h3 id="workflow-node-people">{isCc ? '抄送人' : '审批人与方式'}</h3>
          <p className="oxa-workflow-config-help">{isCc ? '抄送来源由开发者开放；保存时校验人员、角色及范围。抄送只提供流程查阅权。' : '人员来源和可选审批方式由开发者开放；保存时平台校验人员、角色及范围。'}</p>
          {allowedProviders.length > 0 ? <>
            <Form.Item name="provider" label="人员来源" rules={[{ required: true }]}><Radio.Group className="oxa-workflow-provider-options" options={allowedProviders.map(value => ({ value, label: providers[value] }))} /></Form.Item>
            {selectedProvider === 'fixed_users' && <Form.Item name="users" label={isCc ? '指定抄送人' : '指定审批人'} extra={isCc ? `请选择 ${recipientMinimum} 至 ${recipientMaximum} 位抄送人，人数范围由流程代码确定。` : undefined} rules={[{ required: isCc || node.effective.emptyPolicy !== 'skip', type: 'array', min: recipientMinimum, max: recipientMaximum }]}><PlatformDirectoryPicker kind="user" multiple placeholder="从通讯录选择人员" /></Form.Item>}
            {['app_role', 'app_role_in_scope'].includes(selectedProvider || '') && <Form.Item name="roleCodes" label={isCc ? '抄送角色' : '审批角色'} rules={[{ required: true, type: 'array', min: 1, max: 8 }]} extra="可选 1–8 个角色；成员合并后去重。重复人员按选择顺序使用首个角色的代理规则。"><Select mode="multiple" maxCount={8} showSearch={{ optionFilterProp: 'label' }} options={principals.roles.map(role => ({ value: role.code, label: `${role.name}（${role.code}）` }))} /></Form.Item>}
          </> : <Alert type="info" title="人员来源由开发者维护" description="此节点未开放人员来源调整。" />}
          {binding?.scope && <p className="oxa-workflow-config-scope">范围来源：{binding.scope.dimension} · {binding.scope.valueFrom || binding.scope.value}<br />范围计算由流程代码维护。</p>}
          {!isCc && <p className="oxa-workflow-config-help">无审批人时：{node.effective.emptyPolicy === 'skip' ? '成功解析为空后自动跳过' : '阻塞，等待人员配置修复'}。此规则由流程代码确定。</p>}
          {!isCc && <p className="oxa-workflow-config-help">发起人参与审批：{node.effective.initiatorApprovalPolicy === 'auto_approve' ? '轮到发起人本人的直接审批席位时自动同意；代理、转交、加签和补正仍需人工办理' : '由本人手动办理'}。此规则由流程代码确定。</p>}
          {node.defaults.completionDeadline && <p className="oxa-workflow-config-help">{formatWorkflowCompletionDeadline(node.defaults.completionDeadline)}。期限由流程代码确定，补正仍需人工办理。</p>}
          {!isCc && (node.administration?.modes ? <Form.Item name="mode" label="审批方式" rules={[{ required: true }]}><Radio.Group className="oxa-workflow-mode-options" options={node.administration.modes.map(value => ({ value, label: <span><b>{modes[value]}</b><small>{modeDescriptions[value]}</small></span> }))} /></Form.Item> : <p className="oxa-workflow-config-help">审批方式：{modes[node.effective.mode || ''] || '由开发者维护'}</p>)}

      </section>}
      {(node.kind === 'approval' || node.kind === 'handle') && <section className="oxa-workflow-config-section" aria-labelledby="workflow-node-operations">
        <h3 id="workflow-node-operations">操作按钮</h3>
        <p className="oxa-workflow-config-help">同意用于推进流程，必须保留。其余操作可以在已开放的范围内调整；保存位于「更多」，只保存数据。</p>
        {node.administration?.operations?.length ? <table className="oxa-workflow-operation-table">
          <thead><tr><th scope="col">操作</th><th scope="col">启用</th><th scope="col">按钮文字</th><th scope="col">意见／原因</th></tr></thead>
          <tbody>{node.administration.operations.map(operation => {
            const required = operation === 'approve' || node.defaults.requiredOperations?.includes(operation);
            const minimum = workflowOperationMinimumOpinion(operation, node.defaults.operationPolicy?.[operation]);
            const opinionValues = ['none', 'optional', 'required'] as const;
            const automatic = operation === 'approve' && (node.effective.initiatorApprovalPolicy === 'auto_approve' || !!node.defaults.completionDeadline);
            return <tr key={operation}>
              <th scope="row">{labels[operation]}{operation === 'save_form' && <small>更多 · 不推进</small>}</th>
              <td><Form.Item name={['operations', operation, 'enabled']} valuePropName="checked" noStyle><Switch size="small" disabled={busy || uncertain || required} aria-label={`启用${labels[operation]}`} /></Form.Item>{required && <small>必须保留</small>}</td>
              <td><Form.Item name={['operations', operation, 'label']} rules={[{ required: true, whitespace: true, max: 40 }]}><Input maxLength={40} aria-label={`${labels[operation]}按钮文字`} /></Form.Item></td>
              <td>{operation === 'save_form' ? <span className="oxa-workflow-config-help">无需填写</span> : <Form.Item name={['operations', operation, 'opinion']} noStyle><Select aria-label={`${labels[operation]}意见要求`} options={opinionValues.map(value => ({ value, label: { none: '不显示', optional: '选填', required: '必填' }[value], disabled: opinionValues.indexOf(value) < opinionValues.indexOf(minimum) || automatic && value === 'required' }))} /></Form.Item>}</td>
            </tr>;
          })}</tbody>
        </table> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此节点的按钮由开发者维护" />}
      </section>}
      <div className="oxa-workflow-config-reason"><Form.Item name="reason" label="修改原因" rules={[{ required: true, whitespace: true }]} extra="将记录在配置修改历史中。"><Input.TextArea rows={2} maxLength={1000} placeholder="说明本次调整的原因" /></Form.Item></div>
    </Form>
  </>;
  return presentation === 'panel' ? <section className="oxa-workflow-config oxa-workflow-config-panel" aria-label="调整节点配置">
    <header className="oxa-workflow-config-panel-heading"><strong>节点配置</strong><Button aria-label="关闭节点配置" disabled={busy || uncertain} onClick={close}>关闭</Button></header>
    <div className="oxa-workflow-config-panel-body">{content}</div>{footer}
  </section> : <Drawer open title="调整节点配置" size={560} rootClassName="oxa-workflow-config" onClose={close} closable={!busy && !uncertain} mask={{ closable: !busy && !uncertain }} footer={footer}>{content}</Drawer>;
}
