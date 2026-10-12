import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import {
  validateWorkflowConditionalAssignmentShape as shape,
  validateWorkflowConditionalAssignment as validate,
  workflowAssignmentLeaves as leaves,
  workflowConditionalAssignmentFact as fact,
  selectWorkflowConditionalAssignment as select,
  workflowConditionalAssignmentSchema,
} from '../src/native-compiler/workflow-conditional-assignment.js';
import { evaluateWorkflowExpression as evaluate } from '../src/native-compiler/workflow-expression.js';
import { workflowBindingRoleCodes } from '../src/native-compiler/workflow-role-union.js';
import { workflowBindingSchema } from '../src/native-compiler/workflow-schema.js';
import { sha256Digest } from '../src/canonical.js';
const literal = (value: unknown): any => ({ op: 'literal', value });
const path = (path: string): any => ({ op: 'path', path });
const compare = (name = 'amount', value: unknown = 100, op = 'gte'): any => ({ op, left: path(name), right: literal(value) });
const role = (roleCode: string): any => ({ provider: 'app_role', roleCode });
const fixed = (id: string): any => ({ provider: 'fixed_users', users: [id] });
const chain = (): any => ({ provider: 'supervisor_chain', from: 'initiator', until: { roleCode: 'director' }, continuous: true });
const binding = (): any => ({ provider: 'conditional', cases: [
  { label: '大额', when: compare('amount', 1000), assignee: role('finance') },
  { label: '常规', when: compare('amount', 100), assignee: fixed('user-b') },
], otherwise: role('manager') });
function context(): any {
  return { nodeId: 'review', standardProviders: ['fixed_users', 'app_role'], releasedSources: {}, definition: {
    schemaVersion: 'openxiangda.workflow-definition/v2', code: 'purchase', title: '采购', acceptedCommandDeactivationPolicy: 'finish-pinned',
    subject: { resourceCode: 'purchase', factProjection: {} }, startAt: 'review',
    inputSchema: { type: 'object', additionalProperties: false, required: ['amount', 'enabled', 'department', 'tags'], properties: {
      amount: { type: 'number' }, enabled: { type: 'boolean' }, department: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 20 }, optional: { type: 'string' },
      optionalObject: { type: 'object', required: ['nested'], properties: { nested: { type: 'string' } } },
      detail: { type: 'object', required: ['total'], properties: { total: { type: 'number' } } },
    } }, nodes: {
      review: { id: 'review', kind: 'approval', title: '审批', mode: 'all', binding: 'people', onApprove: 'done', onReject: 'done' },
      done: { id: 'done', kind: 'end', title: '完成', outcome: 'approved' },
    },
  } };
}
test('ordered first match selects intent once; no resolver or backend lives in the helper', () => {
  const entry = binding(), ctx = context();
  assert.deepEqual(validate(entry, ctx), []);
  const first = select(entry, ctx.definition, ctx.nodeId, { amount: 2000 });
  assert.equal(first.matched, 0); assert.equal(first.assignee, entry.cases[0].assignee); assert.equal(first.label, '大额');
  assert.deepEqual(first.factReads, [{ path: 'amount', present: true, value: 2000 }]);
  const second = select(entry, ctx.definition, ctx.nodeId, { amount: 300 });
  assert.equal(second.matched, 1); assert.equal(second.assignee, entry.cases[1].assignee);
  assert.equal(second.factReads.length, 2);
});
test('otherwise is explicit and only used when all evaluated cases are false', () => {
  const entry = binding(), ctx = context(), result = select(entry, ctx.definition, 'review', { amount: 10 });
  assert.equal(result.matched, 'otherwise'); assert.equal(result.assignee, entry.otherwise);
  assert.equal(result.factReads.length, 2); assert.equal(result.label, undefined);
});
test('missing and mistyped evaluated facts fail instead of falling through', () => {
  const entry = binding(), ctx = context();
  for (const amount of [undefined, null, '2000', true, {}, [], NaN, Infinity]) {
    assert.throws(() => select(entry, ctx.definition, 'review', { amount }), /EXPRESSION_(FACT_MISSING|TYPE_INVALID)/);
  }
});
test('later cases and AND/OR operands are not evaluated after a match/short circuit', () => {
  const entry = binding(), ctx = context();
  entry.cases[1].when = compare('department', 'finance', 'eq');
  assert.equal(select(entry, ctx.definition, 'review', { amount: 2000 }).matched, 0);
  assert.throws(() => select(entry, ctx.definition, 'review', { amount: 300 }), /FACT_MISSING/);
  for (const [op, value] of [['and', false], ['or', true]]) {
    entry.cases[0].when = { op, values: [literal(value), compare('department', 'finance', 'eq')] };
    entry.cases = entry.cases.slice(0, 1);
    assert.equal(select(entry, ctx.definition, 'review', {}).matched, op === 'or' ? 0 : 'otherwise');
  }
});
test('optional facts are allowed solely as direct exists operands', () => {
  const entry = binding(), ctx = context();
  entry.cases = [{ when: { op: 'exists', value: path('optional') }, assignee: role('finance') }];
  assert.deepEqual(validate(entry, ctx), []);
  assert.equal(select(entry, ctx.definition, 'review', {}).matched, 'otherwise');
  assert.deepEqual(select(entry, ctx.definition, 'review', {}).factReads, [{ path: 'optional', present: false }]);
  assert.equal(select(entry, ctx.definition, 'review', { optional: 'present' }).matched, 0);
  assert.throws(() => select(entry, ctx.definition, 'review', { optional: 5 }), /TYPE_INVALID/);
  entry.cases[0].when = { op: 'and', values: [{ op: 'exists', value: path('optional') }, compare('optional', 'x', 'eq')] };
  assert.ok(validate(entry, ctx).some(error => error.includes('FACT_OPTIONAL:optional')));
});
test('required nested children of optional objects are still optional', () => {
  const ctx = context();
  assert.equal(fact(ctx.definition, 'review', 'optionalObject.nested')?.required, false);
  assert.equal(fact(ctx.definition, 'review', 'detail.total')?.required, false);
  ctx.definition.inputSchema.required.push('detail');
  assert.equal(fact(ctx.definition, 'review', 'detail.total')?.required, true);
});
test('exists cannot hide a missing required fact behind the default assignment', () => {
  const ctx = context(), entry = binding();
  entry.cases = [{ when: { op: 'exists', value: path('amount') }, assignee: role('finance') }];
  assert.deepEqual(validate(entry, ctx), []);
  assert.throws(() => select(entry, ctx.definition, 'review', {}), /FACT_MISSING/);
});
test('schema/operator type mismatch and non-boolean root are rejected before entry', () => {
  const ctx = context();
  for (const when of [compare('amount', '100'), compare('enabled', true, 'gte'), path('amount'), literal('truthy'),
    { op: 'not', value: path('amount') }, { op: 'and', values: [literal(1)] },
    compare('department', ['a', 1], 'in'), { op: 'contains', left: path('tags'), right: literal(2) }]) {
    const entry = binding(); entry.cases[0].when = when;
    assert.ok(validate(entry, ctx).length, JSON.stringify(when));
    assert.throws(() => select(entry, ctx.definition, 'review', {}), /CONDITIONAL/);
  }
});
test('typed scalar equality, membership, contains and NOT use strict existing evaluator', () => {
  const ctx = context();
  for (const when of [compare('department', ['finance', 'legal'], 'in'),
    { op: 'contains', left: path('tags'), right: literal('urgent') },
    { op: 'contains', left: path('department'), right: literal('fin') },
    { op: 'not', value: { op: 'eq', left: path('enabled'), right: literal(false) } }]) {
    const entry = binding(); entry.cases = [{ when, assignee: role('finance') }];
    assert.deepEqual(validate(entry, ctx), []);
    assert.equal(select(entry, ctx.definition, 'review', { department: 'finance', tags: ['urgent'], enabled: true }).matched, 0);
  }
});
test('legacy branches keep their default coercion and missing-path semantics', () => {
  assert.equal(evaluate(compare('amount', 100), { amount: '200' }), true);
  assert.equal(evaluate(compare('amount', 100), {}), false);
  assert.equal(evaluate({ op: 'and', values: [literal('yes')] }, {}), true);
  assert.equal(evaluate({ op: 'contains', left: literal('123'), right: literal(2) }, {}), true);
  assert.equal(evaluate({ op: 'exists', value: path('absent') }, {}), false);
  assert.throws(() => evaluate({ op: 'and', values: [literal('yes')] }, {}, { strict: true }), /TYPE_INVALID/);
});
test('all leaves are bounded, closed and nonconditional, including the otherwise leaf', () => {
  const entry = binding(); assert.equal(leaves(entry).length, 3);
  for (const invalid of [undefined, { provider: 'conditional', cases: [], otherwise: role('manager') },
    { provider: 'application_provider', providerCode: 'external' }, { provider: 'initiator_select', roleCode: 'manager' },
    { provider: 'department_supervisor', departmentIdFrom: 'department', level: 1 },
    { provider: 'fixed_users', users: [] }, { provider: 'fixed_users', users: ['a', 'a'] },
    { provider: 'initiator', users: ['admin'] }, { ...role('manager'), scope: { dimension: 'org', value: 'x' } },
    { ...role('manager'), min: 4, max: 2 }, { ...role('manager'), roleCodes: ['other', 'manager'] }]) {
    const changed = binding(); changed.otherwise = invalid;
    assert.ok(shape(changed).length); assert.throws(() => leaves(changed), /BINDING_INVALID/);
  }
  assert.deepEqual(leaves(role('manager')), [role('manager')]);
});
test('invalid unselected branches cannot bypass save/publish shape validation', () => {
  const entry = binding(), ctx = context(); entry.cases[1].assignee = { provider: 'fixed_users', users: [] };
  assert.ok(validate(entry, ctx).some(error => error.includes('USERS_INVALID:1')));
  assert.throws(() => select(entry, ctx.definition, 'review', { amount: 2000 }), /USERS_INVALID/);
});
test('mandatory default, rule count, UTF-8 bytes, finite JSON and cycles are bounded', () => {
  for (const mutate of [
    (entry: any) => { delete entry.otherwise; }, (entry: any) => { entry.cases = []; },
    (entry: any) => { entry.cases = Array.from({ length: 21 }, () => entry.cases[0]); },
    (entry: any) => { entry.cases[0].label = '中'.repeat(161); },
    (entry: any) => { entry.cases[0].when = literal(Infinity); },
    (entry: any) => { entry.cases[0].when.value = entry; },
    (entry: any) => { entry.otherwise.users = ['中'.repeat(6000)]; },
    (entry: any) => { entry.cases[0].when = literal(new Date()); },
  ]) { const entry = binding(); mutate(entry); assert.ok(shape(entry).length); }
  const entry = binding(); entry.cases = Array.from({ length: 20 }, () => structuredClone(entry.cases[0])); assert.deepEqual(shape(entry), []);
});
test('dangerous, malformed and over-budget ASTs are rejected without reading prototypes', () => {
  const entry = binding();
  for (const when of [path('__proto__.x'), path('constructor.x'), path('amount..x'), path('amount.'),
    { ...compare(), shell: true }, { op: 'and', values: [] }, { op: 'exists', value: literal('x') },
    { op: 'literal' }, { op: 'literal', value: true, ignored: 'x' }]) {
    entry.cases[0].when = when; assert.ok(shape(entry).length, JSON.stringify(when));
  }
  let when: any = literal(true); for (let i = 0; i < 30; i++) when = { op: 'not', value: when };
  entry.cases[0].when = when; assert.ok(shape(entry).length);
});
test('new authorable sources are bounded by explicit platform provider/dimension ceilings', () => {
  const entry = binding(), ctx = context();
  ctx.standardProviders = []; assert.ok(validate(entry, ctx).some(error => error.includes('LEAF_UNRELEASED')));
  ctx.standardProviders = ['fixed_users', 'app_role', 'app_role_in_scope'];
  entry.otherwise = { provider: 'app_role_in_scope', roleCode: 'manager', scope: { dimension: 'department', valueFrom: 'department' } };
  assert.ok(validate(entry, ctx).some(error => error.includes('LEAF_UNRELEASED')));
  ctx.scopeDimensions = ['department']; assert.deepEqual(validate(entry, ctx), []);
  entry.otherwise.min = 2; assert.ok(validate(entry, ctx).some(error => error.includes('LEAF_UNRELEASED')));
});
test('advanced sources are exact declarations, not editable parameter templates', () => {
  const entry = binding(), ctx = context();
  const advanced = [{ provider: 'initiator' }, { provider: 'previous_node_actor' },
    { provider: 'input_users', inputPath: 'department' }, { provider: 'form_field_users', inputPath: 'department' },
    { provider: 'business_relation', relationCode: 'owner', resourceCode: 'purchase', resourceIdFrom: 'department' }];
  for (const source of advanced) {
    entry.otherwise = source; ctx.releasedSources = {};
    assert.ok(validate(entry, ctx).some(error => error.includes('LEAF_UNRELEASED')));
    ctx.releasedSources = { released: source }; assert.deepEqual(validate(entry, ctx), []);
    entry.otherwise = { ...source, min: 2 }; assert.ok(validate(entry, ctx).some(error => error.includes('LEAF_UNRELEASED')));
  }
});
test('frozen canvas defaults independently authorize exact leaves absent from source catalogue', () => {
  const ctx = context(), entry = binding(), source = { provider: 'input_users', inputPath: 'department' };
  entry.otherwise = source; ctx.frozenDefault = structuredClone(source);
  assert.deepEqual(validate(entry, ctx), []);
  ctx.frozenDefault = { provider: 'conditional', cases: [{ when: literal(true), assignee: structuredClone(source) }], otherwise: role('manager') };
  assert.deepEqual(validate(entry, ctx), []);
  entry.otherwise.inputPath = 'amount'; assert.ok(validate(entry, ctx).some(error => error.includes('LEAF_UNRELEASED')));
});
test('leaf semantic identity ignores key order, but not parameter values', () => {
  const ctx = context(), entry = binding();
  entry.otherwise = { provider: 'input_users', inputPath: 'department' };
  ctx.releasedSources = { released: { inputPath: 'department', provider: 'input_users' } };
  assert.deepEqual(validate(entry, ctx), []);
});
test('conditional assignments are limited to approval and handling nodes', () => {
  const ctx = context(), entry = binding();
  ctx.definition.nodes.review.kind = 'handle'; ctx.definition.nodes.review.next = 'done'; assert.deepEqual(validate(entry, ctx), []);
  for (const kind of ['cc', 'action', 'condition', 'join', 'end']) {
    ctx.definition.nodes.review.kind = kind; assert.deepEqual(validate(entry, ctx), ['WORKFLOW_CONDITIONAL_HUMAN_REQUIRED']);
    assert.throws(() => select(entry, ctx.definition, 'review', { amount: 2000 }), /HUMAN_REQUIRED/);
  }
});
function withStep(): any {
  const ctx = context();
  ctx.definition.startAt = 'calculate';
  ctx.definition.nodes.calculate = { id: 'calculate', kind: 'action', title: '计算', next: 'review', handler: { code: 'calculate-v1', version: 1, mode: 'pure' },
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }, inputs: {},
    outputSchema: { type: 'object', additionalProperties: false, required: ['total'], properties: { total: { type: 'number' }, optional: { type: 'number' } } } };
  return ctx;
}
test('required step outputs may be used only after their producer on every incoming path', () => {
  const ctx = withStep(), entry = binding(); entry.cases[0].when = compare('steps.calculate.total', 1000);
  assert.deepEqual(validate(entry, ctx), []); assert.equal(fact(ctx.definition, 'review', 'steps.calculate.total')?.required, true);
  assert.equal(select(entry, ctx.definition, 'review', { amount: 0, steps: { calculate: { total: 2000 } } }).matched, 0);
  ctx.definition.nodes.branch = { id: 'branch', kind: 'condition', title: '分支', branches: [{ when: literal(true), target: 'calculate' }], otherwise: 'review' };
  ctx.definition.startAt = 'branch';
  assert.ok(validate(entry, ctx).some(error => error.includes('FACT_UNAVAILABLE:steps.calculate.total')));
});
test('unknown, self, unreachable and optional step facts do not become available accidentally', () => {
  const ctx = withStep();
  assert.equal(fact(ctx.definition, 'calculate', 'steps.calculate.total'), undefined);
  assert.equal(fact(ctx.definition, 'review', 'steps.unknown.total'), undefined);
  assert.equal(fact(ctx.definition, 'review', 'steps.calculate.optional')?.required, false);
  ctx.definition.startAt = 'done'; assert.equal(fact(ctx.definition, 'review', 'amount'), undefined);
});
test('unavailable leaf fact inputs are rejected even when their declaration is released', () => {
  const ctx = withStep(), entry = binding();
  const source = { provider: 'input_users', inputPath: 'steps.calculate.total' };
  ctx.releasedSources = { released: source }; entry.otherwise = source;
  assert.deepEqual(validate(entry, ctx), []);
  ctx.definition.startAt = 'review';
  assert.ok(validate(entry, ctx).some(error => error.includes('LEAF_FACT_UNAVAILABLE')));
});
test('any continuous chain leaf enforces sequence and existing organization-context gates', () => {
  const ctx = context(), entry = binding(); entry.otherwise = chain(); ctx.releasedSources = { chain: chain() };
  assert.ok(validate(entry, ctx).some(error => error.includes('SEQUENCE_REQUIRED')));
  ctx.definition.nodes.review.mode = 'sequence';
  assert.ok(validate(entry, ctx).some(error => error.includes('DEPARTMENT_CONTEXT_REQUIRED')));
  ctx.definition.organizationContext = { department: { source: 'user_primary_department', required: true } };
  assert.deepEqual(validate(entry, ctx), []);
  entry.otherwise.continuous = false; ctx.releasedSources.chain.continuous = false; ctx.definition.nodes.review.mode = 'all';
  assert.deepEqual(validate(entry, ctx), []);
});
test('the one leaf iterator exposes roles including frozen supervisor role stops', () => {
  const entry = binding(); entry.cases[0].assignee = { provider: 'app_role', roleCodes: ['finance', 'legal'] }; entry.otherwise = chain();
  assert.deepEqual(leaves(entry).flatMap(workflowBindingRoleCodes), ['finance', 'legal', 'director']);
});
test('rule labels, order, conditions and otherwise participate in canonical identity', () => {
  const entry = binding(), hash = sha256Digest(entry); assert.equal(sha256Digest(JSON.parse(JSON.stringify(entry))), hash);
  for (const mutate of [(copy: any) => copy.cases.reverse(), (copy: any) => { copy.cases[0].label = 'changed'; },
    (copy: any) => { copy.cases[0].when.right.value = 900; }, (copy: any) => { copy.otherwise.roleCode = 'director'; }]) {
    const copy = structuredClone(entry); mutate(copy); assert.notEqual(sha256Digest(copy), hash);
  }
});
test('canonical schema accepts conditional declarations while rejecting nested and mixed entries', () => {
  const Ajv = createRequire(new URL('../../devkit-core/package.json', import.meta.url))('ajv/dist/2020.js').default;
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const standalone = ajv.compile(workflowConditionalAssignmentSchema), canonical = ajv.compile(workflowBindingSchema);
  assert.equal(standalone(binding()), true, JSON.stringify(standalone.errors));
  for (const patch of [{ cases: [] }, { otherwise: { provider: 'conditional' } }, { shell: true }, { otherwise: { provider: 'application_provider', providerCode: 'x' } }]) assert.equal(standalone({ ...binding(), ...patch }), false);
  assert.equal(canonical({ schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: 'purchase', bindings: { people: binding() } }), true);
  assert.equal(canonical({ schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: 'purchase', bindings: { people: role('manager') } }), true);
});
