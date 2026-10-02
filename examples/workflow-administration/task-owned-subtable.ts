import type { WorkflowTaskPage } from 'openxiangda-contracts';

/** Bind items to the subject model's existing owned relationship. */
export const ownedTaskPage: WorkflowTaskPage = {
  title: '核对办理明细',
  fields: [
    { code: 'title', readonly: true },
    { code: 'items', required: true, subtable: {
      create: true, delete: true, reorder: true,
      fields: [
        { code: 'name', required: true },
        { code: 'quantity', required: true },
        { code: 'needsReason' },
        { code: 'reason', visibleWhen: { op: 'path', path: 'values.needsReason' }, requiredWhen: { op: 'path', path: 'values.needsReason' } },
        { code: 'originalNote', readonly: true },
      ],
    } },
  ],
};
