import { isWorkflowPlatformNotify } from './workflow-platform-notify.js';
export const WORKFLOW_EVENT_TYPES_V2 = [
  'openxiangda.workflow.task.reminded.v2',
  'openxiangda.workflow.node.notified.v2',
  'openxiangda.workflow.node.skipped.v2',
  'openxiangda.workflow.step.requested.v2',
  'openxiangda.workflow.step.result_received.v2',
  'openxiangda.workflow.step.completed.v2',
  'openxiangda.workflow.step.continuation_failed.v2',
  'openxiangda.workflow.instance.started.v2',
  'openxiangda.workflow.instance.cc_added.v2',
  'openxiangda.workflow.instance.completed.v2',
  'openxiangda.workflow.instance.rejected.v2',
  'openxiangda.workflow.instance.returned.v2',
  'openxiangda.workflow.instance.resumed.v2',
  'openxiangda.workflow.instance.withdrawn.v2',
  'openxiangda.workflow.instance.terminated.v2',
  'openxiangda.workflow.task.created.v2',
  'openxiangda.workflow.task.assigned.v2',
  'openxiangda.workflow.task.assignment_pending.v2',
  'openxiangda.workflow.task.assignment_resolution_failed.v2',
  'openxiangda.workflow.task.approved.v2',
  'openxiangda.workflow.task.completed.v2',
  'openxiangda.workflow.task.rejected.v2',
  'openxiangda.workflow.task.returned.v2',
  'openxiangda.workflow.task.resubmitted.v2',
  'openxiangda.workflow.task.transferred.v2',
  'openxiangda.workflow.task.reassigned.v2',
  'openxiangda.workflow.task.delegated.v2',
  'openxiangda.workflow.task.assignee_added.v2',
  'openxiangda.workflow.task.cancelled.v2',
  'openxiangda.workflow.participant.activated.v2',
  'openxiangda.workflow.participant.completed.v2',
  'openxiangda.workflow.participant.rejected.v2',
  'openxiangda.workflow.participant.returned.v2',
  'openxiangda.workflow.participant.transferred.v2',
  'openxiangda.workflow.participant.reassigned.v2',
  'openxiangda.workflow.participant.delegated.v2',
  'openxiangda.workflow.participant.added.v2',
  'openxiangda.workflow.participant.suspended.v2',
  'openxiangda.workflow.participant.resumed.v2',
  'openxiangda.workflow.participant.cancelled.v2',
] as const;

/** Canonical producers shared by the developer generator and sealed installer. */
export function workflowProducedEventTypes(definitions: readonly { definition: { nodes: Record<string, any> } }[]) {
  const nodes = definitions.flatMap(item => Object.values(item.definition.nodes));
  const businessStep = nodes.some(node => node.kind === 'action' && !isWorkflowPlatformNotify(node));
  return WORKFLOW_EVENT_TYPES_V2.filter(eventType =>
    eventType === 'openxiangda.workflow.task.reminded.v2' ? nodes.some(node => node.reminders) :
    eventType === 'openxiangda.workflow.node.notified.v2' ? nodes.some(isWorkflowPlatformNotify) :
    eventType === 'openxiangda.workflow.node.skipped.v2' ? nodes.some(node => node.kind === 'approval' && node.emptyPolicy === 'skip') :
    eventType.startsWith('openxiangda.workflow.step.') ? businessStep : true);
}
