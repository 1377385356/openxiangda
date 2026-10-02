import type { WorkflowTaskPage, WorkflowApprovalNode } from 'openxiangda/config';

/** The model also declares title, amountCents, needsReason and reason. */
export const taskPages: Record<string, WorkflowTaskPage> = {
  fill: { title: '补填办理资料', fields: [
    { code: 'title', readonly: true },
    { code: 'amountCents', required: true },
    { code: 'needsReason', required: true },
    { code: 'reason', visibleWhen: { op: 'path', path: 'values.needsReason' }, requiredWhen: { op: 'path', path: 'values.needsReason' } },
  ] },
};

export const review: WorkflowApprovalNode = {
  id: 'review', kind: 'approval', title: '补填并审核', binding: 'reviewer', mode: 'single',
  taskPageCode: 'fill', onApprove: 'approved', onReject: 'rejected', fieldPolicy: { default: 'readonly' },
};
