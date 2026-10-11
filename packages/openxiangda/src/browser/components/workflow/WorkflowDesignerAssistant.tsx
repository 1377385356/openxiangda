import { useEffect,useMemo,useRef,useState } from 'react';
import { Alert,Button,Drawer,Input,Space,Spin,Table } from 'antd';
import { projectWorkflowGraph,type WorkflowDesignerDraft } from 'openxiangda-contracts/browser';
import { OpenXiangdaPlatformRequestError,requestWorkflowDesignerProposal,loadWorkflowDesignerProposal,applyWorkflowDesignerProposal,cancelWorkflowDesignerProposal,type WorkflowDesignerAiProposal } from '../../platform-client';
import { createBrowserUuid } from '../../uuid';
import { WorkflowDiagram } from './WorkflowDiagram';
const fieldLabels: Record<string,string> = { title: '节点名称',branches: '条件分支',otherwise: '其他情况',onApprove: '同意后的路径',onReject: '拒绝后的路径',returnTargets: '退回目标',next: '后续节点',mode: '处理方式',binding: '人员规则',allowedOperations: '操作按钮',operationPolicy: '操作要求',taskPageCode: '节点页面' };
const states: Record<string,string> = { pending: '正在生成方案',queued: '等待处理',running: '正在生成方案',ready: '方案已生成',stale: '草稿已改变，请重新生成方案',applied: '方案已应用到共享草稿',cancelled: '生成已停止',dismissed: '方案已放弃',failed: '方案生成失败',cancel_requested: '正在停止生成' };
export function WorkflowDesignerAssistant({ workflowCode,draft,open,canApply,onClose,onApplied,onStateChange }: { workflowCode: string;draft: WorkflowDesignerDraft;open: boolean;canApply: boolean;onClose: () => void;onApplied: (draft: WorkflowDesignerDraft) => void;onStateChange: (state: { busy: boolean;unknown: boolean }) => void }) {
  const [prompt,setPrompt] = useState('');
  const [proposal,setProposal] = useState<WorkflowDesignerAiProposal>();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string>();
  const [selected,setSelected] = useState('');
  const frozen = useRef<(() => Promise<void>) | undefined>(undefined);
  const graph = useMemo(() => proposal?.definition ? projectWorkflowGraph(proposal.definition,'proposal') : undefined,[proposal?.definition]);
  useEffect(() => { onStateChange({ busy,unknown: !!frozen.current }); },[busy,onStateChange]);
  useEffect(() => {
    if (!open || !proposal || !['pending','queued','running','cancel_requested'].includes(proposal.status)) return;
    let active = true;
    const poll = setInterval(() => { void loadWorkflowDesignerProposal(workflowCode,proposal.proposalId).then(value => { if (active) { setProposal(value);setSelected(value.definition?.startAt || ''); } },failure => { if (active) setError(String(failure.message)); }); },2000);
    return () => { active = false;clearInterval(poll); };
  },[workflowCode,open,proposal?.proposalId,proposal?.status]);
  const execute = async () => {
    if (!frozen.current) return;setBusy(true);
    try { await frozen.current();frozen.current = undefined;setError(undefined); }
    catch (failure) {
      if (failure instanceof OpenXiangdaPlatformRequestError && failure.status < 500) frozen.current = undefined;
      setError(failure instanceof OpenXiangdaPlatformRequestError && ['WORKFLOW_DESIGNER_AI_NOT_CONFIGURED','AGENT_UNCONFIGURED'].includes(failure.code) ? '平台 AI 助手尚未配置可用的模型连接或执行服务。' : `${String((failure as Error).message)}${frozen.current ? '。结果待确认，请重试原请求。' : '。当前草稿保持不变。'}`);
    } finally { setBusy(false); }
  };
  const generate = async () => {
    if (busy || frozen.current || !prompt.trim()) return;
    const input = { expectedRevision: draft.revision,operationId: createBrowserUuid(),prompt: prompt.trim() };
    frozen.current = async () => { setProposal(await requestWorkflowDesignerProposal(workflowCode,input)); };await execute();
  };
  const apply = async () => {
    if (!proposal || !canApply || busy || frozen.current) return;
    const proposalId = proposal.proposalId,input = { operationId: createBrowserUuid() };
    frozen.current = async () => { const result = await applyWorkflowDesignerProposal(workflowCode,proposalId,input);onApplied(result);setProposal(current => current ? { ...current,status: 'applied' } : current); };await execute();
  };
  const cancel = async () => {
    if (!proposal || busy || frozen.current) return;
    const proposalId = proposal.proposalId;
    frozen.current = async () => { await cancelWorkflowDesignerProposal(workflowCode,proposalId);setProposal(current => current ? { ...current,status: 'dismissed' } : current); };await execute();
  };
  return <Drawer title="AI 助手" open={open} width={560} onClose={() => { if (!busy && !frozen.current) onClose(); }} destroyOnHidden={false}>
    <p>描述需要怎样修改流程。助手会提出方案，确认后应用到共享草稿。</p>
    <Input.TextArea aria-label="流程修改需求" value={prompt} maxLength={2000} rows={4} disabled={busy || !!frozen.current} placeholder="例如：申请金额超过 5 万元时，在财务审查后增加总经理审批；其他情况直接继续。" onChange={event => setPrompt(event.target.value)} />
    <Space style={{ margin: '12px 0' }}><Button type="primary" onClick={() => void generate()} disabled={busy || !!frozen.current || !prompt.trim() || !!proposal && ['pending','queued','running','cancel_requested'].includes(proposal.status)}>生成修改方案</Button>{proposal && !['applied','dismissed','cancelled'].includes(proposal.status) && <Button onClick={() => void cancel()} disabled={busy || !!frozen.current}>放弃方案</Button>}</Space>
    {error && <Alert type="error" title={error} action={frozen.current ? <Button onClick={() => void execute()}>重试原请求</Button> : undefined} />}
    {proposal && <Alert style={{ marginBottom: 16 }} type={['stale','failed'].includes(proposal.status) ? 'warning' : 'info'} title={states[proposal.status] || '等待处理'} description={proposal.error} />}
    <Spin spinning={busy}>{proposal?.summary && <p>{proposal.summary}</p>}{proposal?.changes && <Table rowKey={item => `${item.kind}:${item.nodeTitle}`} size="small" pagination={false} dataSource={proposal.changes} columns={[{ title: '节点',dataIndex: 'nodeTitle' },{ title: '改动',render: (_,item) => `${{ added: '新增',removed: '删除',modified: '修改' }[item.kind] || '修改'}${item.fields.length ? `：${item.fields.map(field => fieldLabels[field] || '配置').join('、')}` : ''}` }]} />}
      {graph && <WorkflowDiagram graph={graph} selectedNodeId={selected || graph.startAt} onSelectNode={setSelected} />}
      {proposal?.status === 'ready' && <><p>应用后仍需按正常发布步骤检查并启用流程。需要新增代码能力时，由开发者先发布对应业务步骤。</p>{!canApply && <Alert type="warning" title="当前还有本地修改，请先保存或撤销，再应用此方案。" />}<Button block type="primary" disabled={!canApply || busy || !!frozen.current || !proposal.changes?.length} onClick={() => void apply()}>确认并应用到草稿</Button></>}
    </Spin>
  </Drawer>;
}
