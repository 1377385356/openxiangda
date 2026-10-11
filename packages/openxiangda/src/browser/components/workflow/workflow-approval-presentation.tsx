import type { WorkflowSurface, WorkflowTask, WorkflowTimeline } from 'openxiangda-contracts/browser';

/** Only current-task facts can describe its quorum. Historical visits may differ. */
export function workflowApprovalProgress(task: WorkflowTask | null | undefined) {
  const label = task?.approvalMode === 'all' ? '会签' : task?.approvalMode === 'any' ? '或签' : task?.approvalMode === 'sequence' ? '依次审批' : null;
  if (!label || !task) return null;
  const participants = (task.participants || []).filter(person => person.required && person.status !== 'cancelled');
  return { label, total: participants.length, approved: participants.filter(person => person.status === 'approved').length };
}

export function WorkflowApprovalParticipants({ surface, timeline }: { surface: WorkflowSurface; timeline: WorkflowTimeline | null }) {
  const summary = surface.presentation.summary;
  const active = (timeline?.flow || []).filter(visit => visit.status === 'active')
    .flatMap(visit => visit.assignees.filter(person => person.status === 'active'));
  const names = [...new Set(active.map(person => person.displayName).filter(Boolean))];
  const copied = [...new Set((timeline?.display?.entries || [])
    .filter(visit => visit.nodeKind === 'cc' && visit.kind !== 'planned_node')
    .flatMap(visit => visit.people.map(person => person.displayName)).filter(Boolean))];
  return <section className="oxa-workflow-participants-card" aria-label="参与人">
    <h2>参与人</h2>
    <dl>
      <div><dt>申请人</dt><dd>{summary.initiator?.displayName || summary.initiatorDisplayName}</dd></div>
      {names.length > 0 && <div><dt>当前处理人</dt><dd>{names.join('、')}</dd></div>}
      {copied.length > 0 && <div><dt>抄送</dt><dd>{copied.join('、')}</dd></div>}
    </dl>
  </section>;
}
