import type { OpenXiangdaAppDeclaration } from 'openxiangda/config';

type Workflows = NonNullable<OpenXiangdaAppDeclaration['workflows']>;

/** Add the application's model and reader role; exclude sensitive detail fields in page code. */
export const automaticCcDefinition: Workflows['definitions'][number]['definition'] = {
  schemaVersion: 'openxiangda.workflow-definition/v2',
  code: 'request-copy', title: '申请自动抄送', startAt: 'copy',
  acceptedCommandDeactivationPolicy: 'finish-pinned',
  subject: { resourceCode: 'requests', factProjection: { title: 'title' }, summaryFields: ['title'] },
  inputSchema: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string' } } },
  nodes: {
    copy: {
      id: 'copy', kind: 'cc', title: '抄送办理负责人', binding: 'readers', next: 'approved',
      emptyPolicy: 'block', administration: { assigneeProviders: ['app_role', 'fixed_users'] },
    },
    approved: { id: 'approved', kind: 'end', title: '办理完成', outcome: 'approved' },
  },
};

export const automaticCcBinding: Workflows['bindings'][number]['binding'] = {
  schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: 'request-copy',
  bindings: { readers: { provider: 'app_role', roleCode: 'reader', min: 1, max: 20 } },
};
