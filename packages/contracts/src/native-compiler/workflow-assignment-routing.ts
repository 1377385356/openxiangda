import type { WorkflowAssignmentRoutingPolicy, WorkflowAssignmentRoutingRule } from '../types.js';

export const WORKFLOW_ROUTING_MAX_RULES = 256;
export const WORKFLOW_ROUTING_MAX_MATCHED_RULES = 64;
export const WORKFLOW_ROUTING_MAX_BYTES = 262144;
const codePattern = /^[a-z][a-z0-9_-]{0,127}$/;
const pathPattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: object, allowed: string[]) => Object.keys(v).every(key => allowed.includes(key));
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const code = (v: unknown) => typeof v === 'string' && codePattern.test(v) && !forbidden.has(v);
const path = (v: unknown) => typeof v === 'string' && v.length <= 255 && pathPattern.test(v) && !v.split('.').some(part => forbidden.has(part));
const scopeValid = (v: unknown) => record(v) && keys(v, ['dimension', 'valueFrom', 'value']) && code(v.dimension) &&
  ((text(v.value, 255) && v.valueFrom === undefined) || (path(v.valueFrom) && v.value === undefined));
const instant = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));

const stringCode = { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,127}$' } as const;
const titleSchema = { type: 'string', minLength: 1, maxLength: 128 } as const;
export const workflowAssignmentRoutingPolicySchema = {
  type: 'object', additionalProperties: false, required: ['policyCode', 'title', 'strategy', 'dimensions', 'sources'],
  properties: {
    policyCode: stringCode, title: titleSchema, strategy: { enum: ['replace_then_append', 'replace_only'] },
    dimensions: { type: 'object', maxProperties: 8, propertyNames: stringCode, additionalProperties: {
      type: 'object', additionalProperties: false, required: ['title', 'valueFrom'], properties: { title: titleSchema, valueFrom: { type: 'string', minLength: 1, maxLength: 255 } },
    } },
    sources: { type: 'object', minProperties: 1, maxProperties: 16, propertyNames: stringCode, additionalProperties: {
      type: 'object', additionalProperties: false, required: ['title', 'provider', 'roleCode'], properties: {
        title: titleSchema, provider: { enum: ['app_role', 'app_role_in_scope'] }, roleCode: stringCode,
        scope: { type: 'object', additionalProperties: false, required: ['dimension'], properties: { dimension: stringCode, value: { type: 'string', minLength: 1, maxLength: 255 }, valueFrom: { type: 'string', minLength: 1, maxLength: 255 } } },
      },
    } },
  },
} as const;

export function validateWorkflowAssignmentRoutingPolicy(value: unknown): string[] {
  if (!record(value) || !keys(value, ['policyCode', 'title', 'strategy', 'dimensions', 'sources']) || !code(value.policyCode) || !text(value.title, 128) || !['replace_then_append', 'replace_only'].includes(value.strategy)) return ['WORKFLOW_V2_ROUTING_POLICY_INVALID'];
  const errors: string[] = [];
  if (!record(value.dimensions) || Object.keys(value.dimensions).length > 8 || Object.entries(value.dimensions).some(([key, dimension]) => !code(key) || !record(dimension) || !keys(dimension, ['title', 'valueFrom']) || !text(dimension.title, 128) || !path(dimension.valueFrom))) errors.push('WORKFLOW_V2_ROUTING_DIMENSIONS_INVALID');
  if (!record(value.sources) || Object.keys(value.sources).length < 1 || Object.keys(value.sources).length > 16 || Object.entries(value.sources).some(([key, source]) => !code(key) || !record(source) || !keys(source, ['title', 'provider', 'roleCode', 'scope']) || !text(source.title, 128) || !code(source.roleCode) || !['app_role', 'app_role_in_scope'].includes(source.provider) || (source.provider === 'app_role_in_scope' ? !scopeValid(source.scope) : source.scope !== undefined))) errors.push('WORKFLOW_V2_ROUTING_SOURCES_INVALID');
  return errors;
}

export function validateWorkflowAssignmentRoutingRules(policy: WorkflowAssignmentRoutingPolicy, value: unknown): string[] {
  if (validateWorkflowAssignmentRoutingPolicy(policy).length) return ['WORKFLOW_V2_ROUTING_POLICY_INVALID'];
  if (!Array.isArray(value) || value.length > WORKFLOW_ROUTING_MAX_RULES || new TextEncoder().encode(JSON.stringify(value)).length > WORKFLOW_ROUTING_MAX_BYTES) return ['WORKFLOW_V2_ROUTING_RULE_LIMIT_EXCEEDED'];
  const errors: string[] = [], seen = new Set<string>();
  for (const rule of value) {
    if (!record(rule) || !keys(rule, ['ruleCode', 'title', 'enabled', 'workflowCode', 'nodeId', 'matches', 'sourceCode', 'effect', 'priority', 'validFrom', 'validTo']) || !code(rule.ruleCode) || !text(rule.title, 128) || typeof rule.enabled !== 'boolean' || !code(rule.sourceCode) || !Object.hasOwn(policy.sources, rule.sourceCode) || !['append', 'replace'].includes(rule.effect) || !Number.isSafeInteger(rule.priority) || rule.priority < -1000 || rule.priority > 1000 || (rule.workflowCode !== undefined && !code(rule.workflowCode)) || (rule.nodeId !== undefined && (!code(rule.nodeId) || rule.workflowCode === undefined)) || (rule.validFrom !== undefined && !instant(rule.validFrom)) || (rule.validTo !== undefined && !instant(rule.validTo)) || (rule.validFrom && rule.validTo && Date.parse(rule.validFrom) >= Date.parse(rule.validTo))) {
      errors.push('WORKFLOW_V2_ROUTING_RULE_INVALID'); continue;
    }
    if (seen.has(rule.ruleCode)) errors.push(`WORKFLOW_V2_ROUTING_RULE_DUPLICATE:${rule.ruleCode}`);
    seen.add(rule.ruleCode);
    if (!record(rule.matches) || Object.entries(rule.matches).some(([dimension, values]) => !Object.hasOwn(policy.dimensions, dimension) || !Array.isArray(values) || values.length < 1 || values.length > 64 || new Set(values).size !== values.length || values.some(v => !text(v, 255)))) errors.push(`WORKFLOW_V2_ROUTING_MATCH_INVALID:${rule.ruleCode}`);
  }
  return [...new Set(errors)];
}

/** Semantic equality ignores object insertion order and display titles. */
export function workflowAssignmentRoutingSemantic(policy: WorkflowAssignmentRoutingPolicy): string {
  return JSON.stringify({ policyCode: policy.policyCode, strategy: policy.strategy,
    dimensions: Object.entries(policy.dimensions).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, d]) => [key, d.valueFrom]),
    sources: Object.entries(policy.sources).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, s]) => [key, s.provider, s.roleCode, s.scope?.dimension ?? null, s.scope?.valueFrom ?? null, s.scope?.value ?? null]),
  });
}

export function validateWorkflowAssignmentRoutingBindings(bindings: Array<{ bindings?: Record<string, { routing?: WorkflowAssignmentRoutingPolicy }> }>): string[] {
  const errors: string[] = [], policies = new Map<string, string>();
  for (const binding of bindings) for (const [bindingCode, entry] of Object.entries(binding.bindings || {})) {
    if (!record(entry) || entry.routing === undefined) continue;
    const diagnostics = validateWorkflowAssignmentRoutingPolicy(entry.routing);
    if (diagnostics.length) { errors.push(...diagnostics.map(error => `${error}:${bindingCode}`)); continue; }
    const semantic = workflowAssignmentRoutingSemantic(entry.routing), existing = policies.get(entry.routing.policyCode);
    if (existing && existing !== semantic) errors.push(`WORKFLOW_V2_ROUTING_POLICY_CONFLICT:${entry.routing.policyCode}`);
    policies.set(entry.routing.policyCode, semantic);
  }
  return [...new Set(errors)];
}

/** Evaluates only code-declared scalar paths, never prototype properties. */
export function workflowAssignmentRoutingFacts(policy: WorkflowAssignmentRoutingPolicy, facts: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [dimension, declaration] of Object.entries(policy.dimensions)) {
    let value: unknown = facts;
    for (const key of declaration.valueFrom.split('.')) value = record(value) && Object.hasOwn(value, key) ? value[key] : undefined;
    if (!((typeof value === 'string' && text(value, 255)) || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean')) throw new Error(`WORKFLOW_V2_ROUTING_FACT_REQUIRED:${dimension}`);
    result[dimension] = String(value);
  }
  return result;
}

/** Same deterministic selection for preview and node entry; candidates still belong to the resolver. */
export function selectWorkflowAssignmentRoutingRules(policy: WorkflowAssignmentRoutingPolicy, rules: WorkflowAssignmentRoutingRule[], input: { workflowCode: string; nodeId: string; facts: Record<string, string>; at: number }) {
  const matched = rules.filter(rule => rule.enabled && (!rule.validFrom || Date.parse(rule.validFrom) <= input.at) && (!rule.validTo || Date.parse(rule.validTo) > input.at) && (!rule.workflowCode || rule.workflowCode === input.workflowCode) && (!rule.nodeId || rule.nodeId === input.nodeId) && Object.entries(rule.matches).every(([dimension, values]) => values.includes(input.facts[dimension]!)));
  if (matched.length > WORKFLOW_ROUTING_MAX_MATCHED_RULES) throw new Error('WORKFLOW_V2_ROUTING_MATCH_LIMIT_EXCEEDED');
  const order = (a: WorkflowAssignmentRoutingRule, b: WorkflowAssignmentRoutingRule) => b.priority - a.priority || Number(Boolean(a.workflowCode)) - Number(Boolean(b.workflowCode)) || Number(Boolean(a.nodeId)) - Number(Boolean(b.nodeId)) || (a.ruleCode < b.ruleCode ? -1 : a.ruleCode > b.ruleCode ? 1 : 0);
  const replacements = matched.filter(rule => rule.effect === 'replace').sort(order);
  if (replacements.length > 1 && replacements[0]!.priority === replacements[1]!.priority) throw new Error('WORKFLOW_V2_ROUTING_REPLACE_CONFLICT');
  const replacement = replacements[0];
  const appended = replacement && policy.strategy === 'replace_only' ? [] : matched.filter(rule => rule.effect === 'append').sort(order);
  const applied = [...(replacement ? [replacement] : []), ...appended];
  return { matched: matched.sort(order), replacement, applied, ignored: matched.filter(rule => !applied.includes(rule)) };
}
