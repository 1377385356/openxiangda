import type { SurfaceField } from '../resource/SurfaceFields';
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
      if (field.requiredHint) throw new Error('OPENXIANGDA_WORKFLOW_FORM_REQUIRED_FIELD_HIDDEN');
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
