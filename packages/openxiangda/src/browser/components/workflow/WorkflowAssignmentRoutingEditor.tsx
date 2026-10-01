import { useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, DatePicker, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { validateWorkflowAssignmentRoutingRules } from 'openxiangda-contracts/browser';
import type { WorkflowAssignmentRoutingConfiguration, WorkflowAssignmentRoutingMutation, WorkflowAssignmentRoutingReceipt, WorkflowAssignmentRoutingRule } from 'openxiangda-contracts/browser';
import { loadWorkflowAssignmentRoutingConfiguration, saveWorkflowAssignmentRoutingConfiguration } from '../../platform-client';

type RuleValues = Omit<WorkflowAssignmentRoutingRule, 'validFrom' | 'validTo'> & { lifetime?: [dayjs.Dayjs | null, dayjs.Dayjs | null] };
const errorText = (failure: unknown) => failure instanceof Error ? failure.message : '请求失败，请重试';

/** Shared rule maintenance on the existing application administration API. */
export function WorkflowAssignmentRoutingEditor({ configuration: initial, onClose, onSaved }: {
  configuration: WorkflowAssignmentRoutingConfiguration; onClose: () => void; onSaved: (receipt: WorkflowAssignmentRoutingReceipt) => void;
}) {
  const { modal } = App.useApp();
  const [configuration, setConfiguration] = useState(initial);
  const [rules, setRules] = useState(() => structuredClone(initial.rules));
  const [reason, setReason] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false), [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState<{ rule?: WorkflowAssignmentRoutingRule }>();
  const frozen = useRef<WorkflowAssignmentRoutingMutation | null>(null);
  const dirty = JSON.stringify(rules) !== JSON.stringify(configuration.rules) || reason.trim().length > 0;
  const blocked = busy || uncertain || reviewing;
  const policy = configuration.policy;
  const close = () => {
    if (busy || reviewing || editing) return;
    if (dirty || uncertain) modal.confirm({ title: '关闭路由维护？', content: uncertain ? '保存结果尚未确认，请记录原操作 ID，重试原请求或查询修改历史。' : '当前未保存的规则草稿将丢失。', okText: '关闭', cancelText: '继续编辑', onOk: onClose });
    else onClose();
  };
  const execute = async (mutation: WorkflowAssignmentRoutingMutation) => {
    setBusy(true); setError('');
    try { onSaved(await saveWorkflowAssignmentRoutingConfiguration(policy.policyCode, mutation)); }
    catch (failure) {
      const detail = failure as Error & { code?: string; status?: number };
      setError(errorText(failure));
      if (['WORKFLOW_V2_ROUTING_REVISION_CONFLICT', 'WORKFLOW_V2_ROUTING_HEAD_CHANGED'].includes(detail.code || '')) {
        setConflict(true); setUncertain(false); frozen.current = null;
      } else if (detail.status && detail.status >= 400 && detail.status < 500) { setUncertain(false); frozen.current = null; }
      else setUncertain(true);
    } finally { setBusy(false); }
  };
  const prepareSave = () => {
    if (busy || reviewing || editing || conflict) return;
    if (frozen.current) { void execute(frozen.current); return; }
    if (!reason.trim()) { setError('请填写本次规则调整的原因。'); return; }
    const diagnostics = validateWorkflowAssignmentRoutingRules(policy, rules);
    if (diagnostics.length) { setError(`规则未通过校验：${diagnostics.join('；')}`); return; }
    const previous = new Map(configuration.rules.map(rule => [rule.ruleCode, rule]));
    const changes = rules.flatMap(rule => {
      const before = previous.get(rule.ruleCode); previous.delete(rule.ruleCode);
      return JSON.stringify(before) === JSON.stringify(rule) ? [] : [{ key: rule.ruleCode, action: before ? '修改' : '新增', before: before ? describe(before, configuration) : '—', after: describe(rule, configuration) }];
    });
    changes.push(...[...previous.values()].map(rule => ({ key: rule.ruleCode, action: '删除', before: describe(rule, configuration), after: '—' })));
    if (!changes.length) { setError('规则没有变化。'); return; }
    const mutation: WorkflowAssignmentRoutingMutation = { expectedHeadRevision: configuration.headRevision, expectedRevision: configuration.revision,
      operationId: crypto.randomUUID(), reason: reason.trim(), rules: structuredClone(rules) };
    setReviewing(true);
    modal.confirm({ title: `核对 ${changes.length} 项规则变更`, width: 900, okText: '确认保存', cancelText: '继续编辑', mask: { closable: false },
      content: <><p>保存后影响未来进入的审批节点。当前待办与已选中的人员保持原快照。</p>
        <Table rowKey="key" size="small" dataSource={changes} pagination={{ pageSize: 6, showSizeChanger: false }} scroll={{ x: 600 }} columns={[
          { title: '变更', dataIndex: 'action', width: 64 }, { title: '保存前', dataIndex: 'before' }, { title: '保存后', dataIndex: 'after' },
        ]} /></>, onCancel: () => setReviewing(false), onOk: async () => { frozen.current = mutation; try { await execute(mutation); } finally { setReviewing(false); } },
    });
  };
  const refreshKeepingDraft = async () => {
    setBusy(true); setError('');
    try {
      const latest = await loadWorkflowAssignmentRoutingConfiguration(policy.policyCode);
      const diagnostics = validateWorkflowAssignmentRoutingRules(latest.policy, rules);
      setConfiguration(latest);
      if (diagnostics.length) { setError('代码许可已变化，当前草稿需要按最新维度和来源调整后才能保存。'); return; }
      setConflict(false); frozen.current = null;
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  return <Drawer open title="审批人路由维护" size={960} rootClassName="oxa-workflow-routing" onClose={close} closable={!busy && !reviewing && !editing} mask={{ closable: !busy && !reviewing && !editing }}
    footer={<div className="oxa-workflow-config-footer"><span>当前待办保留分派快照</span><Space><Button disabled={busy || reviewing || Boolean(editing)} onClick={close}>取消</Button><Button type="primary" loading={busy} disabled={conflict || reviewing || Boolean(editing)} onClick={prepareSave}>{uncertain ? '重试原操作' : '核对并保存规则'}</Button></Space></div>}>
    <Space wrap><Typography.Title level={4} style={{ margin: 0 }}>{policy.title}</Typography.Title><Tag>修订 {configuration.revision}</Tag><Tag>{policy.strategy === 'replace_only' ? '替换命中时不再追加' : '替换后继续追加'}</Tag></Space>
    <p className="oxa-workflow-config-help">规则选择审批人，流程分支及范围计算由代码维护。最高优先级替换必须唯一，通用与专项追加共同生效。</p>
    {error && <Alert showIcon type="error" title={conflict ? '已有新的修订，草稿已保留' : uncertain ? '保存结果未确认' : '规则未保存'} description={error} style={{ marginBottom: 16 }} />}
    {conflict && <Button disabled={busy} onClick={() => void refreshKeepingDraft()} style={{ marginBottom: 16 }}>载入最新规则并保留草稿</Button>}
    {uncertain && <Typography.Paragraph>重试沿用原操作 ID：<Typography.Text code>{frozen.current?.operationId}</Typography.Text></Typography.Paragraph>}
    <div className="oxa-workflow-routing-toolbar"><span>{rules.length} 条规则 · {configuration.references.filter(r => !r.pinned).length} 个当前审批节点引用</span><Button disabled={blocked || rules.length >= 256} onClick={() => setEditing({})}>新增规则</Button></div>
    <Table rowKey="ruleCode" size="small" dataSource={rules} scroll={{ x: 740 }} pagination={{ pageSize: 8, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有补充规则，将按代码默认来源分派" /> }} columns={[
      { title: '规则', width: 170, render: (_, rule: WorkflowAssignmentRoutingRule) => <><b>{rule.title}</b><div className="oxa-workflow-config-help">{rule.ruleCode} · {rule.enabled ? '启用' : '停用'}</div></> },
      { title: '匹配范围', render: (_, rule: WorkflowAssignmentRoutingRule) => <><div>{targetLabel(rule)}</div><small>{matchLabel(rule, configuration)}</small></> },
      { title: '选择方式', width: 145, render: (_, rule: WorkflowAssignmentRoutingRule) => <><Tag color={rule.effect === 'replace' ? 'orange' : 'blue'}>{rule.effect === 'replace' ? '替换' : '追加'}</Tag><div>{policy.sources[rule.sourceCode]?.title || rule.sourceCode}</div><small>优先级 {rule.priority}</small></> },
      { title: '有效期', width: 160, render: (_, rule: WorkflowAssignmentRoutingRule) => <small>{rule.validFrom ? dayjs(rule.validFrom).format('YYYY-MM-DD HH:mm') : '立即'} 至 {rule.validTo ? dayjs(rule.validTo).format('YYYY-MM-DD HH:mm') : '长期'}</small> },
      { title: '操作', width: 105, render: (_, rule: WorkflowAssignmentRoutingRule) => <Space><Button type="link" size="small" disabled={blocked} onClick={() => setEditing({ rule })}>编辑</Button><Popconfirm title={`删除“${rule.title}”规则？`} description="核对并保存后生效，当前任务保持快照。" onConfirm={() => setRules(previous => previous.filter(r => r.ruleCode !== rule.ruleCode))} disabled={blocked}><Button type="link" danger size="small" disabled={blocked}>删除</Button></Popconfirm></Space> },
    ]} />
    <details className="oxa-workflow-routing-definition"><summary>查看代码开放的匹配维度与角色来源</summary>
      {Object.entries(policy.dimensions).map(([code, dimension]) => <p key={code}><b>{dimension.title}</b> · 从申请事实 {dimension.valueFrom} 读取。</p>)}
      {Object.entries(policy.sources).map(([code, source]) => <p key={code}><b>{source.title}</b> · {source.provider === 'app_role_in_scope' ? '范围内角色' : '应用角色'} {source.roleCode}{source.scope ? `，范围 ${source.scope.dimension} 来自 ${source.scope.valueFrom || source.scope.value}` : ''}。</p>)}
    </details>
    <div className="oxa-workflow-config-reason"><label htmlFor="oxa-routing-reason">修改原因</label><Input.TextArea id="oxa-routing-reason" value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={1000} disabled={blocked} placeholder="说明本次规则调整的原因" /></div>
    {editing && <RuleDialog configuration={configuration} initial={editing.rule} rules={rules} onClose={() => setEditing(undefined)} onSave={rule => { setRules(previous => editing.rule ? previous.map(item => item.ruleCode === editing.rule!.ruleCode ? rule : item) : [...previous, rule]); setEditing(undefined); setError(''); }} />}
  </Drawer>;
}

function RuleDialog({ configuration, initial, rules, onClose, onSave }: { configuration: WorkflowAssignmentRoutingConfiguration; initial?: WorkflowAssignmentRoutingRule; rules: WorkflowAssignmentRoutingRule[]; onClose: () => void; onSave: (rule: WorkflowAssignmentRoutingRule) => void }) {
  const { modal } = App.useApp();
  const [form] = Form.useForm<RuleValues>();
  const workflow = Form.useWatch('workflowCode', form);
  const [error, setError] = useState('');
  const policy = configuration.policy;
  const workflowOptions = [...new Set(configuration.references.map(r => r.workflowCode))].map(code => ({ value: code, label: code }));
  const nodeOptions = [...new Set(configuration.references.filter(r => r.workflowCode === workflow).map(r => r.nodeId))].map(value => ({ value, label: value }));
  const close = () => {
    if (form.isFieldsTouched()) modal.confirm({ title: '放弃这条规则的修改？', content: '这条规则尚未加入整组草稿。', okText: '放弃修改', cancelText: '继续编辑', onOk: onClose });
    else onClose();
  };
  const save = async () => {
    let values: RuleValues;
    try { values = await form.validateFields(); } catch { return; }
    const { lifetime, ...rest } = values;
    const rule: WorkflowAssignmentRoutingRule = { ruleCode: rest.ruleCode, title: rest.title, enabled: rest.enabled, priority: rest.priority,
      sourceCode: rest.sourceCode, effect: rest.effect,
      matches: Object.fromEntries(Object.entries(rest.matches || {}).filter(([, values]) => values?.length)),
      ...(rest.workflowCode ? { workflowCode: rest.workflowCode, ...(rest.nodeId ? { nodeId: rest.nodeId } : {}) } : {}),
      ...(lifetime?.[0] ? { validFrom: lifetime[0].toISOString() } : {}), ...(lifetime?.[1] ? { validTo: lifetime[1].toISOString() } : {}),
    };
    if (!initial && rules.some(item => item.ruleCode === rule.ruleCode)) { setError('规则代码已使用，请换一个稳定代码。'); return; }
    const errors = validateWorkflowAssignmentRoutingRules(policy, [rule]);
    if (errors.length) { setError('请检查匹配值、有效期及代码开放的来源。'); return; }
    onSave(rule);
  };
  return <Modal open title={initial ? '编辑规则' : '新增规则'} width={600} onCancel={close} onOk={() => void save()} okText="加入规则草稿" cancelText="取消" mask={{ closable: false }}>
    <p className="oxa-workflow-config-help">此处先加入草稿，核对全部变更并保存后才生效。</p>
    {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
    <Form layout="vertical" form={form} initialValues={initial ? { ...initial, lifetime: [initial.validFrom ? dayjs(initial.validFrom) : null, initial.validTo ? dayjs(initial.validTo) : null] } : { enabled: true, priority: 0, effect: 'append', matches: {} }}>
      <div className="oxa-workflow-routing-form-row"><Form.Item name="title" label="规则名称" rules={[{ required: true, whitespace: true, max: 128 }]}><Input /></Form.Item><Form.Item name="ruleCode" label="稳定代码" rules={[{ required: true, pattern: /^[a-z][a-z0-9_-]{0,127}$/, message: '使用小写字母、数字、短横线或下划线' }]}><Input disabled={Boolean(initial)} maxLength={128} placeholder="例如 extra-review" /></Form.Item></div>
      <div className="oxa-workflow-routing-form-row"><Form.Item name="effect" label="选择方式" rules={[{ required: true }]}><Select options={[{ value: 'append', label: '追加到当前审批人' }, { value: 'replace', label: '替换默认审批人' }]} /></Form.Item><Form.Item name="sourceCode" label="审批人来源" rules={[{ required: true }]}><Select options={Object.entries(policy.sources).map(([value, source]) => ({ value, label: source.title }))} /></Form.Item></div>
      <div className="oxa-workflow-routing-form-row"><Form.Item name="workflowCode" label="适用流程"><Select allowClear placeholder="所有引用此策略的流程" options={workflowOptions} onChange={() => form.setFieldValue('nodeId', undefined)} /></Form.Item><Form.Item name="nodeId" label="适用审批节点"><Select allowClear disabled={!workflow} options={nodeOptions} placeholder="该流程的所有引用节点" /></Form.Item></div>
      {Object.entries(policy.dimensions).map(([code, dimension]) => <Form.Item key={code} name={['matches', code]} label={`${dimension.title}匹配值`} extra="留空表示不限；多个值匹配任意一个，不同维度须同时满足。"><Select mode="tags" maxCount={64} tokenSeparators={[',', '，']} placeholder={`输入${dimension.title}的业务值`} /></Form.Item>)}
      <Form.Item name="lifetime" label="生效时间"><DatePicker.RangePicker showTime allowEmpty={[true, true]} style={{ width: '100%' }} placeholder={['立即生效', '长期有效']} /></Form.Item>
      <Space size="large"><Form.Item name="priority" label="优先级" rules={[{ required: true }]}><InputNumber min={-1000} max={1000} precision={0} /></Form.Item><Form.Item name="enabled" valuePropName="checked"><Checkbox>启用规则</Checkbox></Form.Item></Space>
    </Form>
  </Modal>;
}

function targetLabel(rule: WorkflowAssignmentRoutingRule) {
  return rule.workflowCode ? `${rule.workflowCode}${rule.nodeId ? ` / ${rule.nodeId}` : ' / 全部引用节点'}` : '所有引用此策略的流程';
}
function matchLabel(rule: WorkflowAssignmentRoutingRule, configuration: WorkflowAssignmentRoutingConfiguration) {
  return Object.entries(rule.matches).map(([code, values]) => `${configuration.policy.dimensions[code]?.title || code} = ${values.join(' 或 ')}`).join('；') || '不限匹配值';
}
function describe(rule: WorkflowAssignmentRoutingRule, configuration: WorkflowAssignmentRoutingConfiguration) {
  return `${rule.enabled ? '启用' : '停用'} · ${rule.title} · ${targetLabel(rule)} · ${matchLabel(rule, configuration)} → ${rule.effect === 'replace' ? '替换' : '追加'} ${configuration.policy.sources[rule.sourceCode]?.title || rule.sourceCode} · 优先级 ${rule.priority}${rule.validFrom ? ` · 开始 ${rule.validFrom}` : ''}${rule.validTo ? ` · 结束 ${rule.validTo}` : ''}`;
}
