/** Pure read projection. It never evaluates expressions, executes code or edits topology. */
import type { WorkflowCompletionDeadline } from './workflow-completion-deadline.js';
import type { WorkflowApprovedDelegationPolicy } from './workflow-approved-delegation.js';
import { workflowBusinessStepFactSchema, type WorkflowBusinessStepInput } from './workflow-business-step.js';
export interface WorkflowReadability {
  variables?: Record<string, { label: string; unit?: string; description?: string }>;
  logic?: Array<{
    code: string;
    title: string;
    description: string;
    phase: 'submission' | 'node_input' | 'completion';
    nodeId?: string;
    inputPaths: string[];
    outputPaths?: string[];
    source?: { path: string; symbol?: string; digest: string };
  }>;
}

export type WorkflowGraphExpression =
  | { op: 'literal'; value: unknown }
  | { op: 'path'; path: string }
  | { op: 'and' | 'or'; values: WorkflowGraphExpression[] }
  | { op: 'not' | 'exists'; value: WorkflowGraphExpression }
  | { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'; left: WorkflowGraphExpression; right: WorkflowGraphExpression };

export interface WorkflowGraphDefinitionSource {
  code: string;
  title: string;
  startAt: string;
  inputSchema: Record<string, unknown>;
  subject?: { resourceCode: string; factProjection: Record<string, string> };
  readability?: WorkflowReadability;
  approvedDelegation?: WorkflowApprovedDelegationPolicy;
  nodes: Record<string, {
    id: string;
    kind: string;
    title?: string;
    binding?: string;
    mode?: string;
    onApprove?: string;
    onReject?: string;
    branches?: Array<{ when: WorkflowGraphExpression; target: string; label?: string }>;
    otherwise?: string;
    next?: string;
    emptyPolicy?: 'block' | 'skip';
    initiatorApprovalPolicy?: 'manual' | 'auto_approve';
    completionDeadline?: WorkflowCompletionDeadline;
    notify?: boolean;
    outcome?: string;
    handler?: { code: string; version: number; mode: 'pure' | 'reconciled-effect' };
    inputs?: Record<string, WorkflowBusinessStepInput>;
    outputSchema?: Record<string, unknown>;
  }>;
}

export interface WorkflowGraphVariable {
  path: string;
  label: string;
  type: string;
  unit?: string;
  description?: string;
  required: boolean;
  source: { kind: 'subject_field'; resourceCode: string; fieldPath: string } | { kind: 'step_output'; nodeId: string; handlerCode: string; handlerVersion: number } | { kind: 'input' | 'unknown' };
  usedBy: string[];
}

export interface WorkflowGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: 'approve' | 'reject' | 'branch' | 'default' | 'next';
  label: string;
  priority?: number;
  expression?: WorkflowGraphExpression;
  variablePaths: string[];
}

export interface WorkflowGraphProjection {
  schemaVersion: 'openxiangda.workflow-graph/v2';
  workflowCode: string;
  definitionDigest: string;
  startAt: string;
  fixedTopology: true;
  branchStrategy: 'first_match';
  nodes: Array<{ id: string; kind: string; title: string; binding?: string; mode?: string; outcome?: string; emptyPolicy?: 'block' | 'skip'; initiatorApprovalPolicy?: 'manual' | 'auto_approve'; completionDeadline?: WorkflowCompletionDeadline; notify?: boolean;
    businessStep?: { handler: NonNullable<WorkflowGraphDefinitionSource['nodes'][string]['handler']>; inputs: Record<string, WorkflowBusinessStepInput>; outputPaths: string[] } }>;
  edges: WorkflowGraphEdge[];
  variables: WorkflowGraphVariable[];
  logic: NonNullable<WorkflowReadability['logic']>;
  diagnostics: Array<{ code: string; path: string }>;
}

export interface WorkflowGraphVisit {
  id: string;
  nodeId: string;
  status: string;
  enteredAt: string | null;
  leftAt: string | null;
  matchedBranch?: number;
  target?: string;
  /** Recorded terminal decision; chronological adjacency alone is not execution evidence. */
  transition?: 'approve' | 'reject' | 'next';
  skipped?: boolean;
  automaticApprovals?: Array<{ participantId: string; assignmentId: string; initiatorUserId: string; roleSubjectKey: string | null }>;
  completionDeadline?: { deadlineId: string; deadlineAt: string; rule: WorkflowCompletionDeadline };
  notificationRequested?: boolean;
  configuration?: Record<string, unknown>;
  businessStep?: import('./workflow-business-step.js').WorkflowBusinessStepSummary;
  people?: Array<{ userId: string | null; displayName: string; status?: string }>;
}

export interface WorkflowGraphReadResult {
  schemaVersion: 'openxiangda.workflow-definition-projection/v2';
  appCode: string;
  workflowCode: string;
  version: number;
  definitionDigest: string;
  graph: WorkflowGraphProjection;
}

export interface WorkflowInstanceGraphReadResult extends WorkflowGraphReadResult {
  instanceId: string;
  instanceSequence: number;
  environmentKey: string;
  status: string;
  visits: WorkflowGraphVisit[];
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number) => typeof value === 'string' && Boolean(value.trim()) && value.length <= max;
const pathPattern = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*){0,15}$/;
const safePath = (path: unknown): path is string => typeof path === 'string' && path.length <= 256 && pathPattern.test(path) &&
  !path.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part));

function schemaPath(schema: Record<string, unknown>, path: string) {
  let current = record(schema);
  let required = true;
  for (const segment of path.split('.')) {
    required &&= Array.isArray(current.required) && current.required.includes(segment);
    const next = record(current.properties)[segment];
    if (!next || typeof next !== 'object') return null;
    current = record(next);
  }
  return { schema: current, required };
}

/** Bounded traversal is also used by compiler diagnostics for untrusted declarations. */
export function workflowExpressionPaths(expression: unknown) {
  const paths = new Set<string>();
  const errors: string[] = [];
  let budget = 2048;
  const visit = (value: unknown, depth: number) => {
    if (--budget < 0 || depth > 20) { errors.push('WORKFLOW_EXPRESSION_BUDGET_EXCEEDED'); return; }
    const item = record(value);
    if (item.op === 'path') {
      if (safePath(item.path)) paths.add(item.path);
      else errors.push('WORKFLOW_EXPRESSION_PATH_INVALID');
    } else if (item.op === 'literal') return;
    else if (item.op === 'and' || item.op === 'or') {
      if (!Array.isArray(item.values) || !item.values.length || item.values.length > 128) errors.push('WORKFLOW_EXPRESSION_GROUP_INVALID');
      else for (const part of item.values) { if (budget < 0) break; visit(part, depth + 1); }
    } else if (item.op === 'not' || item.op === 'exists') visit(item.value, depth + 1);
    else if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'].includes(String(item.op))) {
      visit(item.left, depth + 1); visit(item.right, depth + 1);
    } else errors.push('WORKFLOW_EXPRESSION_OPERATOR_INVALID');
  };
  visit(expression, 0);
  return { paths: [...paths], errors: [...new Set(errors)] };
}

export function validateWorkflowReadability(definition: WorkflowGraphDefinitionSource): string[] {
  if (definition?.readability === undefined) return [];
  const errors: string[] = [];
  const factsSchema = workflowBusinessStepFactSchema(definition);
  const info = record(definition.readability);
  if (Object.keys(info).some(key => !['variables', 'logic'].includes(key)) || !Object.keys(info).length) errors.push('WORKFLOW_READABILITY_INVALID');
  const variables = record(info.variables);
  if (info.variables !== undefined && (typeof info.variables !== 'object' || Array.isArray(info.variables) || info.variables === null)) errors.push('WORKFLOW_VARIABLES_INVALID');
  if (Object.keys(variables).length > 128) errors.push('WORKFLOW_VARIABLE_LIMIT_EXCEEDED');
  for (const [path, value] of Object.entries(variables)) {
    const variable = record(value);
    if (!safePath(path) || !schemaPath(factsSchema, path)) errors.push(`WORKFLOW_VARIABLE_SOURCE_UNKNOWN:${path}`);
    if (!text(variable.label, 160) || Object.keys(variable).some(key => !['label', 'unit', 'description'].includes(key)) ||
      variable.unit !== undefined && !text(variable.unit, 32) || variable.description !== undefined && !text(variable.description, 2000)) errors.push(`WORKFLOW_VARIABLE_METADATA_INVALID:${path}`);
  }
  const logic = info.logic === undefined ? [] : info.logic;
  if (!Array.isArray(logic) || logic.length > 32) errors.push('WORKFLOW_LOGIC_LIMIT_INVALID');
  const codes = new Set<string>();
  for (const value of Array.isArray(logic) ? logic.slice(0, 32) : []) {
    const item = record(value), code = String(item.code || '');
    if (definition.approvedDelegation && code === 'kernel-approved-delegation') errors.push('WORKFLOW_LOGIC_PLATFORM_CODE_RESERVED');
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(code) || codes.has(code) || !text(item.title, 160) || !text(item.description, 4000) ||
      Object.keys(item).some(key => !['code', 'title', 'description', 'phase', 'nodeId', 'inputPaths', 'outputPaths', 'source'].includes(key))) errors.push(`WORKFLOW_LOGIC_METADATA_INVALID:${code}`);
    codes.add(code);
    if (!['submission', 'node_input', 'completion'].includes(String(item.phase)) ||
      item.phase === 'node_input' && !record(definition.nodes)[String(item.nodeId)] || item.phase !== 'node_input' && item.nodeId !== undefined) errors.push(`WORKFLOW_LOGIC_ANCHOR_INVALID:${code}`);
    for (const key of ['inputPaths', 'outputPaths']) {
      const values = item[key];
      if (key === 'outputPaths' && values === undefined) continue;
      if (!Array.isArray(values) || values.length > 32 || new Set(values).size !== values.length) errors.push(`WORKFLOW_LOGIC_PATHS_INVALID:${code}:${key}`);
      else for (const path of values) if (!safePath(path) || !schemaPath(factsSchema, path)) errors.push(`WORKFLOW_LOGIC_SOURCE_UNKNOWN:${code}:${String(path)}`);
    }
    if (item.source !== undefined) {
      const source = record(item.source);
      if (!text(source.path, 256) || String(source.path).startsWith('/') || String(source.path).includes('..') || String(source.path).includes('://') ||
        !/^sha256:[a-f0-9]{64}$/.test(String(source.digest)) || source.symbol !== undefined && !text(source.symbol, 160) ||
        Object.keys(source).some(key => !['path', 'symbol', 'digest'].includes(key))) errors.push(`WORKFLOW_LOGIC_SOURCE_REFERENCE_INVALID:${code}`);
    }
  }
  for (const raw of Object.values(record(definition.nodes))) {
    const node = record(raw);
    const branches = Array.isArray(node.branches) ? node.branches : [];
    for (const branch of branches as NonNullable<WorkflowGraphDefinitionSource['nodes'][string]['branches']>) {
    const expression = workflowExpressionPaths(branch.when);
    errors.push(...expression.errors.map(error => `${error}:${node.id}`));
    for (const path of expression.paths) if (!schemaPath(factsSchema, path)) errors.push(`WORKFLOW_VARIABLE_SOURCE_UNKNOWN:${node.id}:${path}`);
    }
  }
  return [...new Set(errors)];
}

export function projectWorkflowGraph(definition: WorkflowGraphDefinitionSource, definitionDigest: string): WorkflowGraphProjection {
  const factsSchema = workflowBusinessStepFactSchema(definition);
  const edges: WorkflowGraphEdge[] = [];
  const used = new Map<string, Set<string>>();
  const diagnostics: WorkflowGraphProjection['diagnostics'] = [];
  for (const node of Object.values(definition.nodes)) {
    if (node.kind === 'approval') {
      for (const [kind, target, label] of [['approve', node.onApprove, '同意'], ['reject', node.onReject, '拒绝']] as const)
        if (target) edges.push({ id: `${node.id}:${kind}`, from: node.id, to: target, kind, label, variablePaths: [] });
    }
    if (node.kind === 'cc' && node.next) edges.push({ id: `${node.id}:next`, from: node.id, to: node.next, kind: 'next', label: '抄送后继续', variablePaths: [] });
    if (node.kind === 'action' && node.next) {
      const paths = Object.values(node.inputs || {}).flatMap(input => input.source === 'fact' ? [input.path] : []);
      for (const path of paths) { if (!used.has(path)) used.set(path, new Set()); used.get(path)!.add(node.id); }
      edges.push({ id: `${node.id}:next`, from: node.id, to: node.next, kind: 'next', label: '成功回执后继续', variablePaths: paths });
    }
    if (node.kind === 'condition') {
      for (const [index, branch] of (node.branches || []).entries()) {
        const expression = workflowExpressionPaths(branch.when);
        for (const path of expression.paths) { if (!used.has(path)) used.set(path, new Set()); used.get(path)!.add(node.id); }
        edges.push({ id: `${node.id}:branch:${index}`, from: node.id, to: branch.target, kind: 'branch', label: branch.label || `条件 ${index + 1}`, priority: index + 1, expression: branch.when, variablePaths: expression.paths });
        diagnostics.push(...expression.errors.map(code => ({ code, path: node.id })));
      }
      if (node.otherwise) edges.push({ id: `${node.id}:default`, from: node.id, to: node.otherwise, kind: 'default', label: '均不满足时', variablePaths: [] });
    }
  }
  const logic: NonNullable<WorkflowReadability['logic']> = [...definition.readability?.logic || []];
  if (definition.approvedDelegation) {
    const policy = definition.approvedDelegation;
    const confirmer = policy.confirmer === 'initiator' ? '申请人本人' : '所选代理人';
    logic.push({ code: 'kernel-approved-delegation', title: '批准后整批授权代理', phase: 'completion',
      inputPaths: [policy.requestsField],
      description: `批准时核验${confirmer}在当前退回周期完成“${definition.nodes[policy.confirmationNodeId]?.title || policy.confirmationNodeId}”的人工确认；随后重新核验双方当前账号、职责、修订、范围与完整有效期，整批授权（最多${policy.maxRequests}行）。任一行失败，批准与全部授权一起回滚；原命令恢复不重新激活已撤销授权。` });
  }
  const variablePaths = new Set([...used.keys(), ...Object.keys(definition.readability?.variables || {}), ...logic.flatMap(item => [...item.inputPaths, ...item.outputPaths || []])]);
  const variables = [...variablePaths].slice(0, 128).map(path => {
    const resolved = schemaPath(factsSchema, path), metadata = definition.readability?.variables?.[path];
    const segments = path.split('.'), field = definition.subject?.factProjection[segments[0]!];
    const producer = segments[0] === 'steps' ? definition.nodes[segments[1]!] : undefined;
    if (!resolved) diagnostics.push({ code: 'WORKFLOW_VARIABLE_SOURCE_UNKNOWN', path });
    return { path, label: metadata?.label || String(resolved?.schema.title || path), type: String(resolved?.schema.type || 'unknown'),
      ...metadata, required: resolved?.required || false, usedBy: [...used.get(path) || []],
      source: resolved && producer?.handler ? { kind: 'step_output' as const, nodeId: producer.id, handlerCode: producer.handler.code, handlerVersion: producer.handler.version } : resolved && field && definition.subject ? { kind: 'subject_field' as const, resourceCode: definition.subject.resourceCode, fieldPath: [field, ...segments.slice(1)].join('.') } : { kind: resolved ? 'input' as const : 'unknown' as const } };
  });
  return { schemaVersion: 'openxiangda.workflow-graph/v2', workflowCode: definition.code, definitionDigest, startAt: definition.startAt,
    fixedTopology: true, branchStrategy: 'first_match', nodes: Object.values(definition.nodes).map(node => ({ id: node.id, kind: node.kind, title: node.title || node.id,
      ...(node.binding ? { binding: node.binding } : {}), ...(node.mode ? { mode: node.mode } : {}), ...(node.outcome ? { outcome: node.outcome } : {}),
      ...(node.kind === 'cc' ? { emptyPolicy: node.emptyPolicy, notify: node.notify !== false } : {}),
      ...(node.kind === 'approval' ? { emptyPolicy: node.emptyPolicy || 'block', initiatorApprovalPolicy: node.initiatorApprovalPolicy || 'manual', ...(node.completionDeadline ? { completionDeadline: { ...node.completionDeadline } } : {}) } : {}),
      ...(node.kind === 'action' && node.handler ? { businessStep: { handler: node.handler, inputs: node.inputs || {}, outputPaths: Object.keys(record(node.outputSchema).properties || {}).map(key => `steps.${node.id}.${key}`) } } : {}) })), edges, variables,
    logic, diagnostics };
}

export function formatWorkflowExpression(expression: WorkflowGraphExpression, variables: readonly WorkflowGraphVariable[] = [], depth = 0): string {
  if (!expression || depth > 20) return '无法识别的条件';
  if (expression.op === 'path') return variables.find(variable => variable.path === expression.path)?.label || expression.path;
  if (expression.op === 'literal') return JSON.stringify(expression.value) ?? '缺值';
  if (expression.op === 'and' || expression.op === 'or') return expression.values.slice(0, 128).map(item => `（${formatWorkflowExpression(item, variables, depth + 1)}）`).join(expression.op === 'and' ? ' 且 ' : ' 或 ');
  if (expression.op === 'not' || expression.op === 'exists') return `${expression.op === 'not' ? '不满足' : '存在'}（${formatWorkflowExpression(expression.value, variables, depth + 1)}）`;
  if (!('left' in expression)) return '无法识别的条件';
  const labels = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: '属于', contains: '包含' };
  const leftPath = expression.left.op === 'path' ? expression.left.path : undefined;
  const unit = leftPath && expression.right.op === 'literal' && typeof expression.right.value === 'number'
    ? variables.find(variable => variable.path === leftPath)?.unit : undefined;
  return `${formatWorkflowExpression(expression.left, variables, depth + 1)} ${labels[expression.op]} ${formatWorkflowExpression(expression.right, variables, depth + 1)}${unit ? ` ${unit}` : ''}`;
}
