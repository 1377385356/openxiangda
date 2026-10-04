import { defineWorkflow } from 'openxiangda-devkit-core';
import type { WorkflowDefinition } from 'openxiangda-contracts';

/** Fixed definition policy; the platform freezes Native updated_by at rejection. */
export function withRejectionNotification(definition: WorkflowDefinition): WorkflowDefinition {
  return defineWorkflow({
    ...definition,
    rejectionNotification: {
      recipient: 'record_last_modifier',
      title: '审批拒绝',
      summary: '您有一个审批被拒绝，请查看',
    },
  });
}
