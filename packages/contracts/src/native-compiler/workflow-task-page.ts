import type { DataFileUploadPlan, WorkflowExpression } from '../types.js';
import type { DataFieldSurface } from '../surface.js';
import { DATA_RESOURCE_MAX_FIELDS, DATA_SUBTABLE_MAX_ROWS, DATA_SUBTABLE_MAX_TOTAL_ROWS } from './data-capacity.js';

export const WORKFLOW_TASK_PAGE_MAX_FIELDS = DATA_RESOURCE_MAX_FIELDS;
export const WORKFLOW_TASK_PAGE_MAX_BYTES = 1024 * 1024;
export const WORKFLOW_TASK_PAGE_DEFINITION_MAX_BYTES = 65_536;
export const WORKFLOW_TASK_SUBTABLE_MAX_ROWS = DATA_SUBTABLE_MAX_ROWS;
export const WORKFLOW_TASK_SUBTABLE_MAX_TOTAL_ROWS = DATA_SUBTABLE_MAX_TOTAL_ROWS;

export interface WorkflowTaskSubtablePage {
  fields: WorkflowTaskPageField[];
  create?: boolean;
  delete?: boolean;
  reorder?: boolean;
}

/** Complete owned-row intent. Omission never means deletion. */
export interface WorkflowTaskSubtableRow {
  key: string;
  state: 'created' | 'persisted' | 'deleted';
  id?: string;
  revision?: number;
  values: Record<string, unknown>;
}

export interface WorkflowTaskSubtableSurface {
  resourceCode: string;
  foreignKey: string;
  orderField: string;
  minRows?: number;
  maxRows: number;
  fields: Record<string, DataFieldSurface>;
  rows: Array<Record<string, unknown>>;
}

/** Application page code owns these rules. They are never administrator overrides. */
export interface WorkflowTaskPageField {
  code: string;
  readonly?: boolean;
  required?: boolean;
  visibleWhen?: WorkflowExpression;
  requiredWhen?: WorkflowExpression;
  subtable?: WorkflowTaskSubtablePage;
}

export interface WorkflowTaskPage {
  title: string;
  fields: WorkflowTaskPageField[];
}

export interface WorkflowTaskFormInput {
  expectedRevision: number;
  values: Record<string, unknown>;
  /** Consume this actor's selected private draft in the original command transaction. */
  draft?: WorkflowTaskDraftReference;
}

export interface WorkflowTaskDraftReference {
  id: string;
  expectedRevision: number;
}

export interface WorkflowTaskDraftSave extends WorkflowTaskDraftReference {
  recordRevision: number;
  values: Record<string, unknown>;
}

export interface WorkflowTaskDraft {
  id: string;
  revision: number;
  recordRevision: number;
  taskId: string;
  pageCode: string;
  values: Record<string, unknown>;
  updatedAt: string;
  expiresAt: string;
}

export interface WorkflowTaskDraftList {
  items: WorkflowTaskDraft[];
  incompatibleItems: Array<{ id: string; revision: number; errorCode: string }>;
  limit: number;
  retentionDays: number;
}

/** An owned row is addressed by the declared parent field and stable row UUID. */
export interface WorkflowTaskFileRow {
  subtableFieldCode: string;
  rowKey: string;
}

/** Stable upload intent for a fixed task; no arbitrary resource or record target. */
export interface WorkflowTaskFileUpload {
  id: string;
  row?: WorkflowTaskFileRow;
  fieldCode: string;
  fileName: string;
  fileSize: number;
  contentType?: string;
}

export type WorkflowTaskFileUploadPlan = DataFileUploadPlan & { state: 'pending' | 'ready'; row?: WorkflowTaskFileRow };

export interface WorkflowTaskFormSurface {
  pageCode: string;
  page: WorkflowTaskPage;
  expectedRevision: number;
  fields: Record<string, DataFieldSurface>;
  values: Record<string, unknown>;
  subtables?: Record<string, WorkflowTaskSubtableSurface>;
}

export type WorkflowTaskCommandReceipt =
  | { status: 'not_observed' | 'expired_unconsumed'; taskId: string; idempotencyKey: string }
  | { status: 'succeeded' | 'failed'; taskId: string; idempotencyKey: string;
      commandId: string; command: string; requestDigest: string;
      businessCommand?: { operationCode: string; inputDigest: string; workflowCode: string; recordId: string };
      result: import('../types.js').WorkflowCommandResult | null; errorCode: string | null };

type Definition = {
  subject?: { factProjection: Record<string, string> };
  taskPages?: Record<string, WorkflowTaskPage>;
  nodes?: Record<string, any>;
};

const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const codePattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const fieldPattern = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && [null, Object.prototype].includes(Object.getPrototypeOf(value));
const exact = (value: unknown, keys: string[]): value is Record<string, any> => object(value) && Object.keys(value).every(key => keys.includes(key) && !forbidden.has(key));
const bytes = (value: unknown) => { try { return new TextEncoder().encode(JSON.stringify(value)).length; } catch { return Infinity; } };
const empty = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => jsonEqual(value, b[index]));
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]));
}

function pathValue(values: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  if (parts.some(part => !codePattern.test(part) || forbidden.has(part)) || parts.length > 12) return undefined;
  return parts.reduce<unknown>((value, key) => object(value) && Object.hasOwn(value, key) ? value[key] : undefined, values);
}

/** A small, bounded expression grammar shared by browser and server. */
export function evaluateWorkflowTaskPageExpression(expression: WorkflowExpression, values: Record<string, unknown>): unknown {
  switch (expression.op) {
    case 'literal': return expression.value;
    case 'path': return pathValue({ values }, expression.path);
    case 'and': return expression.values.every(value => Boolean(evaluateWorkflowTaskPageExpression(value, values)));
    case 'or': return expression.values.some(value => Boolean(evaluateWorkflowTaskPageExpression(value, values)));
    case 'not': return !evaluateWorkflowTaskPageExpression(expression.value, values);
    case 'exists': return !empty(evaluateWorkflowTaskPageExpression(expression.value, values));
    default: {
      const left = evaluateWorkflowTaskPageExpression(expression.left, values);
      const right = evaluateWorkflowTaskPageExpression(expression.right, values);
      if (expression.op === 'eq') return jsonEqual(left, right);
      if (expression.op === 'neq') return !jsonEqual(left, right);
      if (expression.op === 'in') return Array.isArray(right) && right.some(value => jsonEqual(value, left));
      if (expression.op === 'contains') return Array.isArray(left) ? left.some(value => jsonEqual(value, right)) : typeof left === 'string' && typeof right === 'string' && left.includes(right);
      if (typeof left !== 'number' || typeof right !== 'number' || !Number.isFinite(left) || !Number.isFinite(right)) return false;
      if (expression.op === 'gt') return left > right;
      if (expression.op === 'gte') return left >= right;
      if (expression.op === 'lt') return left < right;
      return left <= right;
    }
  }
}

function validExpression(value: unknown, fields: Set<string>, depth = 0, budget = { nodes: 0 }): boolean {
  if (depth > 8 || ++budget.nodes > 64 || !object(value)) return false;
  if (value.op === 'literal') return exact(value, ['op', 'value']) && Object.hasOwn(value, 'value') && bytes(value.value) <= 4096 && boundedValues(value.value);
  if (value.op === 'path') {
    if (!exact(value, ['op', 'path']) || typeof value.path !== 'string') return false;
    const parts = value.path.split('.');
    return parts[0] === 'values' && parts.length >= 2 && parts.length <= 8 && fields.has(parts[1]!) && parts.every((part: string) => fieldPattern.test(part) && !forbidden.has(part));
  }
  if (['not', 'exists'].includes(value.op)) return exact(value, ['op', 'value']) && validExpression(value.value, fields, depth + 1, budget);
  if (['and', 'or'].includes(value.op)) return exact(value, ['op', 'values']) && Array.isArray(value.values) && value.values.length > 0 && value.values.length <= 16 && value.values.every(item => validExpression(item, fields, depth + 1, budget));
  return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'].includes(value.op) && exact(value, ['op', 'left', 'right']) && validExpression(value.left, fields, depth + 1, budget) && validExpression(value.right, fields, depth + 1, budget);
}

/** Optional resource metadata lets the compiler and server reject unsupported controls. */
type TaskResourceField = { type: string; system?: boolean; hidden?: boolean; widget?: string; subtable?: DataFieldSurface['subtable'] };
export function validateWorkflowTaskPages(definition: Definition, resourceFields?: ReadonlyMap<string, TaskResourceField>, children?: ReadonlyMap<string, ReadonlyMap<string, TaskResourceField>>, ownedRowLimit = WORKFLOW_TASK_SUBTABLE_MAX_TOTAL_ROWS): string[] {
  const diagnostics: string[] = [];
  const pages = definition.taskPages;
  if (pages !== undefined && (!object(pages) || Object.keys(pages).length === 0 || Object.keys(pages).length > 16 || bytes(pages) > WORKFLOW_TASK_PAGE_DEFINITION_MAX_BYTES)) return ['WORKFLOW_TASK_PAGES_INVALID'];
  for (const [code, page] of Object.entries(pages || {})) {
    const pointer = `taskPages.${code}`;
    if (!codePattern.test(code) || forbidden.has(code) || !exact(page, ['title', 'fields']) || typeof page.title !== 'string' || !page.title.trim() || page.title.length > 160 || !Array.isArray(page.fields) || !page.fields.length || page.fields.length > WORKFLOW_TASK_PAGE_MAX_FIELDS) {
      diagnostics.push(`WORKFLOW_TASK_PAGE_INVALID:${pointer}`); continue;
    }
    const fields = new Set(page.fields.map(field => field?.code));
    if (fields.size !== page.fields.length) diagnostics.push(`WORKFLOW_TASK_PAGE_DUPLICATE_FIELD:${pointer}`);
    let rowBudget = 0;
    const childResources = new Set<string>();
    for (const field of page.fields) {
      if (!exact(field, ['code', 'readonly', 'required', 'visibleWhen', 'requiredWhen', 'subtable']) || !fieldPattern.test(field.code) || forbidden.has(field.code) || (['readonly', 'required'] as const).some(key => field[key] !== undefined && typeof field[key] !== 'boolean') || (field.readonly && (field.required || field.requiredWhen))) {
        diagnostics.push(`WORKFLOW_TASK_PAGE_FIELD_INVALID:${pointer}`); continue;
      }
      for (const key of ['visibleWhen', 'requiredWhen'] as const) if (field[key] !== undefined && !validExpression(field[key], fields)) diagnostics.push(`WORKFLOW_TASK_PAGE_EXPRESSION_INVALID:${pointer}.${field.code}.${key}`);
      if (resourceFields) {
        const resource = resourceFields.get(field.code);
        if (!resource || resource.system || resource.hidden || resource.type === 'serial-number' || (!field.readonly && resource.widget === 'readonly') || (!field.readonly && resource.type === 'subtable' && !field.subtable) || (field.subtable && resource.type !== 'subtable')) diagnostics.push(`WORKFLOW_TASK_PAGE_RESOURCE_FIELD_INVALID:${pointer}.${field.code}`);
        if (field.subtable && resource?.subtable) {
          const relation = resource.subtable;
          rowBudget += relation.maxRows ?? 20;
          if (childResources.has(relation.resourceCode) || !Number.isSafeInteger(relation.maxRows ?? 20) || (relation.maxRows ?? 20) < 1 || (relation.maxRows ?? 20) > WORKFLOW_TASK_SUBTABLE_MAX_ROWS || !fieldPattern.test(relation.foreignKey) || !fieldPattern.test(relation.orderField) || relation.foreignKey === relation.orderField) diagnostics.push(`WORKFLOW_TASK_SUBTABLE_RELATION_INVALID:${pointer}.${field.code}`);
          childResources.add(relation.resourceCode);
          const child = children?.get(relation.resourceCode);
          if (children && (!child || !['uuid', 'resource-ref.single'].includes(child.get(relation.foreignKey)?.type || '') || child.get(relation.orderField)?.type !== 'number.integer')) diagnostics.push(`WORKFLOW_TASK_SUBTABLE_RELATION_INVALID:${pointer}.${field.code}`);
          for (const nested of Array.isArray(field.subtable.fields) ? field.subtable.fields : []) {
            if (!nested || typeof nested.code !== 'string') continue;
            const metadata = child?.get(nested.code);
            if (nested.code === relation.foreignKey || nested.code === relation.orderField || (child && (!metadata || metadata.system || metadata.hidden || metadata.type === 'subtable' || (!nested.readonly && (metadata.widget === 'readonly' || metadata.type === 'serial-number'))))) diagnostics.push(`WORKFLOW_TASK_SUBTABLE_FIELD_UNSUPPORTED:${pointer}.${field.code}.${nested.code}`);
          }
        } else if (field.subtable && resourceFields) diagnostics.push(`WORKFLOW_TASK_SUBTABLE_RELATION_INVALID:${pointer}.${field.code}`);
      }
      if (field.subtable) {
        if (field.readonly || !exact(field.subtable, ['fields', 'create', 'delete', 'reorder']) || (['create', 'delete', 'reorder'] as const).some(key => field.subtable?.[key] !== undefined && typeof field.subtable[key] !== 'boolean') || !Array.isArray(field.subtable.fields) || field.subtable.fields.some(child => child?.subtable)) diagnostics.push(`WORKFLOW_TASK_SUBTABLE_PAGE_INVALID:${pointer}.${field.code}`);
        else diagnostics.push(...validateWorkflowTaskPages({ taskPages: { child: { title: '子行', fields: field.subtable.fields } } }, children?.get(resourceFields?.get(field.code)?.subtable?.resourceCode || '')).map(error => `${error}:${pointer}.${field.code}`));
      }
    }
    if (rowBudget > Math.min(ownedRowLimit, WORKFLOW_TASK_SUBTABLE_MAX_TOTAL_ROWS) || rowBudget < 0 || !Number.isSafeInteger(rowBudget) || !Number.isSafeInteger(ownedRowLimit) || ownedRowLimit < 1) diagnostics.push(`WORKFLOW_TASK_SUBTABLE_BUDGET_EXCEEDED:${pointer}`);
  }
  for (const [id, node] of Object.entries(definition.nodes || {})) if (object(node) && node.taskPageCode !== undefined) {
    if (!['approval', 'correction'].includes(node.kind) || typeof node.taskPageCode !== 'string' || !object(pages) || !Object.hasOwn(pages, node.taskPageCode)) diagnostics.push(`WORKFLOW_TASK_PAGE_NOT_FOUND:${id}`);
    else if (Array.isArray(pages[node.taskPageCode]?.fields) && pages[node.taskPageCode]!.fields.some(field => field && (node.fieldPolicy?.fields?.[field.code] || node.fieldPolicy?.default) === 'hidden')) diagnostics.push(`WORKFLOW_TASK_PAGE_FIELD_HIDDEN:${id}`);
  }
  return diagnostics;
}

export function workflowTaskPageFieldState(page: WorkflowTaskPage, values: Record<string, unknown>) {
  return page.fields.map(field => ({
    code: field.code,
    visible: field.visibleWhen === undefined || Boolean(evaluateWorkflowTaskPageExpression(field.visibleWhen, values)),
    readonly: field.readonly === true,
    required: field.required === true || (field.requiredWhen !== undefined && Boolean(evaluateWorkflowTaskPageExpression(field.requiredWhen, values))),
  }));
}

export class WorkflowTaskPageError extends Error {
  rowIndex?: number;
  childField?: string;
  constructor(readonly code: string, readonly field?: string) { super(code); }
}

export function workflowTaskSubtableRows(page: WorkflowTaskSubtablePage, records: Array<Record<string, unknown>>): WorkflowTaskSubtableRow[] {
  return records.map(record => ({ key: String(record.id), id: String(record.id), revision: Number(record.revision), state: 'persisted',
    values: Object.fromEntries(workflowTaskPageFieldState({ title: '子行', fields: page.fields }, record).filter(field => field.visible && !field.readonly).map(field => [field.code, record[field.code] ?? null])) }));
}

/** Shared intent validation; Native still owns semantic field values and physical CAS. */
export function applyWorkflowTaskSubtableRows(field: WorkflowTaskPageField, maximum: number, current: Array<Record<string, unknown>>, input: unknown, required: boolean, checkRevisions = true, minimum = 0): WorkflowTaskSubtableRow[] {
  const page = field.subtable;
  const fail = (code: string): never => { throw new WorkflowTaskPageError(code, field.code); };
  if (!page || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > WORKFLOW_TASK_SUBTABLE_MAX_ROWS || !Number.isSafeInteger(minimum) || minimum < 0 || minimum > maximum || !Array.isArray(input) || input.length > 2 * maximum || bytes(input) > WORKFLOW_TASK_PAGE_MAX_BYTES || !boundedValues(input)) return fail('WORKFLOW_TASK_SUBTABLE_VALUES_INVALID');
  const records = new Map(current.map(record => [String(record.id), record]));
  const keys = new Set<string>();
  const ids = new Set<string>();
  const visible: WorkflowTaskSubtableRow[] = [];
  for (const row of input) {
    if (!exact(row, ['key', 'state', 'id', 'revision', 'values']) || typeof row.key !== 'string' || !uuidPattern.test(row.key) || keys.has(row.key) || !['created', 'persisted', 'deleted'].includes(row.state) || !object(row.values)) return fail('WORKFLOW_TASK_SUBTABLE_ROW_INVALID');
    keys.add(row.key);
    if (row.state === 'created') {
      if (!page.create || row.id !== undefined || row.revision !== undefined || records.has(row.key)) return fail('WORKFLOW_TASK_SUBTABLE_CREATE_FORBIDDEN');
    } else {
      if (typeof row.id !== 'string' || row.id !== row.key || !uuidPattern.test(row.id) || ids.has(row.id) || !Number.isSafeInteger(row.revision) || row.revision < 1 || !records.has(row.id)) return fail('WORKFLOW_TASK_SUBTABLE_SCOPE_CONFLICT');
      ids.add(row.id);
      if (checkRevisions && Number(records.get(row.id)!.revision) !== row.revision) return fail('WORKFLOW_TASK_SUBTABLE_REVISION_CONFLICT');
    }
    if (row.state === 'deleted') {
      if (!page.delete || Object.keys(row.values).length) return fail('WORKFLOW_TASK_SUBTABLE_DELETE_FORBIDDEN');
      continue;
    }
    try { applyWorkflowTaskPageValues({ title: field.code, fields: page.fields }, row.id ? records.get(row.id)! : {}, row.values, required); }
    catch (cause) {
      if (!(cause instanceof WorkflowTaskPageError)) throw cause;
      const error = new WorkflowTaskPageError(cause.code, field.code);
      error.rowIndex = visible.length;
      if (cause.field !== undefined) error.childField = cause.field;
      throw error;
    }
    visible.push(row as WorkflowTaskSubtableRow);
  }
  if (ids.size !== records.size) return fail('WORKFLOW_TASK_SUBTABLE_SCOPE_CONFLICT');
  if (visible.length > maximum) return fail('WORKFLOW_TASK_SUBTABLE_MAX_ROWS_EXCEEDED');
  if (required && visible.length < minimum) return fail('WORKFLOW_TASK_SUBTABLE_MIN_ROWS_NOT_MET');
  if (!page.reorder) {
    const retained = current.filter(record => visible.some(row => row.id === String(record.id))).map(record => String(record.id));
    const submitted = visible.filter(row => row.state === 'persisted').map(row => row.id!);
    if (!jsonEqual(retained, submitted) || visible.some((row, index) => row.state === 'created' && visible.slice(index + 1).some(later => later.state === 'persisted'))) return fail('WORKFLOW_TASK_SUBTABLE_REORDER_FORBIDDEN');
  }
  return input as WorkflowTaskSubtableRow[];
}

function boundedValues(value: unknown, budget = { members: 0 }, depth = 0): boolean {
  if (++budget.members > 50000 || depth > 12) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= WORKFLOW_TASK_PAGE_MAX_BYTES;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 1000 && value.every(item => boundedValues(item, budget, depth + 1));
  return object(value) && Object.entries(value).every(([key, item]) => !forbidden.has(key) && boundedValues(item, budget, depth + 1));
}

export function applyWorkflowTaskPageValues(page: WorkflowTaskPage, current: Record<string, unknown>, input: unknown, requireRequired: boolean): Record<string, unknown> {
  if (!object(input) || bytes(input) > WORKFLOW_TASK_PAGE_MAX_BYTES || !boundedValues(input)) throw new WorkflowTaskPageError('WORKFLOW_TASK_FORM_VALUES_INVALID');
  const merged = { ...current, ...input };
  const states = new Map(workflowTaskPageFieldState(page, merged).map(state => [state.code, state]));
  for (const code of Object.keys(input)) {
    const field = states.get(code);
    if (!field || field.readonly || !field.visible) throw new WorkflowTaskPageError('WORKFLOW_TASK_FORM_FIELD_NOT_EDITABLE', code);
  }
  if (requireRequired) for (const field of states.values()) {
    const value = merged[field.code];
    const absent = page.fields.find(item => item.code === field.code)?.subtable && Array.isArray(value)
      ? value.every(row => object(row) && row.state === 'deleted') : empty(value);
    if (field.visible && !field.readonly && field.required && absent) throw new WorkflowTaskPageError('WORKFLOW_TASK_FORM_REQUIRED', field.code);
  }
  return merged;
}

/** History stays immutable; only the current fact projection loses stale outputs. */
export function refreshWorkflowTaskPageFacts(definition: Definition, current: Record<string, any>, record: Record<string, unknown>) {
  // Facts and Native values are JSON. Keep the copy in this module's realm so
  // the plain-object checks also work in embedded runtimes and test hosts.
  const facts = JSON.parse(JSON.stringify(current)) as Record<string, any>;
  for (const [path, field] of Object.entries(definition.subject?.factProjection || {})) {
    const parts = path.split('.');
    if (!parts.length || parts.length > 12 || path.length > 128 || parts[0] === 'steps' || parts.some(part => !fieldPattern.test(part) || forbidden.has(part))) throw new WorkflowTaskPageError('WORKFLOW_TASK_FORM_FACT_PROJECTION_INVALID');
    if (!Object.hasOwn(record, field)) throw new WorkflowTaskPageError('WORKFLOW_TASK_FORM_FACT_FIELD_MISSING', field);
    let target = facts;
    for (const key of parts.slice(0, -1)) target = target[key] = object(target[key]) ? target[key] : {};
    target[parts.at(-1)!] = record[field] === undefined ? undefined : JSON.parse(JSON.stringify(record[field]));
  }
  const invalidated = new Set<string>();
  const actions = Object.values(definition.nodes || {}).filter(node => node.kind === 'action');
  for (let pass = 0; pass <= actions.length; pass++) {
    let changed = false;
    for (const node of actions) if (object(facts.steps) && Object.hasOwn(facts.steps, node.id) && Object.values(node.inputs || {}).some((binding: any) => binding.source === 'fact' && !jsonEqual(pathValue(current, binding.path), pathValue(facts, binding.path)))) {
      delete facts.steps[node.id]; invalidated.add(node.id); changed = true;
    }
    if (!changed) break;
  }
  return { facts, invalidatedNodeIds: [...invalidated].sort() };
}

/** Conservative fixed-topology proof: every forward approval path reruns each producer. */
export function workflowTaskPageReplayCoversInvalidation(definition: Definition, startAt: string, invalidatedNodeIds: string[]): boolean {
  const nodes = definition.nodes || {};
  for (const producer of invalidatedNodeIds) {
    const visiting = new Set<string>();
    const memo = new Map<string, boolean>();
    const covers = (id: string): boolean => {
      if (id === producer) return true;
      if (memo.has(id)) return memo.get(id)!;
      if (visiting.has(id) || visiting.size > 200) return false;
      const node = nodes[id];
      if (!object(node) || node.kind === 'end') return false;
      visiting.add(id);
      const targets = node.kind === 'approval' ? [node.onApprove] : node.kind === 'condition'
        ? [...(node.branches || []).map((branch: any) => branch.target), node.otherwise] : [node.next];
      const result = targets.length > 0 && targets.every(target => typeof target === 'string' && covers(target));
      visiting.delete(id); memo.set(id, result); return result;
    };
    if (!covers(startAt)) return false;
  }
  return true;
}
