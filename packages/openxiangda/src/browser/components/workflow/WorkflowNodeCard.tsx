import type { Ref } from 'react';
import { BranchesOutlined, CheckCircleOutlined, CodeOutlined, CopyOutlined, UserOutlined } from '@ant-design/icons';
import type { WorkflowGraphProjection, WorkflowGraphVisit } from 'openxiangda-contracts/browser';

export const workflowNodeModes: Record<string, string> = { single: '单人审批', any: '或签 · 任一人通过', all: '会签 · 全部通过', sequence: '依次审批' };
const kinds: Record<string, string> = { approval: '审批', condition: '条件分支', end: '结束', cc: '抄送', action: '业务步骤' };
const statuses: Record<string, string> = { active: '处理中', waiting: '等待中', completed: '已完成', approved: '已同意', rejected: '已拒绝', error: '异常', cancelled: '已取消', returned: '已退回', running: '处理中' };
const outcomes: Record<string, string> = { approved: '审批通过', rejected: '审批拒绝', terminated: '流程终止', withdrawn: '已撤回' };
const icons = { approval: UserOutlined, condition: BranchesOutlined, end: CheckCircleOutlined, cc: CopyOutlined, action: CodeOutlined };

export function WorkflowNodeCard({ node, title, summary, selected, start, visit, onClick, onNavigate, buttonRef }: {
  node: WorkflowGraphProjection['nodes'][number]; title: string; summary?: string; selected: boolean; start: boolean;
  visit?: WorkflowGraphVisit; onClick: () => void; onNavigate: (id: string, key: string) => boolean; buttonRef?: Ref<HTMLButtonElement>;
}) {
  const Icon = icons[node.kind as keyof typeof icons] || CodeOutlined;
  const stepStatus = visit?.businessStep?.status;
  const stateLabel = stepStatus === 'result_ready' ? '结果已收 · 推进受阻' : stepStatus === 'waiting' ? '等待业务结果' : visit ? statuses[visit.status] || visit.status : '';
  const stepSummary = node.businessStep ? `v${node.businessStep.handler.version} · ${node.businessStep.handler.mode === 'pure' ? '业务计算' : '核对后执行业务'}` : undefined;
  return <button type="button" ref={buttonRef} className={`oxa-workflow-node ${selected ? 'selected' : ''} ${visit ? 'visited' : ''} kind-${node.kind}`}
    aria-pressed={selected} aria-label={`${title}，${kinds[node.kind] || node.kind}${visit ? `，${stateLabel}` : ''}`}
    onClick={onClick} onKeyDown={event => { if (onNavigate(node.id, event.key)) event.preventDefault(); }}>
    <span className="oxa-workflow-node-icon"><Icon /></span><span className="oxa-workflow-node-copy"><span className="oxa-workflow-node-kind">{start ? '起点 · ' : ''}{kinds[node.kind] || node.kind}</span>
      <strong title={title}>{title}</strong><small title={summary || stepSummary}>{summary || stepSummary || (node.mode ? workflowNodeModes[node.mode] || node.mode : node.kind === 'cc' ? `${node.emptyPolicy === 'skip' ? '无人时跳过' : '必须有接收人'} · ${node.notify === false ? '仅抄送记录' : '通知接收人'}` : node.kind === 'condition' ? '按顺序首次命中' : outcomes[node.outcome || ''] || node.id)}</small></span>
    {visit && <span className={`oxa-workflow-node-status status-${stepStatus === 'result_ready' ? 'error' : visit.status}`}>{visit.skipped ? '无人，已跳过' : stateLabel}</span>}
  </button>;
}
