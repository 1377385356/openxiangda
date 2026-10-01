import type { OpenXiangdaAppDeclaration } from 'openxiangda/config';

type Definition = NonNullable<OpenXiangdaAppDeclaration['workflows']>['definitions'][number]['definition'];

/** Integrate with the application's own subject/input and role bindings. */
export const workflow: Definition = {
  schemaVersion: 'openxiangda.workflow-definition/v2',
  code: 'requests', title: '申请审批', startAt: 'review',
  acceptedCommandDeactivationPolicy: 'finish-pinned',
  subject: { resourceCode: 'requests', factProjection: { description: 'description' } },
  inputSchema: { type: 'object', additionalProperties: false, properties: { description: { type: 'string' } } },
  nodes: {
    review: {
      id: 'review', kind: 'approval', title: '复审', binding: 'reviewers', mode: 'single',
      onApprove: 'approved', onReject: 'rejected', allowedOperations: ['approve', 'reject', 'transfer'],
      fieldPolicy: { default: 'readonly', fields: { description: 'readonly' } },
      administration: {
        modes: ['single', 'all', 'sequence'], assigneeProviders: ['fixed_users', 'app_role'],
        operations: ['approve', 'reject', 'transfer'],
      },
    },
    approved: { id: 'approved', kind: 'end', title: '审批通过', outcome: 'approved' },
    rejected: { id: 'rejected', kind: 'end', title: '审批拒绝', outcome: 'rejected' },
  },
};
