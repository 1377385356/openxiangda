import { defineApplicationModule } from 'openxiangda/config';

/** Optional teaching module; these example models are never platform definitions. */
export function businessExtension(appCode: string) {
  const submit = `app:${appCode}:submission:submit`;
  return {
    modules: [defineApplicationModule({
      code: 'submissions',
      models: [
        { code: 'requests', name: 'Requests', fields: [
          { code: 'title', label: 'Title', type: 'text.short', required: true },
          { code: 'submitted_by', label: 'Submitted by', type: 'text.short', required: true },
        ] },
        { code: 'submission-notes', name: 'Submission notes', fields: [
          { code: 'title', label: 'Title', type: 'text.short', required: true },
          { code: 'submitted_by', label: 'Submitted by', type: 'text.short', required: true },
        ] },
      ],
    })],
    authz: {
      capabilities: [{ code: submit, name: 'Submit both records', kind: 'backend' as const }],
      roles: [{ code: 'submitter', name: 'Submitter', capabilities: [submit] }],
    },
    backend: {
      operations: [{
        code: 'submission.submit', method: 'POST' as const, path: '/api/submissions', capability: submit,
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['title', 'idempotencyKey'],
          properties: { title: { type: 'string', minLength: 1, maxLength: 100 }, idempotencyKey: { type: 'string', minLength: 1, maxLength: 128 } },
        },
        responseSchema: {
          type: 'object', additionalProperties: false, required: ['idempotencyKey', 'replayed'],
          properties: { idempotencyKey: { type: 'string' }, replayed: { type: 'boolean' } },
        },
      }],
    },
  };
}
