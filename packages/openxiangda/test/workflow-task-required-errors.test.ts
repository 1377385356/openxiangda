import assert from 'node:assert/strict';
import test from 'node:test';
import { applyWorkflowTaskPageValues } from 'openxiangda-contracts/browser';
import { workflowTaskRequiredErrorUpdates } from '../src/browser/components/workflow/workflow-task-required-errors';

const page: any = { title: '纪要', fields: [
  { code: 'attachments', requiredWhen: { op: 'not', value: { op: 'exists', value: { op: 'path', path: 'values.text' } } } },
  { code: 'text', requiredWhen: { op: 'not', value: { op: 'exists', value: { op: 'path', path: 'values.attachments' } } } },
] };
const source: any = { page };
const message = '请填写或选择纪要附件';
const owned = new Map([['attachments', message]]);
const errors = () => [message, '文件类型不合法'];

test('another field satisfies the conditional requirement without hiding other errors', () => {
  const values = { attachments: [], text: '会议决定' };
  assert.doesNotThrow(() => applyWorkflowTaskPageValues(page, values, {}, true));
  assert.deepEqual(workflowTaskRequiredErrorUpdates(source, values, owned, errors), {
    release: ['attachments'], fields: [{ name: 'attachments', errors: ['文件类型不合法'] }],
  });
});
test('whitespace and removing the alternative keep the requirement and block completion', () => {
  for (const text of ['', ' \n\t ']) {
    const values = { attachments: [], text };
    assert.throws(() => applyWorkflowTaskPageValues(page, values, {}, true), { code: 'WORKFLOW_TASK_FORM_REQUIRED' });
    assert.deepEqual(workflowTaskRequiredErrorUpdates(source, values, owned, errors), { release: [], fields: [] });
  }
});
test('a valid same-field value clears only its former required error', () => {
  assert.deepEqual(workflowTaskRequiredErrorUpdates(source, { attachments: ['file-id'], text: '' }, owned, errors), {
    release: ['attachments'], fields: [{ name: 'attachments', errors: ['文件类型不合法'] }],
  });
});
test('replaced errors release ownership without modifying the replacement', () => {
  assert.deepEqual(workflowTaskRequiredErrorUpdates(source, { attachments: [], text: '会议决定' }, owned, () => ['服务端拒绝']), {
    release: ['attachments'], fields: [],
  });
});
test('hidden, readonly or removed fields clear only the owned requirement', () => {
  for (const fields of [[], [{ code: 'attachments', required: true, readonly: true }],
    [{ code: 'attachments', required: true, visibleWhen: { op: 'literal', value: false } }]]) {
    assert.deepEqual(workflowTaskRequiredErrorUpdates({ page: { ...page, fields } } as any, { attachments: [] }, owned, errors), {
      release: ['attachments'], fields: [{ name: 'attachments', errors: ['文件类型不合法'] }],
    });
  }
});
test('a required subtable of deleted rows stays invalid until a live row exists', () => {
  const subtable: any = { page: { title: '明细', fields: [{ code: 'attachments', required: true, subtable: { fields: [] } }] } };
  assert.deepEqual(workflowTaskRequiredErrorUpdates(subtable, { attachments: [{ state: 'deleted', values: {} }] }, owned, errors), {
    release: [], fields: [],
  });
  assert.deepEqual(workflowTaskRequiredErrorUpdates(subtable, { attachments: [{ state: 'created', values: {} }] }, owned, errors), {
    release: ['attachments'], fields: [{ name: 'attachments', errors: ['文件类型不合法'] }],
  });
});
