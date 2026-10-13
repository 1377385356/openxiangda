import type { WorkflowBindingEntry, WorkflowDefinition, WorkflowExpression } from '../types.js';
import {
  validateWorkflowConditionalAssignmentShape,
  validateWorkflowConditionalBindingDefinition,
  type WorkflowConditionalAssignment,
  type WorkflowConditionalAssignmentLeaf,
} from './workflow-conditional-assignment.js';

export type WorkflowSourceNamedPeople = { kind: 'named_people'; count: number };
export type WorkflowSourceBindingLeaf = {
  kind: 'binding';
  binding: WorkflowConditionalAssignmentLeaf & { provider: Exclude<WorkflowConditionalAssignmentLeaf['provider'], 'fixed_users'> };
};
export type WorkflowSourceAssignmentLeaf = WorkflowSourceNamedPeople | WorkflowSourceBindingLeaf;
export type WorkflowSourceAssignment = WorkflowSourceAssignmentLeaf |
  { kind: 'roles'; roleCodes: string[] } |
  { kind: 'conditional'; cases: Array<{ label?: string; when: WorkflowExpression; assignee: WorkflowSourceAssignmentLeaf }>; otherwise: WorkflowSourceAssignmentLeaf };

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: unknown, keys: string[]): value is Record<string, any> => record(value) && Object.keys(value).every(key => keys.includes(key));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function invalid(): never { throw new Error('WORKFLOW_BUNDLE_HANDLING_INVALID'); }

/** A named placeholder exists only inside validation; it never becomes returned source. */
function leaf(value: unknown, placeholders: boolean): WorkflowConditionalAssignmentLeaf | undefined {
  if (!record(value)) invalid();
  if (value.kind === 'named_people') {
    if (!exact(value, ['kind', 'count']) || !Number.isSafeInteger(value.count) || value.count < 0 || value.count > 200) invalid();
    return placeholders ? { provider: 'fixed_users', users: ['source-private-leaf'] } : undefined;
  }
  if (!exact(value, ['kind', 'binding']) || value.kind !== 'binding' || !record(value.binding) || ['fixed_users', 'conditional'].includes(value.binding.provider)) invalid();
  const candidate = value.binding as WorkflowConditionalAssignmentLeaf;
  if (validateWorkflowConditionalAssignmentShape({ provider: 'conditional', cases: [{ when: { op: 'literal', value: true }, assignee: candidate }], otherwise: candidate }).length) invalid();
  return clone(candidate);
}
function decode(value: unknown, placeholders: boolean): WorkflowBindingEntry | undefined {
  if (!record(value)) invalid();
  if (value.kind === 'roles') {
    if (!exact(value, ['kind', 'roleCodes']) || !Array.isArray(value.roleCodes)) invalid();
    const entry: WorkflowConditionalAssignmentLeaf = value.roleCodes.length === 1
      ? { provider: 'app_role', roleCode: value.roleCodes[0] }
      : { provider: 'app_role', roleCodes: value.roleCodes };
    if (validateWorkflowConditionalAssignmentShape({ provider: 'conditional', cases: [{ when: { op: 'literal', value: true }, assignee: entry }], otherwise: entry }).length) invalid();
    return clone(entry);
  }
  if (value.kind !== 'conditional') return leaf(value, placeholders);
  if (!exact(value, ['kind', 'cases', 'otherwise']) || !Array.isArray(value.cases) || !value.cases.length || value.cases.length > 20) invalid();
  let privateLeaf = false;
  const cases = value.cases.map((rule: unknown) => {
    if (!exact(rule, ['label', 'when', 'assignee'])) invalid();
    const assignee = leaf(rule.assignee, placeholders);
    if (!assignee) privateLeaf = true;
    return { ...(rule.label !== undefined ? { label: rule.label } : {}), when: rule.when,
      assignee: assignee || { provider: 'fixed_users' as const, users: ['source-private-leaf'] } };
  });
  const otherwise = leaf(value.otherwise, placeholders);
  if (!otherwise) privateLeaf = true;
  const assignment: WorkflowConditionalAssignment = { provider: 'conditional', cases,
    otherwise: otherwise || { provider: 'fixed_users', users: ['source-private-leaf'] } };
  if (validateWorkflowConditionalAssignmentShape(assignment).length) invalid();
  return privateLeaf ? undefined : clone(assignment);
}

/** Environment overrides contain no live named identities, even in unselected leaves. */
export function projectWorkflowSourceAssignment(entry: WorkflowBindingEntry): WorkflowSourceAssignment {
  const project = (value: WorkflowConditionalAssignmentLeaf): WorkflowSourceAssignmentLeaf => value.provider === 'fixed_users'
    ? { kind: 'named_people', count: value.users?.length || 0 }
    : { kind: 'binding', binding: clone(value) as WorkflowSourceBindingLeaf['binding'] };
  if (entry.provider === 'conditional') {
    if (validateWorkflowConditionalAssignmentShape(entry).length) invalid();
    return { kind: 'conditional', cases: entry.cases.map(rule => ({
      ...(rule.label !== undefined ? { label: rule.label } : {}), when: clone(rule.when), assignee: project(rule.assignee),
    })), otherwise: project(entry.otherwise) };
  }
  const projected = project(entry as WorkflowConditionalAssignmentLeaf);
  decode(projected, true); // Flat projections are subject to the same strict leaf shape.
  return projected;
}

/** Whole-value protection: any named leaf means no part of the assignment is imported. */
export function restoreWorkflowSourceAssignment(value: WorkflowSourceAssignment): WorkflowBindingEntry | undefined {
  return decode(value, false);
}
export function workflowSourceNamedAssignmentSummary(value?: WorkflowSourceAssignment): { present: boolean; count: number } {
  if (!value) return { present: false, count: 0 };
  decode(value, true);
  const leaves = value.kind === 'conditional' ? [...value.cases.map(rule => rule.assignee), value.otherwise] : [value];
  const named = leaves.filter((item): item is WorkflowSourceNamedPeople => item.kind === 'named_people');
  return { present: named.length > 0, count: named.reduce((total, item) => total + item.count, 0) };
}

/** DTO/fact semantics, not authority. Import/save separately validate the released ceiling. */
export function validateWorkflowSourceAssignment(value: unknown, definition: WorkflowDefinition, nodeId: string): string[] {
  try {
    const entry = decode(value, true);
    if (!entry) return ['WORKFLOW_BUNDLE_HANDLING_INVALID'];
    const node = definition.nodes[nodeId];
    if (!node || !('binding' in node)) return ['WORKFLOW_BUNDLE_HANDLING_INVALID'];
    if (entry.provider !== 'conditional' && record(value) && value.kind !== 'binding') return [];
    const conditional: WorkflowConditionalAssignment = entry.provider === 'conditional' ? entry : {
      provider: 'conditional', cases: [{ when: { op: 'literal', value: true }, assignee: entry as WorkflowConditionalAssignmentLeaf }], otherwise: entry as WorkflowConditionalAssignmentLeaf,
    };
    const key = '$source-handling-validation';
    const contextual = { ...definition, nodes: { ...definition.nodes, [nodeId]: { ...node, binding: key } } } as WorkflowDefinition;
    if ('emptyPolicy' in node && node.emptyPolicy === 'skip') return ['WORKFLOW_APPROVAL_EMPTY_PROVIDER_UNSUPPORTED'];
    return validateWorkflowConditionalBindingDefinition(contextual, {
      schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: definition.code, bindings: { [key]: conditional },
    });
  } catch { return ['WORKFLOW_BUNDLE_HANDLING_INVALID']; }
}
