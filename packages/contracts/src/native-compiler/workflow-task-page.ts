import type { WorkflowExpression } from '../types.js';
import type { DataFieldSurface } from '../surface.js';

export const WORKFLOW_TASK_PAGE_MAX_FIELDS = 64;
export const WORKFLOW_TASK_PAGE_MAX_BYTES = 65_536;

/** Application page code owns these rules. They are never administrator overrides. */
export interface WorkflowTaskPageField {
  code: string;
  readonly?: boolean;
  required?: boolean;
  visibleWhen?: WorkflowExpression;
  requiredWhen?: WorkflowExpression;
}

export interface WorkflowTaskPage {
  title: string;
  fields: WorkflowTaskPageField[];
}

export interface WorkflowTaskFormInput {
  expectedRevision: number;
  values: Record<string, unknown>;
}

export interface WorkflowTaskFormSurface {
  pageCode: string;
  page: WorkflowTaskPage;
  expectedRevision: number;
  fields: Record<string, DataFieldSurface>;
  values: Record<string, unknown>;
}

export type WorkflowTaskCommandReceipt =
  | { status: 'not_observed' | 'expired_unconsumed'; taskId: string; idempotencyKey: string }
  | { status: 'succeeded' | 'failed'; taskId: string; idempotencyKey: string;
      commandId: string; command: string; requestDigest: string;
      result: import('../types.js').WorkflowCommandResult | null; errorCode: string | null };

type Definition = {
  subject?: { factProjection: Record<string, string> };
  taskPages?: Record<string, WorkflowTaskPage>;
  nodes?: Record<string, any>;
};

const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const codePattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const fieldPattern = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
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
export function validateWorkflowTaskPages(definition: Definition, resourceFields?: ReadonlyMap<string, { type: string; system?: boolean; hidden?: boolean; widget?: string }>): string[] {
  const diagnostics: string[] = [];
  const pages = definition.taskPages;
  if (pages !== undefined && (!object(pages) || Object.keys(pages).length === 0 || Object.keys(pages).length > 16 || bytes(pages) > WORKFLOW_TASK_PAGE_MAX_BYTES)) return ['WORKFLOW_TASK_PAGES_INVALID'];
  for (const [code, page] of Object.entries(pages || {})) {
    const pointer = `taskPages.${code}`;
    if (!codePattern.test(code) || forbidden.has(code) || !exact(page, ['title', 'fields']) || typeof page.title !== 'string' || !page.title.trim() || page.title.length > 160 || !Array.isArray(page.fields) || !page.fields.length || page.fields.length > WORKFLOW_TASK_PAGE_MAX_FIELDS) {
      diagnostics.push(`WORKFLOW_TASK_PAGE_INVALID:${pointer}`); continue;
    }
    const fields = new Set(page.fields.map(field => field?.code));
    if (fields.size !== page.fields.length) diagnostics.push(`WORKFLOW_TASK_PAGE_DUPLICATE_FIELD:${pointer}`);
    for (const field of page.fields) {
      if (!exact(field, ['code', 'readonly', 'required', 'visibleWhen', 'requiredWhen']) || !fieldPattern.test(field.code) || forbidden.has(field.code) || (['readonly', 'required'] as const).some(key => field[key] !== undefined && typeof field[key] !== 'boolean') || (field.readonly && (field.required || field.requiredWhen))) {
        diagnostics.push(`WORKFLOW_TASK_PAGE_FIELD_INVALID:${pointer}`); continue;
      }
      for (const key of ['visibleWhen', 'requiredWhen'] as const) if (field[key] !== undefined && !validExpression(field[key], fields)) diagnostics.push(`WORKFLOW_TASK_PAGE_EXPRESSION_INVALID:${pointer}.${field.code}.${key}`);
      if (resourceFields) {
        const resource = resourceFields.get(field.code);
        if (!resource || resource.system || resource.hidden || resource.type === 'serial-number' || (!field.readonly && (resource.widget === 'readonly' || ['subtable', 'file', 'image', 'signature', 'text.rich'].includes(resource.type)))) diagnostics.push(`WORKFLOW_TASK_PAGE_RESOURCE_FIELD_INVALID:${pointer}.${field.code}`);
      }
    }
  }
  for (const [id, node] of Object.entries(definition.nodes || {})) if (object(node) && node.taskPageCode !== undefined) {
    if (node.kind !== 'approval' || typeof node.taskPageCode !== 'string' || !object(pages) || !Object.hasOwn(pages, node.taskPageCode)) diagnostics.push(`WORKFLOW_TASK_PAGE_NOT_FOUND:${id}`);
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
  constructor(readonly code: string, readonly field?: string) { super(code); }
}

function boundedValues(value: unknown, budget = { members: 0 }, depth = 0): boolean {
  if (++budget.members > 5000 || depth > 12) return false;
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
  if (requireRequired) for (const field of states.values()) if (field.visible && !field.readonly && field.required && empty(merged[field.code])) throw new WorkflowTaskPageError('WORKFLOW_TASK_FORM_REQUIRED', field.code);
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
