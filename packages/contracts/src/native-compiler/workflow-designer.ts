import { validateWorkflowReturnEligibility } from './workflow-return-eligibility.js';
import { workflowAuthoringCatalog, workflowCanvasBindingKey, validateWorkflowCanvasHuman, validateWorkflowCanvasBinding, type WorkflowDesignerCatalog } from "./workflow-authoring.js";
import { inspectWorkflowParallel, validateWorkflowParallel } from './workflow-parallel.js';
import { validateWorkflowSupervisorChains } from './workflow-supervisor-chain.js';
import { validateWorkflowReminders } from './workflow-reminders.js';
import { isWorkflowPlatformNotify, validateWorkflowPlatformNotify } from './workflow-platform-notify.js';
import { validateWorkflowReturnPolicies } from './workflow-return-policy.js';
import { validateWorkflowHandlingNodes } from './workflow-handle.js';
import type { WorkflowBinding, WorkflowDefinition, WorkflowExpression, WorkflowNode } from '../types.js';
import { workflowOperationMinimumOpinion,workflowOperationOpinion } from './workflow-node-administration.js';
import { projectWorkflowGraph, workflowExpressionPaths, type WorkflowGraphProjection } from './workflow-graph.js';

export type WorkflowPublicationScope = 'running_and_new' | 'new_only';
export type WorkflowAdoptionOutcome = 'eligible' | 'migrated' | 'deferred' | 'excepted' | 'held' | 'failed' | 'superseded' | 'completed';
export interface WorkflowDesignerDraft {
  admittedBy?: import('./workflow-management.js').WorkflowManagementAdmission;
  workflowCode: string;
  environmentKey: string;
  revision: number;
  baseHeadRevision: number;
  definitionVersion: number;
  bindingVersion: number;
  definition: WorkflowDefinition;
  binding: WorkflowBinding;
  publishedDefinition: WorkflowDefinition;
  publishedBinding: WorkflowBinding;
  capabilities?: WorkflowDesignerCatalog;
  diagnostics?: string[];
  publishable?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}
export interface WorkflowDesignerSave {
  expectedRevision: number;
  expectedHeadRevision: number;
  operationId: string;
  definition: WorkflowDefinition;
  binding: WorkflowBinding;
}
export interface WorkflowPublicationHold { instanceIds?: string[]; nodeIds?: string[]; reason: string }
export interface WorkflowDesignerPublish {
  expectedRevision: number;
  expectedHeadRevision: number;
  operationId: string;
  reason: string;
  scope?: WorkflowPublicationScope;
  holds?: WorkflowPublicationHold[];
  acknowledgeExceptions?: boolean;
}
export interface WorkflowPublicationPreview {
  revision: number;
  total: number;
  counts: Partial<Record<WorkflowAdoptionOutcome, number>>;
  items: Array<{ instanceId: string; businessKey: string; nodeTitle: string; fromVersion: number; outcome: WorkflowAdoptionOutcome; reason?: string }>;
  truncated: boolean;
}
export interface WorkflowPublicationReceipt {
  admittedBy?: import('./workflow-management.js').WorkflowManagementAdmission;
  publicationId: string;
  workflowCode: string;
  definitionVersion: number;
  bindingVersion: number;
  headRevision: number;
  scope: WorkflowPublicationScope;
  status: 'running' | 'completed' | 'paused' | 'superseded';
  counts: Partial<Record<WorkflowAdoptionOutcome, number>>;
  replayed?: boolean;
}

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function workflowDesignerTargets(node: Record<string, any>): string[] {
  if (node.kind === 'approval') return [node.onApprove, node.onReject];
  if (node.kind === 'parallel') return [...(node.branches || []).map((branch: any) => branch.target), node.join];
  if (node.kind === 'condition') return [...(node.branches || []).map((branch: any) => branch.target), node.otherwise];
  return 'next' in node ? [node.next] : [];
}

/** The canvas can route released capabilities; it cannot invent a business validator, page or handler. */
export function validateWorkflowDesignerCapabilities(base: WorkflowDefinition, next: WorkflowDefinition, baseBinding: WorkflowBinding, nextBinding: WorkflowBinding, options: { catalog?: WorkflowDesignerCatalog; allowIncomplete?: boolean } = {}): string[] {
  const errors: string[] = [...validateWorkflowReminders(next),...validateWorkflowSupervisorChains(next,nextBinding)];
  if (!record(next) || !record(next.nodes) || !record(nextBinding?.bindings)) return ['WORKFLOW_DESIGNER_DOCUMENT_INVALID'];
  const editable = new Set(['title', 'startAt', 'nodes', 'readability']);
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) if (!editable.has(key) && !same((base as any)[key], (next as any)[key])) errors.push(`WORKFLOW_DESIGNER_CODE_OWNED:${key}`);
  if (baseBinding.workflowCode !== nextBinding.workflowCode || baseBinding.schemaVersion !== nextBinding.schemaVersion) errors.push('WORKFLOW_DESIGNER_BINDING_IDENTITY');
  const catalog = options.catalog || workflowAuthoringCatalog(base, baseBinding);
  const steps = catalog.steps;
  for (const [id, node] of Object.entries(next.nodes)) {
    if (!record(node) || node.id !== id || !['approval', 'handle', 'condition', 'cc', 'action', 'correction', 'end', 'parallel', 'join'].includes(node.kind)) { errors.push(`WORKFLOW_DESIGNER_NODE_INVALID:${id}`); continue; }
    if ('taskPageCode' in node && node.taskPageCode && !catalog.taskPages[node.taskPageCode]) errors.push(`WORKFLOW_DESIGNER_PAGE_UNRELEASED:${id}`);
    if (node.kind === 'action' && !isWorkflowPlatformNotify(node) && !steps.some(step => same(step.handler, node.handler) && same(step.inputSchema, node.inputSchema) && same(step.outputSchema, node.outputSchema))) errors.push(`WORKFLOW_DESIGNER_STEP_UNRELEASED:${id}`);
    if (['approval','handle'].includes(node.kind) && 'allowedOperations' in node && node.allowedOperations && (!Array.isArray(node.allowedOperations) || !node.allowedOperations.includes(node.kind === 'handle' ? 'complete' : 'approve'))) errors.push(`WORKFLOW_DESIGNER_REQUIRED_ACTION:${id}.approve`);
    const original = base.nodes[id] || (node.kind === 'approval' || node.kind === 'handle' ? Object.values(base.nodes).find(template => {
      if (template.kind !== node.kind || !['approval','handle'].includes(template.kind) || !['fieldPolicy','administration','requiredOperations','taskPageCode'].every(key => same((template as any)[key],(node as any)[key]))) return false;
      const human = template as typeof node;
      if (node.mode !== human.mode && !human.administration?.modes?.includes(node.mode)) return false;
      const ranks = ['none','optional','required'];
      return Object.entries(human.operationPolicy || {}).every(([operation,policy]) => {
        const nextPolicy = node.operationPolicy?.[operation as keyof typeof node.operationPolicy];
        return same(policy?.minimumOpinion,nextPolicy?.minimumOpinion) && ranks.indexOf(workflowOperationOpinion(operation,nextPolicy)) >= ranks.indexOf(workflowOperationMinimumOpinion(operation,policy));
      });
    }) : undefined);
    if (!original && ['approval', 'handle', 'cc'].includes(node.kind)) { if ('binding' in node && node.binding !== workflowCanvasBindingKey(id)) errors.push(`WORKFLOW_DESIGNER_APPROVAL_TEMPLATE_REQUIRED:${id}`);else errors.push(...validateWorkflowCanvasHuman(node, catalog).map(error => `${error}:${id}`)); }
    if ((original?.kind === 'approval' || original?.kind === 'handle') && (node.kind === 'approval' || node.kind === 'handle')) {
      if (node.mode !== original.mode && !original.administration?.modes?.includes(node.mode)) errors.push(`WORKFLOW_DESIGNER_MODE_NOT_ALLOWED:${id}`);
      for (const key of ['requiredOperations', 'fieldPolicy', 'administration'] as const) if (!same(original[key], node[key])) errors.push(`WORKFLOW_DESIGNER_CODE_OWNED:${id}.${key}`);
      for (const operation of original.requiredOperations || []) if (node.allowedOperations && !node.allowedOperations.includes(operation)) errors.push(`WORKFLOW_DESIGNER_REQUIRED_ACTION:${id}.${operation}`);
      for (const [operation, policy] of Object.entries(original.operationPolicy || {})) {
        const nextPolicy = node.operationPolicy?.[operation as keyof typeof node.operationPolicy];
        const ranks = ['none','optional','required'];
        if (!same(policy?.minimumOpinion,nextPolicy?.minimumOpinion) || ranks.indexOf(workflowOperationOpinion(operation,nextPolicy)) < ranks.indexOf(workflowOperationMinimumOpinion(operation,policy))) errors.push(`WORKFLOW_DESIGNER_CODE_OWNED:${id}.${operation}.minimumOpinion`);
      }
    }
    if ('binding' in node && !nextBinding.bindings[node.binding]) errors.push(`WORKFLOW_DESIGNER_BINDING_MISSING:${id}`);
  }
  if (!same(base.readability?.logic, next.readability?.logic)) errors.push('WORKFLOW_DESIGNER_CODE_OWNED:readability.logic');
  for (const [key, entry] of Object.entries(nextBinding.bindings)) {
    const original = baseBinding.bindings[key];
    const owner = Object.values(next.nodes).find(node => 'binding' in node && node.binding === key && key === workflowCanvasBindingKey(node.id));
    if (!original && owner) errors.push(...validateWorkflowCanvasBinding(entry, catalog, options.allowIncomplete).map(error => `${error}:${key}`));
    else if (!original && !Object.values(baseBinding.bindings).some(value => same(value, entry))) errors.push(`WORKFLOW_DESIGNER_BINDING_UNRELEASED:${key}`);
    if (original && !same(original, entry)) errors.push(`WORKFLOW_DESIGNER_BINDING_CODE_OWNED:${key}`);
  }
  errors.push(...validateWorkflowDesignerDocument(next));
  return [...new Set(errors)];
}

export type WorkflowDesignerEdit =
  | { type: 'insert_parallel'; from: string; target: string; id: string; joinId: string; title: string; branches: Array<{ id: string; title: string; when?: WorkflowExpression }>; edge?: 'approve' | 'reject' | 'next' | 'default' | number }
  | { type: 'remove_parallel_branch'; nodeId: string; branchId: string }
  | { type: 'insert'; from: string; target: string; node: WorkflowNode; edge?: 'approve' | 'reject' | 'next' | 'default' | number }
  | { type: 'remove'; nodeId: string; reconnectTo?: string }
  | { type: 'node'; nodeId: string; patch: Record<string, unknown> }
  | { type: 'branch'; nodeId: string; index: number; when: WorkflowExpression; label?: string; target: string };

/** Semantic edits are independent of canvas coordinates and preserve stable existing ids. */
export function editWorkflowDesignerDefinition(source: WorkflowDefinition, edit: WorkflowDesignerEdit): WorkflowDefinition {
  if (edit.type === 'insert_parallel') {
    if (source.nodes[edit.joinId] || edit.joinId === edit.id || edit.branches.length < 2 || edit.branches.length > 8) throw new Error('WORKFLOW_DESIGNER_PARALLEL_INSERT_INVALID');
    const next = editWorkflowDesignerDefinition(source, { type: 'insert',from: edit.from,target: edit.target,node: { id: edit.id,kind: 'parallel',title: edit.title,join: edit.joinId,branches: edit.branches.map(branch => ({ ...branch,target: edit.joinId })) },...(edit.edge === undefined ? {} : { edge: edit.edge }) });
    next.nodes[edit.joinId] = { id: edit.joinId,kind: 'join',title: '全部完成后继续',parallel: edit.id,next: edit.target };
    return next;
  }
  const definition = structuredClone(source);
  const rewrite = (from: WorkflowNode, target: string, replacement: string) => {
    if (from.kind === 'approval') { if (from.onApprove === target) from.onApprove = replacement; if (from.onReject === target) from.onReject = replacement; }
    else if (from.kind === 'condition') { for (const branch of from.branches) if (branch.target === target) branch.target = replacement; if (from.otherwise === target) from.otherwise = replacement; }
    else if (from.kind === 'parallel') { for (const branch of from.branches) if (branch.target === target) branch.target = replacement; }
    else if ('next' in from && from.next === target) from.next = replacement;
  };
  if (edit.type === 'insert') {
    const from = definition.nodes[edit.from];
    if (!from || definition.nodes[edit.node.id] || !workflowDesignerTargets(from).includes(edit.target) || !definition.nodes[edit.target]) throw new Error('WORKFLOW_DESIGNER_INSERT_INVALID');
    definition.nodes[edit.node.id] = structuredClone(edit.node);
    if (from.kind === 'approval') {
      const key = edit.edge === 'reject' ? 'onReject' : 'onApprove';
      if (from[key] !== edit.target) throw new Error('WORKFLOW_DESIGNER_INSERT_EDGE_INVALID');
      from[key] = edit.node.id;
    } else if (from.kind === 'parallel') {
      if (typeof edit.edge !== 'number' || from.branches[edit.edge]?.target !== edit.target) throw new Error('WORKFLOW_DESIGNER_INSERT_EDGE_INVALID');
      from.branches[edit.edge]!.target = edit.node.id;
    } else if (from.kind === 'condition') {
      if (typeof edit.edge === 'number' && from.branches[edit.edge]?.target === edit.target) from.branches[edit.edge]!.target = edit.node.id;
      else if (edit.edge === 'default' && from.otherwise === edit.target) from.otherwise = edit.node.id;
      else throw new Error('WORKFLOW_DESIGNER_INSERT_EDGE_INVALID');
    } else if ('next' in from) from.next = edit.node.id;
    else throw new Error('WORKFLOW_DESIGNER_INSERT_EDGE_INVALID');
  } else if (edit.type === 'remove_parallel_branch') {
    const fork = definition.nodes[edit.nodeId];
    if (fork?.kind !== 'parallel' || fork.branches.length <= 2) throw new Error('WORKFLOW_PARALLEL_BRANCH_LIMIT');
    const region = inspectWorkflowParallel(definition).regions.find(region => region.parallelNodeId === fork.id);
    const branch = region?.branches.find(branch => branch.id === edit.branchId);
    if (!branch) throw new Error('WORKFLOW_DESIGNER_PARALLEL_BRANCH_MISSING');
    fork.branches = fork.branches.filter(branch => branch.id !== edit.branchId);
    for (const id of branch.nodeIds) delete definition.nodes[id];
  } else if (edit.type === 'remove') {
    const node = definition.nodes[edit.nodeId];
    if (node?.kind === 'parallel') {
      const join = definition.nodes[node.join];
      const region = inspectWorkflowParallel(definition).regions.find(region => region.parallelNodeId === node.id);
      if (join?.kind !== 'join' || !region) throw new Error('WORKFLOW_DESIGNER_PARALLEL_PAIR_INVALID');
      const removed = new Set([node.id,join.id,...region.branches.flatMap(branch => branch.nodeIds)]);
      for (const other of Object.values(definition.nodes)) if (!removed.has(other.id)) for (const id of removed) rewrite(other,id,join.next);
      for (const id of removed) delete definition.nodes[id];
      if (definition.startAt === node.id) definition.startAt = join.next;
      return definition;
    }
    const target = edit.reconnectTo || (node?.kind === 'approval' ? node.onApprove : node && 'next' in node ? node.next : undefined);
    if (!node || !target || target === node.id || !definition.nodes[target] || node.kind === 'end' || node.kind === 'correction' || node.kind === 'join') throw new Error('WORKFLOW_DESIGNER_REMOVE_INVALID');
    for (const other of Object.values(definition.nodes)) {
      rewrite(other, node.id, target);
      if ((other.kind === 'approval' || other.kind === 'handle') && other.returnTargets) other.returnTargets = other.returnTargets.filter(id => id !== node.id);
      if ((other.kind === 'approval' || other.kind === 'handle') && other.returnPolicy) other.returnPolicy.targets = other.returnPolicy.targets.filter(target => target.nodeId !== node.id);
    }
    if (definition.startAt === node.id) definition.startAt = target;
    delete definition.nodes[node.id];
  } else {
    const node = definition.nodes[edit.nodeId];
    if (!node) throw new Error('WORKFLOW_DESIGNER_NODE_MISSING');
    if (edit.type === 'node') {
      if ('id' in edit.patch || 'kind' in edit.patch) throw new Error('WORKFLOW_DESIGNER_NODE_ID_IMMUTABLE');
      Object.assign(node, edit.patch);
    } else {
      if (node.kind !== 'condition' || edit.index < 0 || edit.index > node.branches.length) throw new Error('WORKFLOW_DESIGNER_BRANCH_INVALID');
      node.branches[edit.index] = { when: structuredClone(edit.when), target: edit.target, ...(edit.label ? { label: edit.label } : {}) };
    }
  }
  return definition;
}

export interface WorkflowAdoptionState {
  currentNodeId?: string;
  activeNodeIds?: string[];
  forkNodeId?: string;
  unarrivedBranchIds?: string[];
  facts: Record<string, unknown>;
  returnTargetNodeIds?: string[];
  businessStepPending?: boolean;
  held?: boolean;
}
const pathValue = (value: Record<string, unknown>, path: string) => path.split('.').reduce<any>((current, part) => record(current) && Object.hasOwn(current, part) ? current[part] : undefined, value);
const matchesType = (value: unknown, type: string): boolean => type.includes(',') ? type.split(',').some(part => matchesType(value,part)) : type === 'unknown' ? true : type === 'null' ? value === null : type === 'number' || type === 'integer' ? typeof value === 'number' && Number.isFinite(value) && (type !== 'integer' || Number.isInteger(value)) : type === 'array' ? Array.isArray(value) : type === 'object' ? record(value) : typeof value === type;

/** Classification is pure; the caller locks and re-reads before applying a result. */
export function classifyWorkflowAdoption(source: WorkflowDefinition, target: WorkflowDefinition, state: WorkflowAdoptionState): { outcome: WorkflowAdoptionOutcome; reason?: string } {
  if (state.held) return { outcome: 'held', reason: '已指定保留在原版本' };
  const active = state.activeNodeIds?.length ? state.activeNodeIds : state.currentNodeId ? [state.currentNodeId] : [];
  if (!active.length) return { outcome: 'excepted', reason: '当前运行位置无法确定' };
  if (active.some(id => !target.nodes[id])) return { outcome: 'excepted', reason: '当前节点已被删除' };
  if (active.some(id => source.nodes[id]?.kind !== target.nodes[id]?.kind)) return { outcome: 'excepted', reason: '当前节点类型已改变' };
  if ((state.returnTargetNodeIds || []).some(id => !target.nodes[id])) return { outcome: 'excepted', reason: '正在退回的目标节点已被删除' };
  if (!same(source.subject, target.subject) || !same(source.inputSchema, target.inputSchema)) return { outcome: 'excepted', reason: '申请数据或变量定义已改变，需要明确的数据转换' };
  if (state.forkNodeId) {
    const from = source.nodes[state.forkNodeId], to = target.nodes[state.forkNodeId];
    if (from?.kind !== 'parallel' || to?.kind !== 'parallel' || from.join !== to.join) return { outcome: 'excepted', reason: '正在运行的并行分支或汇合点已改变' };
    const sourceRegion = inspectWorkflowParallel(source).regions.find(region => region.parallelNodeId === from.id);
    const targetRegion = inspectWorkflowParallel(target).regions.find(region => region.parallelNodeId === to.id);
    for (const id of state.unarrivedBranchIds || []) {
      const branch = targetRegion?.branches.find(branch => branch.id === id);
      if (!branch || active.some(node => sourceRegion?.branches.find(branch => branch.id === id)?.nodeIds.includes(node) && !branch.nodeIds.includes(node))) return { outcome: 'excepted', reason: '尚未完成的并行分支或其当前节点已改变' };
    }
  }
  if (state.businessStepPending) return { outcome: 'deferred', reason: '业务步骤执行中，完成后自动更新' };
  const reachable = new Set<string>(), pending = [...active];
  while (pending.length) { const id = pending.pop()!; if (reachable.has(id)) continue; reachable.add(id); pending.push(...workflowDesignerTargets(target.nodes[id] || {}).filter(id => !!target.nodes[id])); }
  const graph: WorkflowGraphProjection = projectWorkflowGraph(target, 'preview');
  for (const node of Object.values(target.nodes)) {
    if (!reachable.has(node.id)) continue;
    const expressions: WorkflowExpression[] = node.kind === 'condition' ? node.branches.map(branch => branch.when) : node.kind === 'action' ? Object.values(node.inputs).filter(input => input.source === 'fact').map(input => ({ op: 'path',path: (input as { path: string }).path })) : [];
    for (const expression of expressions) for (const path of workflowExpressionPaths(expression).paths) {
      const variable = graph.variables.find(variable => variable.path === path);
      const value = pathValue(state.facts, path);
      if (value === undefined && variable?.source.kind === 'step_output' && reachable.has(variable.source.nodeId) && !active.includes(variable.source.nodeId)) {
        const withoutProducer = new Set<string>(), queue = [...active];
        while (queue.length) { const id = queue.pop()!; if (id === variable.source.nodeId || withoutProducer.has(id)) continue; withoutProducer.add(id); queue.push(...workflowDesignerTargets(target.nodes[id] || {}).filter(id => !!target.nodes[id])); }
        if (!withoutProducer.has(node.id)) continue;
      }
      if (value === undefined && variable && !variable.required && (variable.source.kind !== 'step_output' || record(pathValue(state.facts,`steps.${variable.source.nodeId}`)))) continue;
      if (value === undefined || variable && !matchesType(value, variable.type)) return { outcome: 'excepted', reason: `后续条件需要的数据在该申请中不存在或类型不兼容：${variable?.label || path}` };
    }
  }
  return { outcome: 'eligible' };
}

/** Typed expression validation shared by canvas, AI proposals and publication. */
export function validateWorkflowDesignerDocument(definition: WorkflowDefinition): string[] {
  if (!record(definition?.nodes)) return ['WORKFLOW_DESIGNER_DOCUMENT_INVALID'];
  const errors: string[] = [];
  errors.push(...validateWorkflowParallel(definition), ...validateWorkflowHandlingNodes(definition), ...validateWorkflowReturnPolicies(definition), ...validateWorkflowReturnEligibility(definition), ...validateWorkflowPlatformNotify(definition));
  const nodes = Object.values(definition.nodes);
  if (nodes.length > 200 || !nodes.length) return ['WORKFLOW_DESIGNER_NODE_LIMIT'];
  for (const node of nodes) {
    if (!record(node) || !['approval','handle','condition','cc','action','correction','end','parallel','join'].includes(node.kind)) errors.push('WORKFLOW_DESIGNER_NODE_INVALID');
    else if (node.kind === 'condition' && (!Array.isArray(node.branches) || !node.branches.length || node.branches.length > 32 || node.branches.some(branch => !record(branch) || !record(branch.when) || typeof branch.target !== 'string'))) errors.push(`WORKFLOW_DESIGNER_BRANCH_INVALID:${node.id}`);
  }
  if (errors.length) return [...new Set(errors)];
  const variables = projectWorkflowGraph(definition, 'draft').variables;
  let expressionCount = 0;
  const expressionType = (expression: WorkflowExpression, nodeId: string, depth = 0): string => {
    if (!record(expression) || depth > 16 || ++expressionCount > 4096) { errors.push(`WORKFLOW_DESIGNER_EXPRESSION_LIMIT:${nodeId}`); return 'invalid'; }
    if (expression.op === 'literal') {
      const value = expression.value;
      return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value;
    }
    if (expression.op === 'path') {
      const variable = variables.find(item => item.path === expression.path);
      if (!variable || variable.type === 'unknown') errors.push(`WORKFLOW_DESIGNER_VARIABLE_UNKNOWN:${nodeId}:${expression.path}`);
      const type = variable?.type.split(',').find(type => type !== 'null') || variable?.type || 'unknown';
      return type === 'integer' ? 'number' : type;
    }
    if (expression.op === 'and' || expression.op === 'or') {
      if (!Array.isArray(expression.values) || expression.values.length < 1 || expression.values.length > 32) { errors.push(`WORKFLOW_DESIGNER_CONDITION_GROUP:${nodeId}`); return 'invalid'; }
      for (const value of expression.values) if (expressionType(value, nodeId, depth + 1) !== 'boolean') errors.push(`WORKFLOW_DESIGNER_CONDITION_BOOLEAN:${nodeId}`);
    } else if (expression.op === 'not' || expression.op === 'exists') {
      const type = expressionType(expression.value, nodeId, depth + 1);
      if (expression.op === 'not' && type !== 'boolean') errors.push(`WORKFLOW_DESIGNER_CONDITION_BOOLEAN:${nodeId}`);
    } else if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'].includes(expression.op) && 'left' in expression) {
      const left = expressionType(expression.left, nodeId, depth + 1), right = expressionType(expression.right, nodeId, depth + 1);
      const compatible = expression.op === 'in' ? right === 'array' : expression.op === 'contains' ? left === 'array' || left === 'string' && right === 'string' : ['gt', 'gte', 'lt', 'lte'].includes(expression.op) ? left === right && ['number', 'string'].includes(left) : left === right || left === 'null' || right === 'null';
      if (!compatible) errors.push(`WORKFLOW_DESIGNER_CONDITION_TYPE:${nodeId}`);
    } else errors.push(`WORKFLOW_DESIGNER_CONDITION_OPERATOR:${nodeId}`);
    return 'boolean';
  };
  const completed = new Set<string>(), active = new Set<string>();
  const walk = (id: string) => {
    if (active.has(id)) { errors.push(`WORKFLOW_DESIGNER_CYCLE:${id}`); return; }
    if (completed.has(id)) return;
    const node = definition.nodes[id];
    if (!node) { errors.push(`WORKFLOW_DESIGNER_TARGET_MISSING:${id}`); return; }
    active.add(id);
    for (const target of workflowDesignerTargets(node)) walk(target);
    active.delete(id); completed.add(id);
  };
  for (const node of nodes) {
    if (!/^[a-z][a-z0-9_-]{0,127}$/.test(node.id) || definition.nodes[node.id] !== node) errors.push(`WORKFLOW_DESIGNER_NODE_ID:${node.id}`);
    if (node.kind === 'parallel') for (const branch of node.branches) if (branch.when && expressionType(branch.when, node.id) !== 'boolean') errors.push(`WORKFLOW_DESIGNER_CONDITION_BOOLEAN:${node.id}`);
    if (node.kind === 'condition') {
      if (!node.branches.length || node.branches.length > 32) errors.push(`WORKFLOW_DESIGNER_BRANCH_LIMIT:${node.id}`);
      for (const branch of node.branches) if (expressionType(branch.when, node.id) !== 'boolean') errors.push(`WORKFLOW_DESIGNER_CONDITION_BOOLEAN:${node.id}`);
    }
  }
  walk(definition.startAt);
  // Unreachable correction nodes are intentional return destinations; other orphan nodes are invalid.
  for (const node of nodes) if (!completed.has(node.id) && node.kind !== 'correction') errors.push(`WORKFLOW_DESIGNER_UNREACHABLE:${node.id}`);
  return [...new Set(errors)];
}

/** Enumerate all typed fact leaves, including fields not used in an existing branch. */
export function workflowDesignerVariables(definition: WorkflowDefinition) {
  const labels = { ...definition.readability?.variables };
  const add = (schema: any, prefix = '', depth = 0) => {
    if (depth > 8 || !record(schema)) return;
    if (schema.type === 'object' && record(schema.properties)) for (const [key, child] of Object.entries(schema.properties)) add(child, prefix ? `${prefix}.${key}` : key, depth + 1);
    else if (prefix) labels[prefix] ||= { label: String(schema.title || prefix) };
  };
  add(definition.inputSchema);
  for (const node of Object.values(definition.nodes)) if (node.kind === 'action') add(node.outputSchema, `steps.${node.id}`);
  return projectWorkflowGraph({ ...definition, readability: { ...definition.readability, variables: labels } }, 'draft').variables.filter(variable => variable.type !== 'unknown');
}
