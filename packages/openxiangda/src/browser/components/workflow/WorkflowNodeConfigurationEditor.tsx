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
const labels: Record<string, string> = { complete: '办理完成', approve: '同意', reject: '拒绝申请', save_form: '保存', return: '退回', transfer: '转交', delegate: '委托', add_assignee: '加签' };
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
export function WorkflowNodeConfigurationEditor({ workflowCode, node: initialNode, principals: initialPrincipals, expectedHeadRevision, onClose, onSaved, presentation = 'drawer', readOnly = false, onStateChange, onLeaveGuardChange }: {
  workflowCode: string; node: Node; principals: WorkflowNodeConfigurations['principals']; expectedHeadRevision: number;
  onClose: () => void; onSaved: (receipt: WorkflowNodeConfigurationReceipt) => void;
  presentation?: 'drawer' | 'panel' | 'inline'; readOnly?: boolean;
  onStateChange?: (state: { dirty: boolean; busy: boolean; unknown: boolean }) => void;
  onLeaveGuardChange?: (guard: ((next: () => void) => void) | undefined) => void;
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
  const selectedMode = Form.useWatch('mode', form) || node.effective.mode || 'single';
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
      setDirty(false); frozen.current = null; setUncertain(false);
      onSaved(receipt);
      return true;
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
  const inline = presentation === 'inline';
  const requestLeave = (next: () => void) => {
    if (busy || uncertain) return;
    if (!dirty) { next(); return; }
    const dialog = modal.confirm({
      title: '办理设置有未保存的修改', content: '保存后，后续进入此节点的任务使用新设置。',
      okText: '保存并继续', cancelText: '继续编辑',
      onOk: async () => { if (await save()) next(); else throw new Error('请修正办理设置后再保存'); },
      footer: (_, { OkBtn, CancelBtn }) => <Space><Button onClick={() => { dialog.destroy(); guard.release(); next(); }}>放弃修改</Button><CancelBtn /><OkBtn /></Space>,
    });
  };
  useEffect(() => { onStateChange?.({ dirty, busy, unknown: uncertain }); }, [dirty, busy, uncertain, onStateChange]);
  useEffect(() => () => onStateChange?.({ dirty: false, busy: false, unknown: false }), [onStateChange]);
  useEffect(() => {
    onLeaveGuardChange?.(requestLeave);
    return () => onLeaveGuardChange?.(undefined);
  }, [dirty, busy, uncertain, onLeaveGuardChange]);
  const footer = <div className="oxa-workflow-config-footer">
    <span>{dirty ? '有未保存的修改' : '当前办理中的任务保持原设置'}</span>
    <Space>{!inline && <Button disabled={busy || uncertain} onClick={close}>取消</Button>}
      <Button aria-label="保存办理设置" type={dirty || !inline ? 'primary' : 'default'} loading={busy} disabled={readOnly || conflict || !dirty && !uncertain} onClick={() => void save()}>{uncertain ? '重试原保存请求' : '保存办理设置'}</Button>
    </Space>
  </div>;
  const isHuman = node.kind === 'approval' || node.kind === 'handle';
  const operationNames = node.administration?.operations || [];
  const operationRows = [...new Set([...(node.kind === 'handle' ? ['complete'] : ['approve']), ...operationNames])]
    .filter(operation => operationNames.includes(operation as any));
  const content = <>
    {!inline && <div className="oxa-workflow-config-context"><Typography.Title level={4}>{node.effective.title}</Typography.Title><Tag>{node.configuration.patch ? '已调整' : '默认设置'}</Tag></div>}
    <div className="oxa-designer-handling-notice">办理设置 · 保存后对后续进入的任务生效</div>
    {error && <Alert type="error" showIcon title={conflict ? '设置已被他人修改，你的输入已保留' : uncertain ? '操作结果待确认' : '办理设置未保存'} description={error} />}
    {conflict && <Button onClick={() => void refreshKeepingDraft()} disabled={busy}>载入最新设置并保留输入</Button>}
    <Form form={form} layout="vertical" disabled={readOnly || busy || uncertain} onValuesChange={() => setDirty(true)} scrollToFirstError={{ focus: true }} initialValues={initialValues(initialNode, initialPrincipals)}>
      {!inline && <section className="oxa-workflow-config-section">
        <Form.Item name="title" label="节点名称" rules={[{ required: true, whitespace: true }]}><Input maxLength={255} /></Form.Item>
        <Form.Item name="description" label="节点说明"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
      </section>}
      {(isHuman || isCc) && <section className="oxa-workflow-config-section" aria-label={isCc ? '抄送人' : node.kind === 'handle' ? '办理人' : '审批人'}>
        <h3>{isCc ? '抄送人' : node.kind === 'handle' ? '办理人' : '审批人'}</h3>
        {allowedProviders.length > 0 ? <>
          <Form.Item name="provider" className="oxa-workflow-provider-field" rules={[{ required: true }]}><Radio.Group optionType="button" buttonStyle="outline" className="oxa-workflow-provider-options" options={allowedProviders.map(value => ({ value, label: providers[value] }))} /></Form.Item>
          {selectedProvider === 'fixed_users' && <Form.Item name="users" rules={[{ required: isCc || node.effective.emptyPolicy !== 'skip', type: 'array', min: recipientMinimum, max: recipientMaximum }]}><PlatformDirectoryPicker kind="user" multiple placeholder="从通讯录选择人员" /></Form.Item>}
          {['app_role', 'app_role_in_scope'].includes(selectedProvider || '') && <Form.Item name="roleCodes" rules={[{ required: true, type: 'array', min: 1, max: 8 }]}><Select aria-label={isCc ? '抄送角色' : '审批角色'} mode="multiple" maxCount={8} showSearch={{ optionFilterProp: 'label' }} options={principals.roles.map(role => ({ value: role.code, label: role.name }))} placeholder="选择应用角色" /></Form.Item>}
        </> : <p className="oxa-workflow-config-help">当前人员规则由应用维护。</p>}
        {binding?.scope && <p className="oxa-workflow-config-help">人员范围由应用规则限定。</p>}
        {isHuman && (node.administration?.modes ? <>
          <Form.Item name="mode" label={node.kind === 'handle' ? '多人办理方式' : '多人审批方式'} rules={[{ required: true }]}>
            <Radio.Group className="oxa-workflow-mode-options" options={node.administration.modes.map(value => ({ value, label: ({ single: '单人', any: '或签', all: '会签', sequence: '依次审批' } as Record<string, string>)[value] }))} />
          </Form.Item>
          <p className="oxa-workflow-config-help">{modeDescriptions[selectedMode]}{node.kind === 'approval' ? '任何一人拒绝后，本节点结束并按拒绝路径处理。' : ''}</p>
        </> : <p className="oxa-workflow-config-help">办理方式：{modes[node.effective.mode || ''] || '按应用规则处理'}</p>)}
      </section>}
      {isHuman && <section className="oxa-workflow-config-section" aria-label="审批操作">
        <h3>{node.kind === 'handle' ? '办理操作' : '审批操作'}</h3>
        {operationRows.length ? <div className="oxa-workflow-operation-scroll"><table className="oxa-workflow-operation-table">
          <thead><tr><th scope="col">操作</th><th scope="col">显示名称</th><th scope="col">意见</th><th scope="col">启用</th></tr></thead>
          <tbody>{operationRows.map(operation => {
            const required = operation === 'approve' || operation === 'complete' || node.defaults.requiredOperations?.includes(operation as any);
            const minimum = workflowOperationMinimumOpinion(operation, node.defaults.operationPolicy?.[operation as keyof NonNullable<Node['defaults']['operationPolicy']>]);
            const opinionValues = ['none', 'optional', 'required'] as const;
            const automatic = operation === 'approve' && (node.effective.initiatorApprovalPolicy === 'auto_approve' || !!node.defaults.completionDeadline);
            return <tr key={operation}>
              <th scope="row">{labels[operation]}{operation === 'save_form' && <small>更多 · 不推进流程</small>}</th>
              <td><Form.Item name={['operations', operation, 'label']} rules={[{ required: true, whitespace: true, max: 40 }]}><Input variant="borderless" maxLength={40} aria-label={`${labels[operation]}按钮文字`} /></Form.Item></td>
              <td>{operation === 'save_form' ? <span className="oxa-workflow-config-help">—</span> : <><Form.Item name={['operations', operation, 'opinion']} noStyle><Select variant="borderless" aria-label={`${labels[operation]}意见要求`} options={opinionValues.map(value => ({ value, label: { none: '不填写', optional: '选填', required: '必填' }[value], disabled: opinionValues.indexOf(value) < opinionValues.indexOf(minimum) || automatic && value === 'required' }))} /></Form.Item>{minimum === 'required' && <small>应用要求必填</small>}</>}</td>
              <td><Form.Item name={['operations', operation, 'enabled']} valuePropName="checked" noStyle><Switch size="small" disabled={readOnly || busy || uncertain || required} aria-label={`启用${labels[operation]}`} /></Form.Item>{required && <small>流程推进所需</small>}</td>
            </tr>;
          })}</tbody>
        </table></div> : <p className="oxa-workflow-config-help">按钮按应用规则提供。</p>}
        <p className="oxa-workflow-config-help">保存显示在审批页的「更多」中，只写入申请数据，不完成任务。</p>
      </section>}
      {(!inline || dirty) && <div className="oxa-workflow-config-reason"><Form.Item name="reason" label="修改说明" rules={[{ required: true, whitespace: true }]}><Input maxLength={1000} placeholder="说明本次办理设置的调整" /></Form.Item></div>}
    </Form>
  </>;
  return inline ? <section className="oxa-workflow-config oxa-workflow-config-inline" aria-label="办理设置">{content}{!readOnly && footer}</section> : presentation === 'panel' ? <section className="oxa-workflow-config oxa-workflow-config-panel" aria-label="调整节点配置">
    <header className="oxa-workflow-config-panel-heading"><strong>节点配置</strong><Button aria-label="关闭节点配置" disabled={busy || uncertain} onClick={close}>关闭</Button></header>
    <div className="oxa-workflow-config-panel-body">{content}</div>{footer}
  </section> : <Drawer open title="调整节点配置" size={560} rootClassName="oxa-workflow-config" onClose={close} closable={!busy && !uncertain} mask={{ closable: !busy && !uncertain }} footer={footer}>{content}</Drawer>;
}
