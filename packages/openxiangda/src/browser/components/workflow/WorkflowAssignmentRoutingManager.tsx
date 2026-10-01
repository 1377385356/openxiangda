import { useEffect, useState } from 'react';
import { Alert, App, Button, Drawer, Empty, Input, Space, Table, Tag } from 'antd';
import type { WorkflowAssignmentRoutingCatalog, WorkflowAssignmentRoutingConfiguration, WorkflowAssignmentRoutingHistory } from 'openxiangda-contracts/browser';
import { loadWorkflowAssignmentRoutingCatalog, loadWorkflowAssignmentRoutingConfiguration, loadWorkflowAssignmentRoutingHistory } from '../../platform-client';
import { WorkflowAssignmentRoutingEditor } from './WorkflowAssignmentRoutingEditor';

/** Embeddable administration page. Permissions, scope and revisions come from the platform. */
export function WorkflowAssignmentRoutingManager() {
  const { message } = App.useApp();
  const [page, setPage] = useState(1), [keyword, setKeyword] = useState(''), [search, setSearch] = useState(''), [attempt, setAttempt] = useState(0);
  const [catalog, setCatalog] = useState<WorkflowAssignmentRoutingCatalog>();
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [opening, setOpening] = useState('');
  const [editing, setEditing] = useState<WorkflowAssignmentRoutingConfiguration>();
  const [history, setHistory] = useState<{ policyCode: string; title: string }>();
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void loadWorkflowAssignmentRoutingCatalog({ keyword: search, limit: 20, offset: (page - 1) * 20 }).then(result => {
      if (active) setCatalog(result);
    }).catch(failure => { if (active) setError(errorText(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, attempt]);
  const open = async (policyCode: string) => {
    setOpening(policyCode); setError('');
    try { setEditing(await loadWorkflowAssignmentRoutingConfiguration(policyCode)); }
    catch (failure) { setError(errorText(failure)); } finally { setOpening(''); }
  };
  const blocked = Boolean(editing || opening);
  return <div className="oxa-workflow-routing-manager">
    <div className="oxa-workflow-routing-toolbar"><Input.Search aria-label="搜索审批人路由策略" placeholder="搜索策略名称或代码" value={keyword} disabled={blocked} allowClear style={{ maxWidth: 340 }}
      onChange={event => setKeyword(event.target.value)} onSearch={value => { setSearch(value.trim()); setPage(1); }} />
      <Button disabled={blocked} onClick={() => setAttempt(value => value + 1)}>刷新策略</Button></div>
    <p className="oxa-workflow-config-help">流程代码开放匹配维度与角色来源，在这里维护通用和专项规则。人员成员通过角色管理维护。</p>
    {error && <Alert type="error" showIcon title="路由读取失败" description={error} action={<Button disabled={blocked} onClick={() => setAttempt(value => value + 1)}>重试</Button>} style={{ marginBottom: 16 }} />}
    <Table rowKey="policyCode" size="small" loading={loading} dataSource={catalog?.items} scroll={{ x: 660 }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前代码尚未声明审批人路由策略" /> }}
      pagination={{ current: page, pageSize: 20, showSizeChanger: false, total: catalog?.total, onChange: setPage, disabled: blocked }} columns={[
        { title: '路由策略', render: (_, item) => <><b>{item.title}</b><div className="oxa-workflow-config-help">{item.policyCode}</div></> },
        { title: '规则数', dataIndex: 'ruleCount', width: 90 }, { title: '引用节点', dataIndex: 'referenceCount', width: 100 },
        { title: '当前修订', render: (_, item) => <Tag>{item.revision ? `r${item.revision}` : '代码默认'}</Tag>, width: 100 },
        { title: '操作', width: 180, render: (_, item) => <Space><Button type="link" size="small" disabled={blocked} loading={opening === item.policyCode} onClick={() => void open(item.policyCode)}>维护规则</Button>
          <Button type="link" size="small" disabled={blocked} onClick={() => setHistory(item)}>修改历史</Button></Space> },
      ]} />
    {editing && <WorkflowAssignmentRoutingEditor key={editing.policy.policyCode} configuration={editing} onClose={() => setEditing(undefined)} onSaved={receipt => {
      setEditing(undefined); setAttempt(value => value + 1); void message.success(`规则已保存为修订 ${receipt.revision}，未来进入节点生效`);
    }} />}
    {history && <RoutingHistory policy={history} onClose={() => setHistory(undefined)} />}
  </div>;
}

function RoutingHistory({ policy, onClose }: { policy: { policyCode: string; title: string }; onClose: () => void }) {
  const [page, setPage] = useState(1), [attempt, setAttempt] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [history, setHistory] = useState<WorkflowAssignmentRoutingHistory>();
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void loadWorkflowAssignmentRoutingHistory(policy.policyCode, { limit: 10, offset: (page - 1) * 10 }).then(result => { if (active) setHistory(result); })
      .catch(failure => { if (active) setError(errorText(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [policy.policyCode, page, attempt]);
  return <Drawer open title={`${policy.title} · 修改历史`} size={840} onClose={onClose}>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => setAttempt(value => value + 1)}>重试</Button>} />}
    <Table rowKey="id" size="small" loading={loading} dataSource={history?.items} scroll={{ x: 640 }}
      pagination={{ current: page, pageSize: 10, showSizeChanger: false, total: history?.total, onChange: setPage }} columns={[
        { title: '修订', dataIndex: 'revision', width: 65 }, { title: '时间', dataIndex: 'createdAt', render: value => new Date(value).toLocaleString(), width: 170 },
        { title: '操作人', dataIndex: 'actorUserId', ellipsis: true }, { title: '修改原因', dataIndex: 'reason' },
        { title: '规则变化', render: (_, item) => `${item.before.rules.length} → ${item.after.rules.length}`, width: 100 },
      ]} expandable={{ expandedRowRender: item => <div><p>修改前</p><RuleSummary rules={item.before.rules} /><p>修改后</p><RuleSummary rules={item.after.rules} /></div> }} />
  </Drawer>;
}

function RuleSummary({ rules }: { rules: WorkflowAssignmentRoutingConfiguration['rules'] }) {
  return rules.length ? <ul>{rules.map(rule => <li key={rule.ruleCode}>{rule.title}（{rule.ruleCode}） · {rule.enabled ? '启用' : '停用'} · {rule.workflowCode || '全部引用流程'}{rule.nodeId ? ` / ${rule.nodeId}` : ''} · {Object.entries(rule.matches).map(([code, values]) => `${code}=${values.join('或')}`).join('；') || '不限匹配值'} · {rule.effect === 'append' ? '追加' : '替换'} {rule.sourceCode} · 优先级 {rule.priority}{rule.validFrom ? ` · 从 ${rule.validFrom}` : ''}{rule.validTo ? ` · 至 ${rule.validTo}` : ''}</li>)}</ul> : <p>没有路由补充规则，使用代码默认来源。</p>;
}
function errorText(failure: unknown) { return failure instanceof Error ? failure.message : '请求失败，请重试'; }
