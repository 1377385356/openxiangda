import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWorkflowAssignmentRoutingRules, validateWorkflowAssignmentRoutingPolicy, validateWorkflowAssignmentRoutingRules,
  validateWorkflowAssignmentRoutingBindings, workflowAssignmentRoutingFacts, workflowAssignmentRoutingSemantic } from '../src/native-compiler/workflow-assignment-routing.js';
import type { WorkflowAssignmentRoutingPolicy, WorkflowAssignmentRoutingRule } from '../src/types.js';
const policy: WorkflowAssignmentRoutingPolicy = { policyCode: 'teaching-review', title: '教学职责', strategy: 'replace_then_append',
  dimensions: { college: { title: '学院', valueFrom: 'college' } }, sources: {
    extra: { title: '补充职责', provider: 'app_role_in_scope', roleCode: 'secretary', scope: { dimension: 'college', valueFrom: 'college' } },
    replacement: { title: '替换职责', provider: 'app_role', roleCode: 'reviewer' },
  } };
const rule = (ruleCode: string, change: Partial<WorkflowAssignmentRoutingRule> = {}): WorkflowAssignmentRoutingRule => ({ ruleCode, title: ruleCode, enabled: true, matches: {}, sourceCode: 'extra', effect: 'append', priority: 0, ...change });
const select = (rules: WorkflowAssignmentRoutingRule[], p = policy, at = Date.parse('2026-10-02T00:00:00Z')) => selectWorkflowAssignmentRoutingRules(p, rules, { workflowCode: 'requests', nodeId: 'review', facts: { college: 'art' }, at });

test('routing preserves generic and specific append order independently of storage order', () => {
  const rules = [rule('specific', { workflowCode: 'requests', nodeId: 'review', matches: { college: ['art'] } }), rule('generic-z'), rule('generic-a'), rule('priority', { priority: 1 })];
  assert.deepEqual(validateWorkflowAssignmentRoutingRules(policy, rules), []);
  assert.deepEqual(select(rules).applied.map(r => r.ruleCode), ['priority', 'generic-a', 'generic-z', 'specific']);
  assert.equal(select(rules).replacement, undefined);
});
test('highest replacement is unique; lower replacements are visible as ignored', () => {
  const rules = [rule('low', { effect: 'replace', priority: 1 }), rule('high', { effect: 'replace', priority: 2 }), rule('addition')];
  assert.deepEqual(select(rules).applied.map(r => r.ruleCode), ['high', 'addition']);
  assert.deepEqual(select(rules).ignored.map(r => r.ruleCode), ['low']);
  assert.throws(() => select([...rules, rule('conflict', { effect: 'replace', priority: 2 })]), /REPLACE_CONFLICT/);
});
test('replace_only skips appends only when a replacement matches', () => {
  const p = { ...policy, strategy: 'replace_only' as const };
  assert.deepEqual(select([rule('addition')], p).applied.map(r => r.ruleCode), ['addition']);
  assert.deepEqual(select([rule('replace', { effect: 'replace' }), rule('addition')], p).applied.map(r => r.ruleCode), ['replace']);
});
test('disabled, other workflow/node/dimension, future and expired rules do not match; interval is half open', () => {
  const rules = [rule('disabled', { enabled: false }), rule('other', { workflowCode: 'other' }), rule('other-node', { workflowCode: 'requests', nodeId: 'other' }), rule('other-college', { matches: { college: ['science'] } }),
    rule('future', { validFrom: '2026-10-03T00:00:00Z' }), rule('ended', { validTo: '2026-10-02T00:00:00Z' }), rule('starts', { validFrom: '2026-10-02T00:00:00Z', validTo: '2026-10-03T00:00:00Z' })];
  assert.deepEqual(select(rules).applied.map(r => r.ruleCode), ['starts']);
});
test('matching is limited after predicates; 64 match, 65 fail rather than silently truncate', () => {
  const rules = Array.from({ length: 256 }, (_, i) => rule(`rule-${i}`, { enabled: i < 64 }));
  assert.equal(select(rules).matched.length, 64);
  rules[64]!.enabled = true;
  assert.throws(() => select(rules), /MATCH_LIMIT_EXCEEDED/);
});
test('rules cannot invent dimensions/sources, mutate code or use malformed lifetime and unbounded payloads', () => {
  for (const change of [{ matches: { unknown: ['art'] } }, { matches: { college: [] } }, { matches: { college: ['art', 'art'] } }, { sourceCode: 'unknown' }, { nodeId: 'review' }, { priority: 1001 }, { validFrom: 'bad' }, { validFrom: '2026-10-03T00:00:00Z', validTo: '2026-10-02T00:00:00Z' }, { onApprove: 'other' }]) assert.ok(validateWorkflowAssignmentRoutingRules(policy, [rule('invalid', change as any)]).length);
  assert.ok(validateWorkflowAssignmentRoutingRules(policy, [rule('same'), rule('same')]).length);
  assert.ok(validateWorkflowAssignmentRoutingRules(policy, Array.from({ length: 257 }, (_, i) => rule(`r-${i}`))).length);
});
test('dimensions require own scalar facts and reject prototype paths before execution', () => {
  assert.deepEqual(workflowAssignmentRoutingFacts(policy, { college: 'art' }), { college: 'art' });
  for (const facts of [{}, { college: null }, { college: ['art'] }, Object.create({ college: 'art' })]) assert.throws(() => workflowAssignmentRoutingFacts(policy, facts), /FACT_REQUIRED/);
  for (const valueFrom of ['constructor.name', 'a.__proto__.name', 'a.prototype.name', 'a..b']) assert.ok(validateWorkflowAssignmentRoutingPolicy({ ...policy, dimensions: { college: { title: '学院', valueFrom } } }).length);
});
test('policy aliases cannot change semantics across workflows; labels and insertion order may change', () => {
  const renamed = { ...policy, title: '教学审批', sources: { replacement: policy.sources.replacement!, extra: { ...policy.sources.extra!, title: '补充秘书' } } };
  assert.equal(workflowAssignmentRoutingSemantic(policy), workflowAssignmentRoutingSemantic(renamed));
  const binding = (routing: WorkflowAssignmentRoutingPolicy) => ({ bindings: { reviewers: { routing } } });
  assert.deepEqual(validateWorkflowAssignmentRoutingBindings([binding(policy), binding(renamed)]), []);
  assert.match(validateWorkflowAssignmentRoutingBindings([binding(policy), binding({ ...policy, strategy: 'replace_only' })])[0]!, /POLICY_CONFLICT/);
});
