import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson,workflowSourceReferences,type WorkflowSourceBundle } from 'openxiangda-contracts';
import { importWorkflowSource,workflowSourceDeclaration,readWorkflowSourceLock,prepareWorkflowSourceImport,writeWorkflowRegistrationPlan,rewriteWorkflowSourceConfig } from '../src/workflow-source-sync.js';
const digest=(value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'workflow-source-')),path=join(root,'openxiangda.config.ts');
  const definition: any={ schemaVersion: 'openxiangda.workflow-definition/v2',code: 'review',title: 'Review',acceptedCommandDeactivationPolicy: 'finish-pinned',subject: { resourceCode: 'requests',factProjection: {},summaryFields: [] },inputSchema: { type: 'object',additionalProperties: false,properties: {} },startAt: 'a',nodes: { a: { id: 'a',kind: 'approval',title: 'A',binding: 'people',mode: 'single',onApprove: 'done',onReject: 'done' },done: { id: 'done',kind: 'end',title: 'Done',outcome: 'approved' } } };
  const binding: any={ schemaVersion: 'openxiangda.workflow-binding/v2',workflowCode: 'review',bindings: { people: { provider: 'fixed_users',users: ['declared-person'] } } };
  const config: any={ app: { code: 'app' },workflows: { definitions: [{ version: 1,definition,launch: { mode: 'standalone' } }],bindings: [{ version: 1,binding }],activations: [{ workflowCode: 'review',definitionVersion: 1,bindingVersion: 1,acceptedCommandDeactivationPolicy: 'finish-pinned' }] } };
  const original=`const outside = { untouched: true };\nexport default { app: { code: 'app' }, workflows: ${JSON.stringify(config.workflows)} };\n`;
  writeFileSync(path,original);
  const next=structuredClone(definition);next.title='Published title';
  const references=workflowSourceReferences(next,binding,digest),handling={ a: { assignee: { kind: 'named_people' as const,count: 2 } } };
  const bundle: WorkflowSourceBundle={ schemaVersion: 'openxiangda.workflow-source-bundle/v1',appCode: 'app',workflowCode: 'review',origin: { environmentKey: 'production',headRevision: 14,definitionVersion: 13,bindingVersion: 9,definitionDigest: digest(next),bindingDigest: digest(binding),handlingDigest: digest(handling),catalogDigest: digest(references) },definition: next,binding,references,handling };
  return { root,path,config,original,bundle };
}
test('import rewrites only workflows, retains canonical IDs and fixed references and writes a source-base lock', () => {
  const f=fixture();
  try {
    const result=importWorkflowSource(f.root,f.path,f.config,f.bundle);
    const after=readFileSync(f.path,'utf8'),lock=JSON.parse(readFileSync(result.lockPath,'utf8'));
    assert.ok(after.startsWith('const outside = { untouched: true };'));
    assert.ok(after.includes('Published title'));assert.ok(after.includes('declared-person'));
    assert.equal(lock.base.definitionDigest,f.bundle.origin.definitionDigest);assert.equal(lock.base.definitionVersion,13);
    assert.deepEqual(result.handlingNotImported,[{ nodeId: 'a',count: 2 }]);
    assert.equal(f.config.workflows.definitions[0].version,1);
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});
test('code-owned drift refuses before any source or lock write', () => {
  const f=fixture();
  try {
    f.bundle.definition.subject.resourceCode='other';f.bundle.origin.definitionDigest=digest(f.bundle.definition);
    assert.throws(() => importWorkflowSource(f.root,f.path,f.config,f.bundle),/CODE_OWNED_DRIFT/);
    assert.equal(readFileSync(f.path,'utf8'),f.original);assert.equal(existsSync(join(f.root,'platform')),false);
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});
test('ambiguous initializer and symlinked source refuse without writes', () => {
  const f=fixture(),other=fixture();
  try {
    assert.throws(() => rewriteWorkflowSourceConfig('const one={workflows:{}};const two={workflows:{}};',f.path,f.config.workflows),/REWRITE_AMBIGUOUS/);
    const alias=join(f.root,'alias.config.ts');symlinkSync(other.path,alias);
    assert.throws(() => importWorkflowSource(f.root,alias,f.config,f.bundle),/SYMLINK_FORBIDDEN/);
    assert.equal(readFileSync(other.path,'utf8'),other.original);
  } finally { rmSync(f.root,{ recursive: true,force: true });rmSync(other.root,{ recursive: true,force: true }); }
});
test('a registration plan seals only numbers; an observed environment revision never enters source', () => {
  const f=fixture();
  try {
    writeWorkflowRegistrationPlan(f.root,f.path,f.config,[{ workflowCode: 'review',definition: { resolution: 'suggested',number: 2,digest: digest(f.config.workflows.definitions[0].definition) },binding: { resolution: 'existing',number: 1,digest: digest(f.bundle.binding) },observedHead: { revision: 987654,definitionDigest: 'diagnostic-only',bindingDigest: 'diagnostic-only' } }]);
    const after=readFileSync(f.path,'utf8');assert.ok(after.includes('"definitionVersion": 2'));assert.equal(after.includes('987654'),false);assert.equal(after.includes('observedHead'),false);
    assert.equal(f.config.workflows.activations[0].definitionVersion,1);
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

test('handling adoption retains legacy forward actions and never copies runtime people', () => {
  const f=fixture();
  try {
    f.bundle.handling.a={ operations: { return: { enabled: false,label: 'Back' } },assignee: { kind: 'named_people',count: 2 } };
    f.bundle.origin.handlingDigest=digest(f.bundle.handling);
    const prepared=prepareWorkflowSourceImport(f.config,f.bundle,true);
    const node=prepared.workflows.definitions[0]!.definition.nodes.a as any;
    assert.ok(node.allowedOperations.includes('approve'));
    assert.ok(node.allowedOperations.includes('reject'));
    assert.equal(node.allowedOperations.includes('return'),false);
    assert.deepEqual(prepared.workflows.bindings[0]!.binding.bindings.people.users,['declared-person']);
    assert.deepEqual(prepared.workflows.activations[0]!.sourceBase,{ definitionDigest: f.bundle.origin.definitionDigest,bindingDigest: f.bundle.origin.bindingDigest });
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});
test('registration plans refuse a retained different-content version before file writes', () => {
  const f=fixture();
  try {
    const retained=structuredClone(f.config.workflows.definitions[0]);retained.version=2;retained.definition.title='Retained';f.config.workflows.definitions.push(retained);
    assert.throws(() => writeWorkflowRegistrationPlan(f.root,f.path,f.config,[{ workflowCode: 'review',definition: { resolution: 'suggested',number: 2,digest: digest(f.config.workflows.definitions[0].definition) },binding: { resolution: 'existing',number: 1,digest: digest(f.bundle.binding) },observedHead: null }]),/LOCAL_VERSION_CONFLICT/);
    assert.equal(readFileSync(f.path,'utf8'),f.original);
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

test('a corrupted origin lock refuses source status rather than guessing an environment', () => {
  const f=fixture();
  try {
    const imported=importWorkflowSource(f.root,f.path,f.config,f.bundle),lock=JSON.parse(readFileSync(imported.lockPath,'utf8'));
    lock.origin.environmentKey='foreign';writeFileSync(imported.lockPath,JSON.stringify(lock));
    assert.throws(() => readWorkflowSourceLock(f.root,'review'),/WORKFLOW_SOURCE_LOCK_INVALID/);
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

test('registration and import use the same definition normalisation as the sealed compiler', () => {
  const f=fixture();
  try {
    delete f.config.workflows.definitions[0].definition.subject.summaryFields;
    assert.equal(workflowSourceDeclaration(f.config,'review').definitionDigest,digest({ ...f.config.workflows.definitions[0].definition,subject: { ...f.config.workflows.definitions[0].definition.subject,summaryFields: [] } }));
    assert.doesNotThrow(() => prepareWorkflowSourceImport(f.config,f.bundle));
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

test('source import only rewrites workflows owned by the exported application config', () => {
  const f=fixture();
  try {
    assert.throws(() => rewriteWorkflowSourceConfig("const unrelated={app:{code:'app'},workflows:{}};export default {app:{code:'app'}};",f.path,f.config.workflows),/REWRITE_AMBIGUOUS/);
    const linked=`const config={app:{code:'app'},workflows:{}};export default defineOpenXiangdaApp(config);`;
    assert.ok(rewriteWorkflowSourceConfig(linked,f.path,f.config.workflows).includes('"definitions"'));
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

function conditionalFixture() {
  const f = fixture();
  const local = f.config.workflows.definitions[0].definition;
  local.inputSchema = { type: 'object', additionalProperties: false, required: ['amount'], properties: { amount: { type: 'number' } } };
  local.nodes.a.administration = { assigneeProviders: ['fixed_users', 'app_role'], modes: ['single', 'all', 'sequence'] };
  local.nodes.b = { ...structuredClone(local.nodes.a), id: 'b', title: 'B', onApprove: 'done' };
  local.nodes.a.onApprove = 'b';
  f.bundle.definition = structuredClone(local); f.bundle.definition.title = 'Published title';
  f.bundle.schemaVersion = 'openxiangda.workflow-source-bundle/v2';
  f.bundle.handling = { a: { assignee: { kind: 'conditional', cases: [{ label: 'Large', when: { op: 'gte', left: { op: 'path', path: 'amount' }, right: { op: 'literal', value: 1000 } }, assignee: { kind: 'binding', binding: { provider: 'app_role', roleCode: 'finance' } } }], otherwise: { kind: 'binding', binding: { provider: 'app_role', roleCode: 'manager' } } } } };
  f.original = `const outside = { untouched: true };\nexport default { app: { code: 'app' }, workflows: ${JSON.stringify(f.config.workflows)} };\n`;
  writeFileSync(f.path, f.original);
  refreshConditional(f.bundle);
  return f;
}
function refreshConditional(bundle: WorkflowSourceBundle) {
  bundle.references = workflowSourceReferences(bundle.definition,bundle.binding,digest);
  bundle.origin = { ...bundle.origin,definitionDigest: digest(bundle.definition),bindingDigest: digest(bundle.binding),catalogDigest: digest(bundle.references),handlingDigest: digest(bundle.handling) };
}

test('v2 conditional metadata is readable without adopting it or changing canonical source digests', () => {
  const f = conditionalFixture();
  try {
    const prepared = prepareWorkflowSourceImport(f.config,f.bundle);
    assert.deepEqual(prepared.workflows.bindings[0]!.binding,f.bundle.binding);
    assert.equal(digest(prepared.workflows.definitions[0]!.definition),f.bundle.origin.definitionDigest);
    assert.equal(digest(prepared.workflows.bindings[0]!.binding),f.bundle.origin.bindingDigest);
    assert.deepEqual(prepared.handlingNotImported,[]);
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

test('explicit v2 adoption restores all role rules without changing another shared-binding node', () => {
  const f = conditionalFixture();
  try {
    const before = structuredClone(f.config);
    const prepared = prepareWorkflowSourceImport(f.config,f.bundle,true), d = prepared.workflows.definitions[0]!.definition;
    const b = prepared.workflows.bindings[0]!.binding;
    assert.equal((d.nodes.a as any).binding,'canvas_a');
    assert.equal((d.nodes.b as any).binding,'people');
    assert.deepEqual(b.bindings.people,f.bundle.binding.bindings.people);
    assert.equal(b.bindings.canvas_a!.provider,'conditional');
    assert.deepEqual((b.bindings.canvas_a as any).cases.map((rule: any) => rule.label),['Large']);
    assert.equal((b.bindings.canvas_a as any).otherwise.roleCode,'manager');
    assert.deepEqual(prepared.workflows.activations[0]!.sourceBase,{ definitionDigest: f.bundle.origin.definitionDigest,bindingDigest: f.bundle.origin.bindingDigest });
    assert.notEqual(digest(b),f.bundle.origin.bindingDigest);
    assert.deepEqual(f.config,before);
    const result = importWorkflowSource(f.root,f.path,f.config,f.bundle,true);
    assert.deepEqual(result.handlingNotImported,[]);
    assert.ok(readFileSync(f.path,'utf8').includes('"provider": "conditional"'));
    assert.ok(readFileSync(f.path,'utf8').startsWith('const outside ='));
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

for (const count of [0,2]) test(`a private otherwise count=${count} protects the entire assignment and reports its node`, () => {
  const f = conditionalFixture();
  try {
    (f.bundle.handling.a!.assignee as any).otherwise = { kind: 'named_people',count };
    refreshConditional(f.bundle);
    const prepared = prepareWorkflowSourceImport(f.config,f.bundle,true);
    assert.deepEqual(prepared.handlingNotImported,[{ nodeId: 'a',count }]);
    assert.deepEqual(prepared.workflows.bindings[0]!.binding,f.bundle.binding);
    assert.equal((prepared.workflows.definitions[0]!.definition.nodes.a as any).binding,'people');
    assert.equal(JSON.stringify(prepared.workflows).includes('source-private-leaf'),false);
    assert.equal(JSON.stringify(prepared.workflows).includes('finance'),false);
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

for (const variant of ['unreleased','provider-ceiling','scope','fact','tamper','binding-conflict','private-leak'] as const) test(`v2 ${variant} refuses before writing either config or lock`, () => {
  const f = conditionalFixture();
  try {
    const projection = f.bundle.handling.a!.assignee as any;
    if (variant === 'unreleased') projection.otherwise = { kind: 'binding', binding: { provider: 'initiator' } };
    if (variant === 'provider-ceiling') {
      f.config.workflows.definitions[0].definition.nodes.a.administration.assigneeProviders = ['fixed_users'];
      (f.bundle.definition.nodes.a as any).administration.assigneeProviders = ['fixed_users'];
    }
    if (variant === 'scope') projection.otherwise = { kind: 'binding', binding: { provider: 'app_role_in_scope', roleCode: 'manager', scope: { dimension: 'unreleased', value: 'x' } } };
    if (variant === 'fact') projection.cases[0].when.left.path = 'missing';
    if (variant === 'binding-conflict') {
      f.bundle.binding.bindings.canvas_a = { provider: 'app_role',roleCode: 'other' };
      f.config.workflows.bindings[0].binding.bindings.canvas_a = f.bundle.binding.bindings.canvas_a;
    }
    if (variant === 'private-leak') projection.otherwise = { kind: 'named_people',count: 1,userIds: ['private-person'] };
    refreshConditional(f.bundle);
    if (variant === 'tamper') projection.cases[0].label = 'Modified';
    assert.throws(() => importWorkflowSource(f.root,f.path,f.config,f.bundle,true));
    assert.equal(readFileSync(f.path,'utf8'),f.original);
    assert.equal(existsSync(join(f.root,'platform')),false);
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

test('a complex released leaf is adopted exactly; the DTO cannot alter its parameters', () => {
  const f = conditionalFixture();
  try {
    const source: any = { provider: 'input_users', inputPath: 'members', min: 1, max: 5, delegatable: false };
    const local = f.config.workflows.definitions[0].definition;
    local.inputSchema.properties.members = { type: 'array',items: { type: 'string' } }; local.inputSchema.required.push('members');
    f.bundle.definition = structuredClone(local); f.bundle.definition.title = 'Published';
    f.bundle.binding.bindings.member_source = source;
    f.config.workflows.bindings[0].binding.bindings.member_source = structuredClone(source);
    (f.bundle.handling.a!.assignee as any).otherwise = { kind: 'binding',binding: structuredClone(source) };
    refreshConditional(f.bundle);
    const prepared = prepareWorkflowSourceImport(f.config,f.bundle,true);
    assert.deepEqual((prepared.workflows.bindings[0]!.binding.bindings.canvas_a as any).otherwise,source);
    (f.bundle.handling.a!.assignee as any).otherwise.binding.max = 10; refreshConditional(f.bundle);
    assert.throws(() => prepareWorkflowSourceImport(f.config,f.bundle,true),/LEAF_UNRELEASED/);
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

test('adopted role-only replacement validates its effective mode, not a removed default chain', () => {
  const f = conditionalFixture();
  try {
    const local = f.config.workflows.definitions[0].definition;
    local.nodes.a.mode = 'sequence'; local.nodes.b.mode = 'sequence';
    local.organizationContext = { department: { source: 'user_primary_department' } };
    const source: any = { provider: 'conditional', cases: [{ when: { op: 'literal',value: true },assignee: { provider: 'app_role',roleCode: 'manager' } }],otherwise: { provider: 'supervisor_chain',from: 'initiator',until: 'top' } };
    f.config.workflows.bindings[0].binding.bindings.people = structuredClone(source);
    f.bundle.binding.bindings.people = structuredClone(source);
    f.bundle.definition = structuredClone(local);
    f.bundle.handling.a!.mode = 'all'; refreshConditional(f.bundle);
    const prepared = prepareWorkflowSourceImport(f.config,f.bundle,true);
    const d = prepared.workflows.definitions[0]!.definition;
    assert.equal((d.nodes.a as any).mode,'all');
    assert.equal((d.nodes.b as any).mode,'sequence');
    assert.deepEqual(prepared.workflows.bindings[0]!.binding.bindings.people,source);
    assert.equal((prepared.workflows.bindings[0]!.binding.bindings.canvas_a as any).otherwise.roleCode,'manager');
  } finally { rmSync(f.root,{ recursive: true,force: true }); }
});

for (const variant of ['raw-rebinding', 'operation-ceiling'] as const) test(`explicit adoption still rejects ${variant} before source writes`, () => {
  const f = conditionalFixture();
  try {
    if (variant === 'raw-rebinding') {
      (f.bundle.definition.nodes.b as any).binding = 'canvas_b';
      f.bundle.binding.bindings.canvas_b = { provider: 'app_role', roleCode: 'manager' };
    } else {
      (f.bundle.definition.nodes.a as any).administration.operations = ['approve', 'reject', 'delegate'];
    }
    refreshConditional(f.bundle);
    assert.throws(() => importWorkflowSource(f.root, f.path, f.config, f.bundle, true));
    assert.equal(readFileSync(f.path, 'utf8'), f.original);
    assert.equal(existsSync(join(f.root, 'platform')), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
