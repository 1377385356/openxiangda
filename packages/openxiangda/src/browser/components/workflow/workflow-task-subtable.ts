import type { WorkflowTaskFormSurface, WorkflowTaskSubtableRow } from 'openxiangda-contracts/browser';
import type { SubtableDraftRow } from '../platform-fields/subtable-value';
import { fieldValueForData, fieldValueForForm } from '../platform-fields/field-form-codec';
import { workflowLaunchContractJsonEqual } from '../../workflow-launch';
import { workflowTaskPageFieldState } from 'openxiangda-contracts/browser';

export function workflowTaskSubtableFormRows(source: WorkflowTaskFormSurface, code: string, value: unknown): SubtableDraftRow[] {
  const surface = source.subtables?.[code];
  if (!surface || !Array.isArray(value)) return [];
  return (value as WorkflowTaskSubtableRow[]).map(row => ({
    key: row.key, state: row.state, ...(row.id ? { id: row.id, revision: row.revision } : {}),
    data: Object.fromEntries(Object.entries(row.values).map(([key, entry]) => [key, fieldValueForForm(surface.fields[key], entry)])),
    snapshot: surface.rows.find(record => String(record.id) === row.id),
  }));
}

export function workflowTaskSubtableDataRows(source: WorkflowTaskFormSurface, code: string, value: unknown): WorkflowTaskSubtableRow[] {
  const metadata = source.page.fields.find(field => field.code === code)?.subtable;
  const surface = source.subtables?.[code];
  if (!metadata || !surface || !Array.isArray(value)) return [];
  return (value as SubtableDraftRow[]).map(row => {
    const values = Object.fromEntries(Object.entries(row.data).map(([code, entry]) => [code, fieldValueForData(surface.fields[code], entry) ?? null]));
    const editable = workflowTaskPageFieldState({ title: code, fields: metadata.fields }, { ...row.snapshot, ...values }).filter(field => field.visible && !field.readonly);
    return {
    key: row.key, state: row.state, ...(row.id ? { id: row.id, revision: row.revision } : {}),
    values: row.state === 'deleted' ? {} : Object.fromEntries(editable.filter(field => Object.hasOwn(values, field.code)).map(field => [field.code, values[field.code]])),
  }; });
}

/** Explicitly chosen comparison adopts fresh CAS while preserving only the actor's edits. */
export function rebaseWorkflowTaskSubtable(source: WorkflowTaskFormSurface, latest: WorkflowTaskFormSurface, code: string, current: WorkflowTaskSubtableRow[]): WorkflowTaskSubtableRow[] {
  const baseline = new Map((source.values[code] as WorkflowTaskSubtableRow[]).map(row => [row.key, row]));
  const fresh = latest.values[code] as WorkflowTaskSubtableRow[];
  const byId = new Map(fresh.map(row => [row.key, row]));
  const rebased = current.flatMap(row => {
    const next = byId.get(row.key);
    if (row.state === 'created') {
      if (next) throw new Error('新增子行的标识已被使用，请先核对最新子表。当前输入已保留。');
      return [row];
    }
    const before = baseline.get(row.key);
    const changes = Object.fromEntries(Object.entries(row.values).filter(([key, value]) => !workflowLaunchContractJsonEqual(before?.values[key], value)));
    if (!next) {
      if (Object.keys(changes).length && row.state !== 'deleted') throw new Error('你修改的子行已被其他人删除。当前输入已保留，请先记录该行，再采用最新资料。');
      return [];
    }
    return [{ ...next, state: row.state, values: row.state === 'deleted' ? {} : { ...next.values, ...changes } }];
  });
  for (const row of fresh) if (!current.some(value => value.key === row.key)) rebased.push(row);
  if (!latest.page.fields.find(field => field.code === code)?.subtable?.reorder) {
    return [...fresh.flatMap(row => rebased.filter(value => value.key === row.key)), ...rebased.filter(row => row.state === 'created')];
  }
  return rebased;
}
