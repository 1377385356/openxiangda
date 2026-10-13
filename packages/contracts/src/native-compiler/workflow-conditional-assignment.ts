import type { WorkflowBinding, WorkflowBindingEntry, WorkflowStandardBindingEntry, WorkflowDefinition, WorkflowExpression } from '../types.js';
import { evaluateWorkflowExpression } from './workflow-expression.js';
import { validateWorkflowRoleInputSelection, validateWorkflowRoleUnion } from './workflow-role-union.js';
import { validateWorkflowSupervisorChainBinding, validateWorkflowSupervisorChains } from './workflow-supervisor-chain.js';
import { validateWorkflowAssignmentRoutingPolicy } from './workflow-assignment-routing.js';
import { workflowStandardBindingEntrySchema } from './workflow-standard-binding-schema.js';

export { WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_CASES, WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_BYTES, WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS, workflowConditionalAssignmentSchema } from './workflow-conditional-assignment-schema.js';
import { WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_CASES, WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_BYTES, WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS } from './workflow-conditional-assignment-schema.js';
export type WorkflowConditionalAssignmentLeaf = WorkflowStandardBindingEntry & {
  provider: typeof WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS[number];
};
/** Canonical code-owned declaration. Target platforms must explicitly advertise support. */
export interface WorkflowConditionalAssignment extends Partial<Record<Exclude<keyof WorkflowStandardBindingEntry, 'provider'>, never>> {
  provider: 'conditional';
  cases: Array<{ label?: string; when: WorkflowExpression; assignee: WorkflowConditionalAssignmentLeaf }>;
  otherwise: WorkflowConditionalAssignmentLeaf;
}
export interface WorkflowConditionalAssignmentContext {
  definition: WorkflowDefinition;
  nodeId: string;
  /** Supplied by the active AppVersion owner, never a browser's catalogue. */
  releasedSources: Record<string, WorkflowStandardBindingEntry>;
  /** Supplied by the immutable published definition owner. */
  frozenDefault?: WorkflowBindingEntry | WorkflowConditionalAssignment;
  standardProviders: readonly ('fixed_users' | 'app_role' | 'app_role_in_scope')[];
  scopeDimensions?: readonly string[];
}
const leafSchema = workflowStandardBindingEntrySchema;
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value: object, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const text = (value: unknown, max: number) => typeof value === 'string' && !!value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const path = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,254}$/.test(value) &&
  value.split('.').every(part => !!part && !['__proto__', 'prototype', 'constructor'].includes(part));
const role = (value: unknown) => typeof value === 'string' && value.length <= 128 && /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value);

/** Bound JSON before inspecting AST/leaves; cycles, accessors and non-JSON values are refused. */
function boundedJson(value: unknown): boolean {
  let budget = 4096;
  const visit = (item: unknown, depth: number): boolean => {
    if (--budget < 0 || depth > 24) return false;
    if (item === null || ['string', 'boolean'].includes(typeof item)) return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (Array.isArray(item)) return item.length <= 200 && item.every(child => visit(child, depth + 1));
    return record(item) && Object.keys(item).every(key => !['__proto__', 'prototype', 'constructor'].includes(key) &&
      Object.getOwnPropertyDescriptor(item, key)?.get === undefined && visit(item[key], depth + 1));
  };
  try { return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_BYTES; }
  catch { return false; }
}
const semantic = (value: unknown): string => {
  const sort = (item: any): any => Array.isArray(item) ? item.map(sort) : record(item) ?
    Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item;
  return JSON.stringify(sort(value));
};

function leafErrors(entry: unknown, allowIncomplete = false): string[] {
  if (!record(entry) || !WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS.includes(entry.provider) ||
      !keys(entry, Object.keys(leafSchema.properties))) return ['WORKFLOW_CONDITIONAL_LEAF_INVALID'];
  const errors = [...validateWorkflowSupervisorChainBinding(entry), ...validateWorkflowRoleUnion(entry), ...validateWorkflowRoleInputSelection(entry)];
  const providerFields: Record<string, string[]> = {
    fixed_users: ['users'], app_role: ['roleCode', 'roleCodes', 'selectedInputPath', 'routing'],
    app_role_in_scope: ['roleCode', 'roleCodes', 'scope', 'selectedInputPath', 'routing'],
    supervisor_chain: ['from', 'until', 'continuous', 'missing'],
    form_field_users: ['inputPath', 'candidateField'], input_users: ['inputPath'],
    initiator: [], previous_node_actor: [], business_relation: ['relationCode', 'resourceCode', 'resourceIdFrom'],
  };
  if (!keys(entry, ['provider', 'min', 'max', 'delegatable', ...providerFields[entry.provider]!])) errors.push('WORKFLOW_CONDITIONAL_LEAF_FIELDS_INVALID');
  if (entry.routing !== undefined) errors.push(...validateWorkflowAssignmentRoutingPolicy(entry.routing));
  if (['min', 'max'].some(key => entry[key] !== undefined && (!Number.isInteger(entry[key]) || entry[key] < 1 || entry[key] > 200)) ||
      (entry.min ?? 1) > (entry.max ?? 200) || entry.delegatable !== undefined && typeof entry.delegatable !== 'boolean') errors.push('WORKFLOW_CONDITIONAL_LEAF_BOUNDS_INVALID');
  if (entry.provider === 'fixed_users' && (!Array.isArray(entry.users) || (!allowIncomplete && !entry.users.length) || entry.users.length > 200 ||
      new Set(entry.users).size !== entry.users.length || entry.users.some((id: unknown) => !text(id, 255)))) errors.push('WORKFLOW_CONDITIONAL_USERS_INVALID');
  if (['app_role', 'app_role_in_scope'].includes(entry.provider) && entry.roleCodes === undefined && !(allowIncomplete && entry.roleCode === undefined) && !role(entry.roleCode)) errors.push('WORKFLOW_CONDITIONAL_ROLE_INVALID');
  if (entry.provider === 'app_role_in_scope' && (!record(entry.scope) || !keys(entry.scope, ['dimension', 'value', 'valueFrom']) || !role(entry.scope.dimension) ||
      !(text(entry.scope.value, 255) && entry.scope.valueFrom === undefined || path(entry.scope.valueFrom) && entry.scope.value === undefined))) errors.push('WORKFLOW_CONDITIONAL_SCOPE_INVALID');
  if (['input_users', 'form_field_users'].includes(entry.provider) && !path(entry.inputPath)) errors.push('WORKFLOW_CONDITIONAL_INPUT_PATH_INVALID');
  if (entry.provider === 'business_relation' && (!role(entry.relationCode) || !role(entry.resourceCode) || !path(entry.resourceIdFrom))) errors.push('WORKFLOW_CONDITIONAL_RELATION_INVALID');
  return errors;
}

/** One bounded iterator for future role, capability, principal and source-sync consumers. No recursion. */
export function workflowAssignmentLeaves(entry: WorkflowBindingEntry | WorkflowConditionalAssignment): WorkflowStandardBindingEntry[] {
  if (entry.provider !== 'conditional') return [entry];
  if (validateWorkflowConditionalAssignmentShape(entry).length) throw new Error('WORKFLOW_CONDITIONAL_BINDING_INVALID');
  return [...entry.cases.map(rule => rule.assignee), entry.otherwise];
}

/** Code-owned defaults establish their own ceiling; administrator edits do not. */
export function validateWorkflowConditionalBindingDefinition(definition: WorkflowDefinition, binding: WorkflowBinding): string[] {
  const errors: string[] = [];
  for (const [key, entry] of Object.entries(binding.bindings)) {
    if (entry.provider !== 'conditional') continue;
    const shape = validateWorkflowConditionalAssignmentShape(entry);
    if (shape.length) { errors.push(...shape.map(error => `${error}:${key}`)); continue; }
    for (const node of Object.values(definition.nodes)) {
      if (!('binding' in node) || node.binding !== key) continue;
      errors.push(...validateWorkflowConditionalAssignment(entry, {
        definition, nodeId: node.id, frozenDefault: entry, releasedSources: {}, standardProviders: [],
      }).map(error => `${error}:${key}:${node.id}`));
    }
  }
  return [...new Set(errors)];
}

/** For flat-only validators with no graph semantics (routing, roles and field candidates). */
export function workflowAssignmentLeafBinding(binding: WorkflowBinding): { bindings: Record<string, WorkflowStandardBindingEntry> } {
  return { bindings: Object.fromEntries(Object.entries(binding.bindings).flatMap(([key, entry]) =>
    entry.provider === 'conditional'
      ? workflowAssignmentLeaves(entry).map((leaf, index) => [`${key}/leaves/${index}`, leaf] as const)
      : [[key, entry] as const])) };
}

function expressionErrors(value: unknown, depth = 0, budget = { remaining: 1024 }): string[] {
  if (--budget.remaining < 0 || depth > 20) return ['WORKFLOW_CONDITIONAL_EXPRESSION_LIMIT'];
  if (!record(value)) return ['WORKFLOW_CONDITIONAL_EXPRESSION_INVALID'];
  const child = (item: unknown) => expressionErrors(item, depth + 1, budget);
  if (value.op === 'literal') return keys(value, ['op', 'value']) && Object.hasOwn(value, 'value') ? [] : ['WORKFLOW_CONDITIONAL_EXPRESSION_INVALID'];
  if (value.op === 'path') return keys(value, ['op', 'path']) && path(value.path) ? [] : ['WORKFLOW_CONDITIONAL_PATH_INVALID'];
  if (['and', 'or'].includes(value.op)) return keys(value, ['op', 'values']) && Array.isArray(value.values) && value.values.length > 0 && value.values.length <= 128 ? value.values.flatMap(child) : ['WORKFLOW_CONDITIONAL_EXPRESSION_INVALID'];
  if (value.op === 'exists') return keys(value, ['op', 'value']) && record(value.value) && value.value.op === 'path' ? child(value.value) : ['WORKFLOW_CONDITIONAL_EXISTS_PATH_REQUIRED'];
  if (value.op === 'not') return keys(value, ['op', 'value']) ? child(value.value) : ['WORKFLOW_CONDITIONAL_EXPRESSION_INVALID'];
  if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'].includes(value.op) && keys(value, ['op', 'left', 'right'])) return [...child(value.left), ...child(value.right)];
  return ['WORKFLOW_CONDITIONAL_EXPRESSION_INVALID'];
}

/** Shape only. Authority, graph/schema and current principals are additional gates. */
export function validateWorkflowConditionalAssignmentShape(value: unknown, options: { allowIncomplete?: boolean } = {}): string[] {
  if (!boundedJson(value)) return ['WORKFLOW_CONDITIONAL_BINDING_LIMIT'];
  if (!record(value) || value.provider !== 'conditional' || !keys(value, ['provider', 'cases', 'otherwise']) ||
      !Array.isArray(value.cases) || value.cases.length < 1 || value.cases.length > WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_CASES) return ['WORKFLOW_CONDITIONAL_BINDING_INVALID'];
  const errors: string[] = [];
  for (const [index, rule] of value.cases.entries()) {
    if (!record(rule) || !keys(rule, ['label', 'when', 'assignee']) || rule.label !== undefined && !text(rule.label, 160)) { errors.push(`WORKFLOW_CONDITIONAL_CASE_INVALID:${index}`); continue; }
    errors.push(...expressionErrors(rule.when).map(error => `${error}:${index}`), ...leafErrors(rule.assignee, options.allowIncomplete).map(error => `${error}:${index}`));
  }
  errors.push(...leafErrors(value.otherwise, options.allowIncomplete).map(error => `${error}:otherwise`));
  return [...new Set(errors)];
}

function targets(node: WorkflowDefinition['nodes'][string]): string[] {
  switch (node.kind) {
    case 'approval': return [node.onApprove, node.onReject];
    case 'parallel': return [...node.branches.map(branch => branch.target), node.join];
    case 'condition': return [...node.branches.map(branch => branch.target), node.otherwise];
    case 'handle': case 'cc': case 'action': case 'join': return [node.next];
    default: return [];
  }
}
function reachable(definition: WorkflowDefinition, target: string, excluded?: string): boolean {
  const visited = new Set<string>(), queue = [definition.startAt];
  while (queue.length && visited.size < 200) {
    const id = queue.shift()!, node = definition.nodes[id];
    if (id === excluded || visited.has(id) || !node) continue;
    if (id === target) return true;
    visited.add(id); queue.push(...targets(node));
  }
  return false;
}

/** Synthetic steps prefixes do not make a required output optional; its producer must dominate the consumer. */
export function workflowConditionalAssignmentFact(definition: WorkflowDefinition, nodeId: string, factPath: string): { schema: Record<string, unknown>; required: boolean } | undefined {
  if (!path(factPath) || Object.keys(definition.nodes).length > 200 || !definition.nodes[nodeId] || !reachable(definition, nodeId)) return undefined;
  let schema: any = definition.inputSchema, segments = factPath.split('.'), required = true;
  if (segments[0] === 'steps') {
    const producerId = segments[1]!, producer = definition.nodes[producerId];
    if (producer?.kind !== 'action' || producerId === nodeId || reachable(definition, nodeId, producerId)) return undefined;
    schema = producer.outputSchema; segments = segments.slice(2);
    if (!segments.length) return undefined;
  }
  for (const segment of segments) {
    required &&= Array.isArray(schema?.required) && schema.required.includes(segment);
    schema = record(schema?.properties) && Object.hasOwn(schema.properties, segment) ? schema.properties[segment] : undefined;
    if (!record(schema)) return undefined;
  }
  return { schema, required };
}

type Operand = { types: string[]; itemTypes?: string[] };
const types = (schema: Record<string, any>): string[] => [...new Set((Array.isArray(schema.type) ? schema.type : [schema.type]).map(type => type === 'integer' ? 'number' : typeof type === 'string' ? type : 'unknown'))];
function validateFacts(expression: WorkflowExpression, definition: WorkflowDefinition, nodeId: string, errors: string[], presence = false): Operand {
  const child = (value: WorkflowExpression) => validateFacts(value, definition, nodeId, errors);
  const invalid = () => { errors.push('WORKFLOW_CONDITIONAL_OPERAND_TYPE_INVALID'); };
  const scalar = (operand: Operand) => operand.types.every(type => ['string', 'number', 'boolean', 'null'].includes(type));
  const boolean = (operand: Operand) => operand.types.length === 1 && operand.types[0] === 'boolean';
  switch (expression.op) {
    case 'path': {
      const fact = workflowConditionalAssignmentFact(definition, nodeId, expression.path);
      if (!fact) { errors.push(`WORKFLOW_CONDITIONAL_FACT_UNAVAILABLE:${expression.path}`); return { types: ['unknown'] }; }
      if (!presence && !fact.required) errors.push(`WORKFLOW_CONDITIONAL_FACT_OPTIONAL:${expression.path}`);
      return { types: types(fact.schema), ...(record(fact.schema.items) ? { itemTypes: types(fact.schema.items) } : {}) };
    }
    case 'literal': {
      const value = expression.value;
      return { types: [value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value],
        ...(Array.isArray(value) ? { itemTypes: [...new Set(value.map(item => item === null ? 'null' : typeof item))] } : {}) };
    }
    case 'exists': validateFacts(expression.value, definition, nodeId, errors, true); return { types: ['boolean'] };
    case 'not': if (!boolean(child(expression.value))) invalid(); return { types: ['boolean'] };
    case 'and': case 'or': for (const value of expression.values) if (!boolean(child(value))) invalid(); return { types: ['boolean'] };
    default: {
      const left = child(expression.left), right = child(expression.right);
      if (['eq', 'neq'].includes(expression.op)) {
        if (!scalar(left) || !scalar(right) || !left.types.some(type => right.types.includes(type))) invalid();
      } else if (['gt', 'gte', 'lt', 'lte'].includes(expression.op)) {
        if (left.types.length !== 1 || right.types.length !== 1 || left.types[0] !== right.types[0] || !['number', 'string'].includes(left.types[0]!)) invalid();
      } else {
        const array = expression.op === 'in' ? right : left, item = expression.op === 'in' ? left : right;
        const strings = expression.op === 'contains' && left.types.length === 1 && right.types.length === 1 && left.types[0] === 'string' && right.types[0] === 'string';
        if (!strings && !(array.types.length === 1 && array.types[0] === 'array' && scalar(item) && array.itemTypes && array.itemTypes.every(type => ['string', 'number', 'boolean', 'null'].includes(type) && item.types.includes(type)))) invalid();
      }
      return { types: ['boolean'] };
    }
  }
}

function authorable(entry: WorkflowStandardBindingEntry, context: WorkflowConditionalAssignmentContext): boolean {
  if (!context.standardProviders.includes(entry.provider as any)) return false;
  if (entry.provider === 'fixed_users') return keys(entry, ['provider', 'users']);
  if (entry.provider === 'app_role') return keys(entry, ['provider', 'roleCode', 'roleCodes']);
  return entry.provider === 'app_role_in_scope' && keys(entry, ['provider', 'roleCode', 'roleCodes', 'scope']) && !!entry.scope &&
    !!context.scopeDimensions?.includes(entry.scope.dimension);
}

/** Pure ceiling/fact gate. Platform still owns live principals, scope grants and all pinned-version checks. */
export function validateWorkflowConditionalAssignment(value: unknown, context: WorkflowConditionalAssignmentContext, options: { allowIncomplete?: boolean } = {}): string[] {
  const shape = validateWorkflowConditionalAssignmentShape(value, options);
  if (shape.length) return shape;
  const entry = value as WorkflowConditionalAssignment, node = context.definition.nodes[context.nodeId];
  if (!node || node.kind !== 'approval' && node.kind !== 'handle') return ['WORKFLOW_CONDITIONAL_HUMAN_REQUIRED'];
  const errors: string[] = [];
  const frozen = context.frozenDefault ? workflowAssignmentLeaves(context.frozenDefault) : [];
  const released = Object.values(context.releasedSources);
  for (const [index, leaf] of [...entry.cases.map(rule => rule.assignee), entry.otherwise].entries()) {
    if (!authorable(leaf, context) && ![...frozen, ...released].some(source => semantic(source) === semantic(leaf))) errors.push(`WORKFLOW_CONDITIONAL_LEAF_UNRELEASED:${index}`);
    if (leaf.provider === 'supervisor_chain') errors.push(...validateWorkflowSupervisorChains(context.definition, { bindings: { [node.binding!]: leaf } }));
    const leafPaths = [leaf.inputPath, leaf.selectedInputPath, leaf.resourceIdFrom, leaf.scope?.valueFrom,
      ...(typeof leaf.from === 'object' ? [leaf.from.field] : []),
      ...Object.values(leaf.routing?.dimensions || {}).map(dimension => dimension.valueFrom),
      ...Object.values(leaf.routing?.sources || {}).map(source => source.scope?.valueFrom),
    ].filter((value): value is string => typeof value === 'string');
    for (const factPath of leafPaths) if (!workflowConditionalAssignmentFact(context.definition, context.nodeId, factPath)) errors.push(`WORKFLOW_CONDITIONAL_LEAF_FACT_UNAVAILABLE:${index}:${factPath}`);
  }
  for (const [index, rule] of entry.cases.entries()) {
    const local: string[] = [], result = validateFacts(rule.when, context.definition, context.nodeId, local);
    if (result.types.length !== 1 || result.types[0] !== 'boolean') local.push('WORKFLOW_CONDITIONAL_BOOLEAN_REQUIRED');
    errors.push(...local.map(error => `${error}:${index}`));
  }
  return [...new Set(errors)];
}

/** Selects intent only. No directory, role query or candidate fallback lives here. */
export function selectWorkflowConditionalAssignment(entry: WorkflowConditionalAssignment, definition: WorkflowDefinition, nodeId: string, facts: Record<string, unknown>): {
  assignee: WorkflowConditionalAssignmentLeaf; matched: number | 'otherwise'; label?: string; factReads: Array<{ path: string; present: boolean; value?: unknown }>;
} {
  const shape = validateWorkflowConditionalAssignmentShape(entry);
  if (shape.length) throw new Error(shape[0]);
  const node = definition.nodes[nodeId];
  if (!node || !['approval', 'handle'].includes(node.kind)) throw new Error('WORKFLOW_CONDITIONAL_HUMAN_REQUIRED');
  // Validate every rule before evaluating any. Later rules may be unvisited at runtime,
  // but undeclared/optional/unavailable facts are never valid configuration.
  for (const rule of entry.cases) {
    const errors: string[] = [], result = validateFacts(rule.when, definition, nodeId, errors);
    if (result.types.length !== 1 || result.types[0] !== 'boolean') errors.push('WORKFLOW_CONDITIONAL_BOOLEAN_REQUIRED');
    if (errors.length) throw new Error(errors[0]);
  }
  const factReads: Array<{ path: string; present: boolean; value?: unknown }> = [];
  const options = { strict: true, schemaForPath: (path: string) => workflowConditionalAssignmentFact(definition, nodeId, path)?.schema,
    requiredForPath: (path: string) => workflowConditionalAssignmentFact(definition, nodeId, path)?.required === true,
    onPathRead: (path: string, value: unknown) => { factReads.push({ path, present: value !== undefined, ...(value !== undefined ? { value } : {}) }); } };
  for (const [index, rule] of entry.cases.entries()) {
    const matches = evaluateWorkflowExpression(rule.when, facts, options);
    if (typeof matches !== 'boolean') throw new Error('WORKFLOW_CONDITIONAL_BOOLEAN_REQUIRED');
    if (matches) return { assignee: rule.assignee, matched: index, ...(rule.label !== undefined ? { label: rule.label } : {}), factReads };
  }
  return { assignee: entry.otherwise, matched: 'otherwise', factReads };
}
