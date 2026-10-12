import type { Ref } from 'react';
import { BranchesOutlined, CheckCircleOutlined, PlayCircleFilled, CheckCircleFilled, CodeOutlined, BellOutlined, CopyOutlined, UserOutlined, FormOutlined } from '@ant-design/icons';
import { formatWorkflowCompletionDeadline, type WorkflowGraphProjection, type WorkflowGraphVisit } from 'openxiangda-contracts/browser';

export const workflowNodeModes: Record<string, string> = { single: '单人审批', any: '或签 · 任一人通过', all: '会签 · 全部通过', sequence: '依次审批' };
const kinds: Record<string, string> = { start: '发起', notification: '通知', handle: '办理', approval: '审批', condition: '条件分支', parallel: '并行分支', join: '汇合', end: '结束', cc: '抄送', action: '业务步骤', correction: '发起人补正' };
const statuses: Record<string, string> = { active: '处理中', waiting: '等待中', completed: '已完成', approved: '已同意', rejected: '已拒绝', error: '异常', cancelled: '已取消', returned: '已退回', running: '处理中' };
const outcomes: Record<string, string> = { completed: '流程已完成', approved: '审批通过', rejected: '审批拒绝', terminated: '流程终止', withdrawn: '已撤回' };
const icons = { start: PlayCircleFilled, notification: BellOutlined, handle: FormOutlined, approval: UserOutlined, condition: BranchesOutlined, parallel: BranchesOutlined, join: CheckCircleOutlined, end: CheckCircleOutlined, cc: CopyOutlined, action: CodeOutlined, correction: FormOutlined };

export function WorkflowNodeCard({ node, title, summary, selected, start, visit, onClick, onNavigate, buttonRef, designer = false }: {
  node: WorkflowGraphProjection['nodes'][number]; title: string; summary?: string; selected: boolean; start: boolean;
  visit?: WorkflowGraphVisit; onClick: () => void; onNavigate: (id: string, key: string) => boolean; buttonRef?: Ref<HTMLButtonElement>; designer?: boolean;
}) {
  const displayKind = node.presentation === 'notification' ? 'notification' : node.kind;
  const Icon = designer && node.kind === 'end' ? CheckCircleFilled : icons[displayKind as keyof typeof icons] || CodeOutlined;
  const modeLabel = node.kind === 'handle' ? ({ single:'单人办理', any:'任一人完成', all:'全部完成', sequence:'依次办理' } as Record<string,string>)[node.mode || ''] : workflowNodeModes[node.mode || ''];
  const stepStatus = visit?.businessStep?.status;
  const stateLabel = visit?.status === 'skipped' ? '已办过，本次略过' : visit?.skipped ? (node.kind === 'approval' ? '无审批人，已跳过' : '无人，已跳过') : stepStatus === 'result_stale_inputs' ? '输入已变化 · 待处理' : stepStatus === 'result_ready' ? '结果已收 · 推进受阻' : stepStatus === 'waiting' ? '等待业务结果' : visit ? `${statuses[visit.status] || visit.status}${visit.completionDeadline ? ' · 超时自动同意' : visit.automaticApprovals?.length ? ' · 发起人自动同意' : ''}` : '';
  const deadlineSummary = node.completionDeadline ? formatWorkflowCompletionDeadline(node.completionDeadline) : undefined;
  const stepSummary = node.presentation === 'notification' ? '通过通知中心发送' : node.businessStep ? `v${node.businessStep.handler.version} · ${node.businessStep.handler.mode === 'pure' ? '业务计算' : '核对后执行业务'}` : undefined;
  return <button type="button" ref={buttonRef} className={`oxa-workflow-node ${selected ? 'selected' : ''} ${visit ? 'visited' : ''} ${designer ? 'designer-node' : ''} kind-${displayKind}`}
    aria-pressed={selected} aria-label={`${title}，${kinds[displayKind] || displayKind}${visit ? `，${stateLabel}` : ''}`}
    onClick={onClick} onKeyDown={event => { if (onNavigate(node.id, event.key)) event.preventDefault(); }}>
    <span className="oxa-workflow-node-icon"><Icon /></span><span className="oxa-workflow-node-copy"><span className="oxa-workflow-node-kind">{start && !designer ? '起点 · ' : ''}{kinds[displayKind] || displayKind}</span>
      <strong title={title}>{title}</strong><small title={deadlineSummary || summary || stepSummary}>{deadlineSummary || summary || stepSummary || (node.mode ? `${modeLabel || node.mode}${node.emptyPolicy === 'skip' ? ' · 无人时跳过' : ''}${node.initiatorApprovalPolicy === 'auto_approve' ? ' · 发起人自动同意' : ''}` : node.kind === 'cc' ? `${node.emptyPolicy === 'skip' ? '无人时跳过' : '必须有接收人'} · ${node.notify === false ? '仅抄送记录' : '通知接收人'}` : node.kind === 'correction' ? '本人补正 · 重提后重新流转' : node.kind === 'parallel' ? `${node.parallel?.branchCount || 2} 条分支同时办理` : node.kind === 'join' ? '全部完成后继续' : node.kind === 'condition' ? '按顺序首次命中' : outcomes[node.outcome || ''] || (designer ? '按流程配置执行' : node.id))}</small></span>
    {visit && <span className={`oxa-workflow-node-status status-${['result_ready','result_stale_inputs'].includes(stepStatus || '') ? 'error' : visit.status}`}>{stateLabel}</span>}
  </button>;
}
