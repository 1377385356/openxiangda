
export const WORKFLOW_BUSINESS_STEP_EVENT = 'openxiangda.workflow.step.requested.v2';
export const WORKFLOW_BUSINESS_STEP_EVENTS = [WORKFLOW_BUSINESS_STEP_EVENT, 'openxiangda.workflow.step.result_received.v2', 'openxiangda.workflow.step.completed.v2', 'openxiangda.workflow.step.continuation_failed.v2'] as const;
export const WORKFLOW_BUSINESS_STEP_MAX_BYTES = 16_384;
export const WORKFLOW_BUSINESS_STEP_MAX_RECEIPT_BYTES = 2_048;
export const WORKFLOW_BUSINESS_STEP_FACTS_KEY = 'steps';

export type WorkflowBusinessStepInput =
  | { source: 'fact'; path: string }
  | { source: 'literal'; value: unknown };

export interface WorkflowBusinessStepHandlerContract {
  version: number;
  mode: 'pure' | 'reconciled-effect';
  /** One recoverable Native transaction, bound to this fixed execution. */
  dataTransaction?: true;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface WorkflowBusinessStepNode {
  id: string;
  kind: 'action';
  title: string;
  next: string;
  handler: { code: string; version: number; mode: WorkflowBusinessStepHandlerContract['mode']; dataTransaction?: true };
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  inputs: Record<string, WorkflowBusinessStepInput>;
}

/** This result is authenticated by the claimed request event, never by a userId. */
export interface WorkflowBusinessStepResult {
  executionId: string;
  handlerVersion: number;
  inputDigest: string;
  expectedFactRevision: number;
  output: Record<string, unknown>;
  receipt?: Record<string, unknown>;
}

export interface WorkflowBusinessStepRequest {
  executionId: string;
  nodeId: string;
  handlerCode: string;
  handlerVersion: number;
  mode: WorkflowBusinessStepHandlerContract['mode'];
  dataTransaction?: true;
  input: Record<string, unknown>;
  inputDigest: string;
  expectedFactRevision: number;
}

export interface WorkflowBusinessStepOutput {
  output: Record<string, unknown>;
  receipt?: Record<string, unknown>;
}

/** Safe diagnostic projection; input/output and external receipts remain private. */
export interface WorkflowBusinessStepSummary {
  executionId: string;
  handlerCode: string;
  handlerVersion: number;
  mode?: WorkflowBusinessStepHandlerContract['mode'];
  nodeId?: string;
  status: 'waiting' | 'result_ready' | 'completed' | 'cancelled';
  inputDigest?: string;
  resultDigest?: string;
  expectedFactRevision?: number;
  factRevision?: number;
  requestEventId: string;
  continuationAttempts?: number;
  lastErrorCode?: string | null;
}

export interface WorkflowBusinessStepRecoveryOptions {
  instanceId: string;
  version: number;
  status: string;
  canRetryBusinessStep: boolean;
  businessStep: WorkflowBusinessStepSummary | null;
}
export interface WorkflowBusinessStepRecoveryPreview {
  action: 'admin_retry_step';
  canCommit: boolean;
  commandToken?: string;
  expiresAt?: string;
  target: { nodeId: string; title: string; executionId: string; resultDigest: string; lastErrorCode?: string; continuationAttempts: number; reexecutesBusinessHandler: false };
}

type Definition = {
  code?: string;
  startAt?: string;
  inputSchema?: Record<string, any>;
  nodes?: Record<string, Record<string, any>>;
};
const keyPattern = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const fieldPattern = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const bytes = (value: unknown) => {
  try { const json = JSON.stringify(value); return json === undefined ? Infinity : new TextEncoder().encode(json).length; } catch { return Infinity; }
};
const jsonEqual = (left: unknown, right: unknown, depth = 0): boolean => {
  if (depth > 32) return false;
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => jsonEqual(value, right[index], depth + 1));
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left).filter(key => left[key] !== undefined), other = Object.keys(right).filter(key => right[key] !== undefined);
  return keys.length === other.length && keys.every(key => Object.hasOwn(right, key) && jsonEqual(left[key], right[key], depth + 1));
};

function boundedJson(value: unknown, max: number): boolean {
  let count = 0;
  const visit = (item: unknown, depth: number): boolean => {
    if (++count > 10_000 || depth > 8) return false;
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (Array.isArray(item)) return item.length <= 200 && item.every(child => visit(child, depth + 1));
    return record(item) && Object.keys(item).length <= 32 && Object.keys(item).every(key => !forbidden.has(key)) && Object.values(item).every(child => visit(child, depth + 1));
  };
  return bytes(value) <= max && visit(value, 0);
}

export function validateWorkflowBusinessStepResult(value: unknown): value is WorkflowBusinessStepResult {
  if (!record(value) || Object.keys(value).some(key => !['executionId', 'handlerVersion', 'inputDigest', 'expectedFactRevision', 'output', 'receipt'].includes(key))) return false;
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.executionId || '') &&
    Number.isSafeInteger(value.handlerVersion) && value.handlerVersion >= 1 && value.handlerVersion <= 1_000_000 &&
    /^[a-f0-9]{64}$/.test(value.inputDigest || '') && Number.isSafeInteger(value.expectedFactRevision) && value.expectedFactRevision >= 0 &&
    record(value.output) && boundedJson(value.output, WORKFLOW_BUSINESS_STEP_MAX_BYTES) &&
    (value.receipt === undefined || record(value.receipt) && boundedJson(value.receipt, WORKFLOW_BUSINESS_STEP_MAX_RECEIPT_BYTES));
}

export function validateWorkflowBusinessStepRequest(value: unknown): value is WorkflowBusinessStepRequest {
  return record(value) && Object.keys(value).every(key => ['executionId', 'nodeId', 'handlerCode', 'handlerVersion', 'mode', 'dataTransaction', 'input', 'inputDigest', 'expectedFactRevision'].includes(key)) &&
    typeof value.nodeId === 'string' && keyPattern.test(value.nodeId) && !forbidden.has(value.nodeId) &&
    typeof value.handlerCode === 'string' && /^[a-z][a-z0-9-]{0,100}$/.test(value.handlerCode) && value.handlerCode.endsWith(`-v${value.handlerVersion}`) &&
    ['pure', 'reconciled-effect'].includes(value.mode) &&
    (value.dataTransaction === undefined || value.dataTransaction === true && value.mode === 'reconciled-effect') &&
    validateWorkflowBusinessStepResult({ executionId: value.executionId, handlerVersion: value.handlerVersion, inputDigest: value.inputDigest, expectedFactRevision: value.expectedFactRevision, output: value.input });
}

/** Same bounded value checks in the kernel and SDK, with no coercion/defaults. */
export function workflowBusinessStepValueMatches(schema: Record<string, any>, value: unknown, limit = WORKFLOW_BUSINESS_STEP_MAX_BYTES): boolean {
  if (!boundedJson(value, limit)) return false;
  let budget = 10_000;
  const matches = (rule: Record<string, any>, item: unknown, depth: number): boolean => {
    if (--budget < 0 || depth > 8 || !record(rule)) return false;
    const actual = item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item === 'number' && Number.isSafeInteger(item) ? 'integer' : typeof item;
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    if (!types.includes(actual) && !(actual === 'integer' && types.includes('number'))) return false;
    if (rule.enum !== undefined && (!Array.isArray(rule.enum) || !rule.enum.some((entry: unknown) => jsonEqual(entry, item)))) return false;
    if (Object.hasOwn(rule, 'const') && !jsonEqual(rule.const, item)) return false;
    if (typeof item === 'number') return Number.isFinite(item) && (rule.minimum === undefined || item >= rule.minimum) && (rule.maximum === undefined || item <= rule.maximum);
    if (typeof item === 'string') {
      const length = Array.from(item).length;
      return (rule.minLength === undefined || length >= rule.minLength) && (rule.maxLength === undefined || length <= rule.maxLength);
    }
    if (Array.isArray(item)) return item.length <= rule.maxItems && (rule.minItems === undefined || item.length >= rule.minItems) && item.every(child => matches(rule.items, child, depth + 1));
    if (record(item)) {
      if (!record(rule.properties) || Object.keys(item).some(key => forbidden.has(key) || !Object.hasOwn(rule.properties, key))) return false;
      if ((Array.isArray(rule.required) ? rule.required : []).some((key: string) => !Object.hasOwn(item, key))) return false;
      if (rule.minProperties !== undefined && Object.keys(item).length < rule.minProperties || rule.maxProperties !== undefined && Object.keys(item).length > rule.maxProperties) return false;
      return Object.entries(item).every(([key, child]) => matches(rule.properties[key], child, depth + 1));
    }
    return item === null || typeof item === 'boolean';
  };
  return matches(schema, value, 0);
}

export function workflowBusinessStepPath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 256 && path.split('.').length <= 8 &&
    path.split('.').every(part => keyPattern.test(part) && !forbidden.has(part));
}

/** A bounded JSON Schema subset: no references, regexes or executable extensions. */
export function validateWorkflowBusinessStepSchema(value: unknown): boolean {
  let count = 0;
  const visit = (schema: unknown, depth: number): boolean => {
    if (!record(schema) || depth > 6 || ++count > 256) return false;
    if (Object.keys(schema).some(key => ![
      'type', 'title', 'description', 'properties', 'required', 'additionalProperties',
      'items', 'maxItems', 'minItems', 'maxLength', 'minLength', 'minimum', 'maximum',
      'enum', 'const', 'maxProperties', 'minProperties',
    ].includes(key))) return false;
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.length || types.length > 2 || types.some(type => !['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'].includes(type))) return false;
    if (types.length > 1 && (!types.includes('null') || new Set(types).size !== types.length)) return false;
    for (const key of ['title', 'description']) if (schema[key] !== undefined && (typeof schema[key] !== 'string' || schema[key].length > 2_000)) return false;
    for (const key of ['minimum', 'maximum']) if (schema[key] !== undefined && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key]))) return false;
    for (const [key, max] of [['maxItems', 200], ['minItems', 200], ['maxLength', 16_384], ['minLength', 16_384], ['maxProperties', 32], ['minProperties', 32]] as const)
      if (schema[key] !== undefined && (!Number.isSafeInteger(schema[key]) || schema[key] < 0 || schema[key] > max)) return false;
    for (const [min, max] of [['minimum', 'maximum'], ['minItems', 'maxItems'], ['minLength', 'maxLength'], ['minProperties', 'maxProperties']])
      if (schema[min!] !== undefined && schema[max!] !== undefined && schema[min!] > schema[max!]) return false;
    if (['properties', 'required', 'additionalProperties', 'maxProperties', 'minProperties'].some(key => schema[key] !== undefined) && !types.includes('object') ||
        ['items', 'maxItems', 'minItems'].some(key => schema[key] !== undefined) && !types.includes('array') ||
        ['maxLength', 'minLength'].some(key => schema[key] !== undefined) && !types.includes('string') ||
        ['minimum', 'maximum'].some(key => schema[key] !== undefined) && !types.some(type => type === 'integer' || type === 'number')) return false;
    if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.length > 100)) return false;
    if (types.includes('object')) {
      if (!record(schema.properties) || schema.additionalProperties !== false || Object.keys(schema.properties).length > 32) return false;
      if (Object.keys(schema.properties).some(key => !fieldPattern.test(key) || forbidden.has(key))) return false;
      if (schema.required !== undefined && (!Array.isArray(schema.required) || new Set(schema.required).size !== schema.required.length || schema.required.some(key => typeof key !== 'string' || !Object.hasOwn(schema.properties, key)))) return false;
      if (schema.minProperties !== undefined && schema.minProperties > Object.keys(schema.properties).length ||
          schema.maxProperties !== undefined && schema.maxProperties < (schema.required?.length || 0)) return false;
      if (!Object.values(schema.properties).every(child => visit(child, depth + 1))) return false;
    }
    if (types.includes('array') && (!Number.isSafeInteger(schema.maxItems) || !visit(schema.items, depth + 1))) return false;
    const base = { ...schema }; delete base.enum; delete base.const;
    if (schema.enum !== undefined && (!schema.enum.every((item: unknown) => workflowBusinessStepValueMatches(base, item)) || schema.enum.some((item: unknown, index: number) => schema.enum.slice(0, index).some((previous: unknown) => jsonEqual(item, previous))))) return false;
    if (Object.hasOwn(schema, 'const') && !workflowBusinessStepValueMatches(base, schema.const)) return false;
    return true;
  };
  return record(value) && value.type === 'object' && bytes(value) <= WORKFLOW_BUSINESS_STEP_MAX_BYTES && visit(value, 0);
}

/** Business input stays closed; only the kernel adds committed step outputs. */
export function workflowBusinessStepFactSchema(definition: Definition): Record<string, any> {
  const outputs = Object.fromEntries(Object.values(definition.nodes || {}).filter(node => node?.kind === 'action').map(node => [node.id, node.outputSchema]));
  if (!Object.keys(outputs).length) return definition.inputSchema || {};
  return { ...definition.inputSchema, properties: {
    ...definition.inputSchema?.properties,
    steps: { type: 'object', additionalProperties: false, properties: outputs },
  } };
}

function schemaAtPath(schema: Record<string, any>, path: string): Record<string, any> | undefined {
  let current = schema;
  for (const part of path.split('.')) {
    if (!record(current?.properties) || !Object.hasOwn(current.properties, part)) return undefined;
    current = current.properties[part];
  }
  return record(current) ? current : undefined;
}
const schemaHasPath = (schema: Record<string, any>, path: string) => Boolean(schemaAtPath(schema, path));

export function validateWorkflowBusinessStepHandlerContract(value: unknown): value is WorkflowBusinessStepHandlerContract {
  return record(value) && Object.keys(value).every(key => ['version', 'mode', 'dataTransaction', 'inputSchema', 'outputSchema'].includes(key)) &&
    Number.isSafeInteger(value.version) && value.version >= 1 && value.version <= 1_000_000 &&
    ['pure', 'reconciled-effect'].includes(value.mode) &&
    (value.dataTransaction === undefined || value.dataTransaction === true && value.mode === 'reconciled-effect') &&
    validateWorkflowBusinessStepSchema(value.inputSchema) && validateWorkflowBusinessStepSchema(value.outputSchema);
}

function targets(node: Record<string, any>): string[] {
  if (node.kind === 'approval') return [node.onApprove, node.onReject];
  if (node.kind === 'condition') return [...(Array.isArray(node.branches) ? node.branches.map((branch: any) => branch.target) : []), node.otherwise];
  if (node.kind === 'cc' || node.kind === 'action') return [node.next];
  return [];
}

function expressionPaths(value: unknown, depth = 0): string[] {
  if (!record(value) || depth > 16) return [];
  if (value.op === 'path') return typeof value.path === 'string' ? [value.path] : [];
  return ['left', 'right', 'value'].flatMap(key => expressionPaths(value[key], depth + 1)).concat(
    Array.isArray(value.values) ? value.values.flatMap(child => expressionPaths(child, depth + 1)) : [],
  );
}

export function validateWorkflowBusinessSteps(definition: Definition, binding?: { bindings?: Record<string, Record<string, any>> }): string[] {
  if (!record(definition) || !record(definition.nodes)) return ['WORKFLOW_STEP_DEFINITION_INVALID'];
  const nodes = definition.nodes;
  const actions = Object.entries(nodes).filter(([, node]) => node?.kind === 'action');
  if (!actions.length) return [];
  const errors: string[] = [];
  if (Object.hasOwn(definition.inputSchema?.properties || {}, 'steps')) errors.push('WORKFLOW_STEP_FACT_NAMESPACE_RESERVED');
  const factSchema = workflowBusinessStepFactSchema(definition);
  for (const [id, node] of actions) {
    if (Object.keys(node).some(key => !['id', 'kind', 'title', 'next', 'handler', 'inputSchema', 'outputSchema', 'inputs'].includes(key)) ||
        node.id !== id || !keyPattern.test(id) || forbidden.has(id) || typeof node.title !== 'string' || !node.title.trim() || node.title.length > 255 || typeof node.next !== 'string' || !Object.hasOwn(nodes, node.next)) errors.push(`WORKFLOW_STEP_NODE_INVALID:${id}`);
    const handler = node.handler;
    if (!record(handler) || Object.keys(handler).some(key => !['code', 'version', 'mode', 'dataTransaction'].includes(key)) ||
        !Number.isSafeInteger(handler.version) || handler.version < 1 || handler.version > 1_000_000 ||
        !/^[a-z][a-z0-9-]{0,100}$/.test(handler.code || '') || !String(handler.code).endsWith(`-v${handler.version}`) ||
        !['pure', 'reconciled-effect'].includes(handler.mode) ||
        handler.dataTransaction !== undefined && (handler.dataTransaction !== true || handler.mode !== 'reconciled-effect')) errors.push(`WORKFLOW_STEP_HANDLER_INVALID:${id}`);
    const inputSchemaValid = validateWorkflowBusinessStepSchema(node.inputSchema);
    if (!inputSchemaValid || !validateWorkflowBusinessStepSchema(node.outputSchema)) errors.push(`WORKFLOW_STEP_SCHEMA_INVALID:${id}`);
    if (!record(node.inputs) || Object.keys(node.inputs).length > 32) { errors.push(`WORKFLOW_STEP_INPUTS_INVALID:${id}`); continue; }
    for (const required of Array.isArray(node.inputSchema?.required) ? node.inputSchema.required : []) if (!Object.hasOwn(node.inputs, required)) errors.push(`WORKFLOW_STEP_INPUT_REQUIRED:${id}:${required}`);
    for (const [key, input] of Object.entries(node.inputs)) {
      if (!fieldPattern.test(key) || forbidden.has(key) || !Object.hasOwn(node.inputSchema?.properties || {}, key) || !record(input)) { errors.push(`WORKFLOW_STEP_INPUT_INVALID:${id}:${key}`); continue; }
      if (input.source === 'literal') {
        if (!inputSchemaValid || Object.keys(input).some(key => !['source', 'value'].includes(key)) || !Object.hasOwn(input, 'value') || !workflowBusinessStepValueMatches(node.inputSchema.properties[key], input.value)) errors.push(`WORKFLOW_STEP_LITERAL_INVALID:${id}:${key}`);
      } else if (input.source !== 'fact' || Object.keys(input).some(key => !['source', 'path'].includes(key)) || !workflowBusinessStepPath(input.path) || !schemaHasPath(factSchema, input.path)) errors.push(`WORKFLOW_STEP_FACT_PATH_INVALID:${id}:${key}`);
      else if (inputSchemaValid) {
        const from = schemaAtPath(factSchema, input.path)!, to = node.inputSchema.properties[key];
        const sourceTypes = Array.isArray(from.type) ? from.type : [from.type], targetTypes = Array.isArray(to.type) ? to.type : [to.type];
        if (sourceTypes.some(type => !targetTypes.includes(type) && !(type === 'integer' && targetTypes.includes('number')))) errors.push(`WORKFLOW_STEP_FACT_TYPE_MISMATCH:${id}:${key}`);
      }
    }
  }
  // A step output must be available on every normal route to its consumer.
  // Return/resubmit re-entry executes the producer again before normal next.
  const canReachWithout = (target: string, excluded: string) => {
    const visited = new Set<string>(), queue = [definition.startAt || ''];
    while (queue.length && visited.size <= 200) {
      const id = queue.shift()!;
      if (id === excluded || visited.has(id) || !nodes[id]) continue;
      if (id === target) return true;
      visited.add(id); queue.push(...targets(nodes[id]!));
    }
    return false;
  };
  for (const [id, node] of Object.entries(nodes)) {
    if (!record(node)) continue;
    const references = node.kind === 'action' ? Object.values(node.inputs || {}).flatMap((input: any) => input?.source === 'fact' ? [input.path] : []) :
      (Array.isArray(node.branches) ? node.branches : []).flatMap((branch: any) => expressionPaths(branch?.when));
    const entry = binding?.bindings?.[node.binding];
    if (entry) references.push(...[entry.inputPath, entry.departmentIdFrom, entry.resourceIdFrom, entry.scope?.valueFrom].filter(value => typeof value === 'string'));
    for (const path of references.filter((path: unknown): path is string => typeof path === 'string' && path.startsWith('steps.'))) {
      const producer = path.split('.')[1]!;
      if (nodes[producer]?.kind !== 'action' || producer === id || !schemaHasPath(factSchema, path) || canReachWithout(id, producer)) errors.push(`WORKFLOW_STEP_OUTPUT_NOT_AVAILABLE:${id}:${path}`);
    }
  }
  if (binding) for (const [, action] of actions) {
    const visited = new Set<string>(), queue = [action.next];
    while (queue.length && visited.size <= 200) {
      const id = queue.shift()!;
      if (visited.has(id) || !record(nodes[id])) continue;
      visited.add(id);
      const node = nodes[id]!;
      if (node.kind === 'action' || node.kind === 'end') continue;
      if (node.kind === 'approval') {
        const entry = binding.bindings?.[node.binding];
        if (entry && ['application_provider', 'initiator_select'].includes(entry.provider)) errors.push(`WORKFLOW_STEP_NEXT_PROVIDER_REQUIRES_PREPARED_RESULT:${id}`);
        continue;
      }
      queue.push(...targets(node));
    }
  }
  return [...new Set(errors)];
}

/** Resolve only declared safe facts; the assembled input is validated as a whole. */
export function workflowBusinessStepInput(node: WorkflowBusinessStepNode, facts: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [key, mapping] of Object.entries(node.inputs)) {
    const value = mapping.source === 'literal' ? mapping.value : mapping.path.split('.').reduce<unknown>((value, part) =>
      record(value) && Object.hasOwn(value, part) ? value[part] : undefined, facts);
    if (value !== undefined) input[key] = value;
  }
  if (!workflowBusinessStepValueMatches(node.inputSchema, input)) throw new Error('WORKFLOW_STEP_INPUT_SCHEMA_INVALID');
  return input;
}

export function validateWorkflowBusinessStepSubscriptions(definitions: readonly Definition[], subscriptions: readonly Record<string, any>[], backendEnabled: boolean): string[] {
  const handlers = compileWorkflowBusinessStepHandlers(definitions), errors: string[] = [];
  if (Object.keys(handlers).length && !backendEnabled) errors.push('WORKFLOW_STEP_BACKEND_REQUIRED');
  for (const code of Object.keys(handlers)) {
    const subscription = subscriptions.find(item => item.code === code);
    if (!subscription || subscription.execution || subscription.action ||
        !Array.isArray(subscription.eventTypes) || subscription.eventTypes.length !== 1 || subscription.eventTypes[0] !== WORKFLOW_BUSINESS_STEP_EVENT ||
        !record(subscription.filter) || Object.keys(subscription.filter).length !== 1 || !record(subscription.filter.workflowStep) ||
        Object.keys(subscription.filter.workflowStep).length !== 1 || subscription.filter.workflowStep.handlerCode !== code ||
        !record(subscription.payload) || subscription.payload.includeChanges !== false || !Array.isArray(subscription.payload.fields) || subscription.payload.fields.length)
      errors.push(`WORKFLOW_STEP_SUBSCRIPTION_INVALID:${code}`);
  }
  for (const subscription of subscriptions) if (subscription.eventTypes?.includes(WORKFLOW_BUSINESS_STEP_EVENT) && !handlers[subscription.code] ||
      subscription.filter?.workflowStep && !handlers[subscription.code]) errors.push(`WORKFLOW_STEP_HANDLER_NOT_DECLARED:${subscription.code}`);
  return errors;
}

/** One compiler owner for code/version/schema identity across all definitions. */
export function compileWorkflowBusinessStepHandlers(definitions: readonly Definition[]): Record<string, WorkflowBusinessStepHandlerContract> {
  const result: Record<string, WorkflowBusinessStepHandlerContract> = {};
  for (const definition of definitions) {
    const errors = validateWorkflowBusinessSteps(definition);
    if (errors.length) throw new Error(errors.join('; '));
    for (const node of Object.values(definition.nodes || {})) {
      if (node.kind !== 'action') continue;
      const contract = { version: node.handler.version, mode: node.handler.mode,
        ...(node.handler.dataTransaction ? { dataTransaction: true as const } : {}), inputSchema: node.inputSchema, outputSchema: node.outputSchema };
      const previous = result[node.handler.code];
      if (previous && !jsonEqual(previous, contract)) throw new Error(`WORKFLOW_STEP_HANDLER_CONTRACT_CONFLICT:${node.handler.code}`);
      result[node.handler.code] = contract;
    }
  }
  return result;
}
