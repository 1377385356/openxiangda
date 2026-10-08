import type { SurfaceField } from '../resource/SurfaceFields';
import type { DataResourceSurface, WorkflowOwnedSubjectCreate } from 'openxiangda-contracts/browser';
type JsonObject = Record<string, unknown>;

/** Presentation rules supplied by application code; never an authorization grant. */
export interface WorkflowSubmissionFieldState {
  visible?: boolean;
  /** Adds a conditional requirement; false cannot remove the original requirement. */
  required?: boolean;
  /** Canonical value to submit instead of a hidden, previously entered value. */
  hiddenValue?: unknown;
}

export type WorkflowSubmissionFieldStates = Readonly<Record<string, WorkflowSubmissionFieldState>>;

export type WorkflowSubmissionSubtableFieldStates = Readonly<Record<string,
  Readonly<Record<string, Pick<WorkflowSubmissionFieldState, 'visible' | 'required'>>>>>;

/** Display rules never extend the sealed named child closure or rewrite row values. */
export function workflowSubmissionSubtableStates(
  parent: DataResourceSurface,
  grant: WorkflowOwnedSubjectCreate | undefined,
  states: WorkflowSubmissionSubtableFieldStates = {},
): WorkflowSubmissionSubtableFieldStates {
  const plain = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' &&
    !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  const invalid = () => { throw new Error('OPENXIANGDA_NAMED_SUBTABLE_FIELD_STATE_INVALID'); };
  if (!plain(states)) {
    const pending: unknown = states;
    if (pending instanceof Promise) void pending.catch(() => {});
    invalid();
  }
  for (const [code, fields] of Object.entries(states)) {
    const table = grant?.subtables.find(item => item.fieldCode === code);
    if (parent.fields[code]?.type !== 'subtable' || !table || !plain(fields)) invalid();
    for (const [key, state] of Object.entries(fields)) {
      if (!table!.fieldCodes.includes(key) || !plain(state) || Object.entries(state).some(([name, value]) =>
        !['visible', 'required'].includes(name) || typeof value !== 'boolean')) invalid();
    }
  }
  return structuredClone(states);
}

export function workflowSubmissionSubtableFields(
  fields: readonly SurfaceField[],
  states: WorkflowSubmissionSubtableFieldStates[string] = {},
): SurfaceField[] {
  return fields.filter(field => states[field.key]?.visible !== false)
    .map(field => states[field.key]?.required ? { ...field, requiredHint: true } : field);
}

/** onFinish contains mounted controls only; retained values still obey the launch allowlist. */
export function workflowSubmissionFormInput(
  fields: readonly SurfaceField[],
  stored: Readonly<Record<string, unknown>>,
  submitted: Readonly<Record<string, unknown>>,
) {
  const entered = { ...stored, ...submitted };
  return Object.fromEntries(fields
    .filter(field => !field.system && field.widget !== 'readonly' && Object.hasOwn(entered, field.key))
    .map(field => [field.key, entered[field.key]]));
}

export function workflowSubmissionFormProjection(
  fields: readonly SurfaceField[],
  values: Readonly<Record<string, unknown>>,
  states: WorkflowSubmissionFieldStates = {},
) {
  const allowed = new Set(fields.map(field => field.key));
  for (const key of Object.keys(states)) {
    if (!allowed.has(key)) throw new Error('OPENXIANGDA_WORKFLOW_FORM_FIELD_UNAVAILABLE');
  }
  const visible: SurfaceField[] = [];
  const data: Record<string, unknown> = {};
  const hiddenValues: Record<string, unknown> = {};
  for (const field of fields) {
    const state = states[field.key];
    if (state?.visible === false) {
      if (field.requiredHint && state.hiddenValue == null) throw new Error('OPENXIANGDA_WORKFLOW_FORM_REQUIRED_FIELD_HIDDEN');
      hiddenValues[field.key] = state.hiddenValue;
      if (state.hiddenValue !== undefined) data[field.key] = state.hiddenValue;
    } else {
      visible.push(state?.required ? { ...field, requiredHint: true } : field);
      if (Object.hasOwn(values, field.key) && values[field.key] !== undefined) data[field.key] = values[field.key];
    }
  }
  return { fields: visible, values: data, hiddenValues };
}

/** A late or repeated prefill cannot replace a field that the user already edited. */
export function workflowSubmissionPrefill(
  fields: readonly SurfaceField[],
  values: Readonly<Record<string, unknown>>,
  applied: Set<string>,
  touched: (key: string) => boolean,
) {
  const allowed = new Set(fields.map(field => field.key));
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) throw new Error('OPENXIANGDA_WORKFLOW_FORM_FIELD_UNAVAILABLE');
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (applied.has(key)) continue;
    applied.add(key);
    if (!touched(key)) result[key] = value;
  }
  return result;
}

/** User input only; a presentation patch never expands the launch contract. */
export function workflowSubmissionValueLinkage(
  fields: readonly SurfaceField[],
  changed: Readonly<JsonObject>,
  values: Readonly<JsonObject>,
  linkage?: (changed: Readonly<JsonObject>, values: Readonly<JsonObject>) => JsonObject,
): JsonObject {
  if (!linkage) return {};
  const allowed = new Set(fields.filter(field => !field.system && field.widget !== 'readonly').map(field => field.key));
  if (Object.keys(changed).some(key => !allowed.has(key))) throw new Error('OPENXIANGDA_WORKFLOW_FORM_FIELD_UNAVAILABLE');
  const select = (input: Readonly<JsonObject>): JsonObject => structuredClone(Object.fromEntries(
    Object.entries(input).filter(([key]) => allowed.has(key)),
  ));
  const patch = linkage(select(changed), select(values));
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(patch)) || Object.hasOwn(patch, 'then')) {
    // An accidentally async callback must not leave an unhandled rejection.
    if (patch instanceof Promise) void patch.catch(() => {});
    throw new Error('OPENXIANGDA_WORKFLOW_FORM_LINKAGE_INVALID');
  }
  if (Object.keys(patch).some(key => !allowed.has(key))) throw new Error('OPENXIANGDA_WORKFLOW_FORM_FIELD_UNAVAILABLE');
  return structuredClone(patch);
}
