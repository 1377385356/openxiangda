import type { WorkflowBindingEntry } from '../../../src/types.js';
const entry: WorkflowBindingEntry = {
  provider: 'conditional', cases: [{ when: { op: 'literal', value: true }, assignee: { provider: 'initiator' } }],
  otherwise: { provider: 'app_role', roleCode: 'reviewer' },
};
// @ts-expect-error conditional and flat fields cannot be combined
const mixed: WorkflowBindingEntry = { ...entry, roleCode: 'reviewer' };
const nested: WorkflowBindingEntry = { provider: 'conditional', cases: [],
  // @ts-expect-error a conditional source cannot be a leaf
  otherwise: entry };
void mixed; void nested;
