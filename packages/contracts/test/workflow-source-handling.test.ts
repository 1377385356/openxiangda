import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  projectWorkflowSourceAssignment as project, restoreWorkflowSourceAssignment as restore,
  validateWorkflowSourceAssignment as validate, workflowSourceNamedAssignmentSummary as summary,
  validateWorkflowSourceBundle, workflowSourceReferences, workflowSourceImportDrift,
  type WorkflowSourceBundle,
} from '../src/native-compiler/workflow-source-sync.js';
import type { WorkflowBindingEntry, WorkflowDefinition } from '../src/types.js';
const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const definition = (): WorkflowDefinition => ({ schemaVersion: 'openxiangda.workflow-definition/v2', code: 'review', title: 'Review',
  subject: { resourceCode: 'requests', factProjection: {} }, acceptedCommandDeactivationPolicy: 'finish-pinned', startAt: 'a',
  inputSchema: { type: 'object', additionalProperties: false, required: ['amount', 'department'], properties: { amount: { type: 'number' }, department: { type: 'string' } } },
  nodes: { a: { id: 'a', title: 'A', kind: 'approval', mode: 'single', binding: 'people', onApprove: 'done', onReject: 'done', administration: { assigneeProviders: ['fixed_users', 'app_role'] } }, done: { id: 'done', title: 'Done', kind: 'end', outcome: 'approved' } },
});
const rules = (): WorkflowBindingEntry => ({ provider: 'conditional', cases: [
  { label: 'Large', when: { op: 'gte', left: { op: 'path', path: 'amount' }, right: { op: 'literal', value: 1000 } }, assignee: { provider: 'app_role', roleCodes: ['finance', 'legal'], delegatable: false } },
  { label: 'Small', when: { op: 'literal', value: false }, assignee: { provider: 'previous_node_actor' } },
], otherwise: { provider: 'app_role_in_scope', roleCode: 'backup', scope: { dimension: 'department', valueFrom: 'department' } } });
const bundle = (): WorkflowSourceBundle => {
  const d = definition(), binding = { schemaVersion: 'openxiangda.workflow-binding/v2' as const, workflowCode: 'review', bindings: { people: { provider: 'fixed_users' as const, users: ['code-owned-person'] } } };
  const references = workflowSourceReferences(d,binding,digest), handling = { a: { assignee: project(rules()) } };
  return { schemaVersion: 'openxiangda.workflow-source-bundle/v2', appCode: 'app', workflowCode: 'review', definition: d, binding, references, handling,
    origin: { environmentKey: 'production', headRevision: 1, definitionVersion: 1, bindingVersion: 1, definitionDigest: digest(d), bindingDigest: digest(binding), catalogDigest: digest(references), handlingDigest: digest(handling) } };
};
const refresh = (b: WorkflowSourceBundle) => {
  b.references = workflowSourceReferences(b.definition,b.binding,digest);
  b.origin = { ...b.origin, definitionDigest: digest(b.definition), bindingDigest: digest(b.binding), catalogDigest: digest(b.references), handlingDigest: digest(b.handling) };
};

test('preserves complete ordered non-private conditional rules, routing intent, labels and otherwise', () => {
  const entry = rules(), before = structuredClone(entry), projected = project(entry);
  assert.deepEqual(validate(projected, definition(), 'a'), []);
  assert.deepEqual(restore(projected), entry);
  assert.deepEqual(entry, before);
  assert.equal(summary(projected).present, false);
  assert.notEqual(restore(projected), entry);
});
for (const location of ['unmatched', 'otherwise', 'empty'] as const) test(`redacts ${location} private leaves and protects the entire assignment`, () => {
  const entry = rules(); assert.equal(entry.provider, 'conditional'); if (entry.provider !== 'conditional') throw Error();
  const named = { provider: 'fixed_users' as const, users: location === 'empty' ? [] : ['private-person', 'private-two'] };
  // Empty is a shape-invalid runtime rule, but the DTO can represent a protected
  // empty named override. It must not become an empty runnable assignment.
  if (location === 'unmatched') entry.cases[1]!.assignee = named; else entry.otherwise = location === 'empty' ? { provider: 'fixed_users', users: ['private-person'] } : named;
  const projected = project(entry); assert.equal(projected.kind, 'conditional');
  if (location === 'empty' && projected.kind === 'conditional') projected.otherwise = { kind: 'named_people', count: 0 };
  assert.equal(JSON.stringify(projected).includes('private-person'), false);
  assert.equal(JSON.stringify(projected).includes('source-private-leaf'), false);
  assert.deepEqual(validate(projected, definition(), 'a'), []);
  assert.equal(restore(projected), undefined);
  assert.deepEqual(summary(projected), { present: true, count: location === 'empty' ? 0 : 2 });
});

test('canonical source identities retain their exact digest while private handling is count-only', () => {
  const b = bundle(); const entry = rules(); if (entry.provider !== 'conditional') throw Error();
  entry.otherwise = { provider: 'fixed_users', users: ['private-person'] };
  b.handling.a!.assignee = project(entry); refresh(b);
  assert.deepEqual(validateWorkflowSourceBundle(b,digest), []);
  assert.deepEqual(b.binding.bindings.people?.users, ['code-owned-person']);
  assert.equal(JSON.stringify(b).includes('private-person'), false);
  assert.equal(digest(b.binding), b.origin.bindingDigest);
});

test('v2 reads an unchanged canonical conditional declaration; v1 explicitly refuses it', () => {
  const b = bundle(); b.binding.bindings.people = rules(); refresh(b);
  assert.deepEqual(validateWorkflowSourceBundle(b,digest), []);
  assert.deepEqual(workflowSourceImportDrift(b.definition,b.binding,b,digest), []);
  b.schemaVersion = 'openxiangda.workflow-source-bundle/v1';
  assert.deepEqual(validateWorkflowSourceBundle(b,digest), ['WORKFLOW_SOURCE_CONDITIONAL_EXPORT_UNAVAILABLE']);
});

for (const variant of ['leak', 'binding-users', 'nested', 'unknown', 'missing', 'count', 'too-many', 'wrong-type', 'optional', 'cc', 'skip'] as const) test(`refuses ${variant} even after the bundle digests are refreshed`, () => {
  const b = bundle(), assignee = b.handling.a!.assignee as any;
  if (variant === 'leak') assignee.otherwise = { kind: 'named_people', count: 1, userIds: ['private-person'] };
  if (variant === 'binding-users') assignee.otherwise = { kind: 'binding', binding: { provider: 'fixed_users', users: ['private-person'] } };
  if (variant === 'nested') assignee.otherwise = assignee.cases[0];
  if (variant === 'unknown') assignee.cases[0].resolvedUsers = ['private-person'];
  if (variant === 'missing') delete assignee.otherwise;
  if (variant === 'count') assignee.otherwise = { kind: 'named_people', count: 201 };
  if (variant === 'too-many') assignee.cases = Array.from({ length: 21 }, () => assignee.cases[0]);
  if (variant === 'wrong-type') b.definition.inputSchema.properties = { amount: { type: 'string' }, department: { type: 'string' } };
  if (variant === 'optional') b.definition.inputSchema.required = ['department'];
  if (variant === 'cc') b.definition.nodes.a = { id: 'a', title: 'CC', kind: 'cc', binding: 'people', next: 'done', emptyPolicy: 'block' };
  if (variant === 'skip') (b.definition.nodes.a as any).emptyPolicy = 'skip';
  refresh(b);
  assert.ok(validateWorkflowSourceBundle(b,digest).includes('WORKFLOW_BUNDLE_HANDLING_INVALID'));
});

test('canonical invalid facts and shape fail before references can masquerade as authority', () => {
  const b = bundle(); b.binding.bindings.people = rules(); b.definition.inputSchema.required = ['department']; refresh(b);
  assert.ok(validateWorkflowSourceBundle(b,digest).some(e => e.includes('FACT_OPTIONAL')));
});

test('continuous unselected chain constrains the effective handling mode', () => {
  const b = bundle(), assignee = b.handling.a!.assignee as any;
  b.definition.organizationContext = { department: { source: 'primary' } } as any;
  assignee.otherwise = { kind: 'binding', binding: { provider: 'supervisor_chain', from: 'initiator', until: 'top' } };
  b.handling.a!.mode = 'sequence'; refresh(b);
  assert.deepEqual(validateWorkflowSourceBundle(b,digest), []);
  b.handling.a!.mode = 'all'; refresh(b);
  assert.ok(validateWorkflowSourceBundle(b,digest).some(e => e.includes('SEQUENCE_REQUIRED')));
});

test('metadata integrity and raw rule resource bounds are enforced', () => {
  const b = bundle(); (b.handling.a!.assignee as any).cases[0].label = 'Tampered';
  assert.ok(validateWorkflowSourceBundle(b,digest).includes('WORKFLOW_BUNDLE_CORRUPT'));
  const bad: any = project(rules()); bad.cases[0].when = { op: 'literal', value: 'x'.repeat(20000) };
  assert.ok(validate(bad, definition(), 'a').length);
});


test('legacy single-role handling coexists with conditional handling and ordinary CC nodes', () => {
  const b = bundle();
  b.definition.nodes.cc = { id: 'cc', kind: 'cc', title: 'Copy', binding: 'copy', next: 'done' };
  (b.definition.nodes.a as any).onApprove = 'cc';
  b.binding.bindings.copy = { provider: 'app_role', roleCode: 'observer' };
  b.handling.cc = { assignee: { kind: 'roles', roleCodes: ['observer'] } };
  refresh(b);
  assert.deepEqual(validateWorkflowSourceBundle(b, digest), []);
  assert.deepEqual(restore(b.handling.cc.assignee!), { provider: 'app_role', roleCode: 'observer' });
  b.handling.a!.assignee = { kind: 'roles', roleCodes: ['finance'] };
  refresh(b);
  assert.deepEqual(validateWorkflowSourceBundle(b, digest), []);
  assert.deepEqual(restore(b.handling.a!.assignee), { provider: 'app_role', roleCode: 'finance' });
  assert.deepEqual(restore({ kind: 'roles', roleCodes: ['finance', 'legal'] }), { provider: 'app_role', roleCodes: ['finance', 'legal'] });
  for (const roleCodes of [[], ['bad role'], ['finance', 'finance'], Array.from({ length: 9 }, (_, i) => `role${i}`)]) {
    assert.throws(() => restore({ kind: 'roles', roleCodes }));
  }
});
