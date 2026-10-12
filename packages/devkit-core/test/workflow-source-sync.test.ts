import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson,workflowSourceReferences,type WorkflowSourceBundle } from 'openxiangda-contracts';
import { importWorkflowSource,prepareWorkflowSourceImport,writeWorkflowRegistrationPlan,rewriteWorkflowSourceConfig } from '../src/workflow-source-sync.js';
const digest=(value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'workflow-source-')),path=join(root,'openxiangda.config.ts');
  const definition: any={ schemaVersion: 'openxiangda.workflow-definition/v2',code: 'review',title: 'Review',acceptedCommandDeactivationPolicy: 'finish-pinned',subject: { resourceCode: 'requests',factProjection: {} },inputSchema: { type: 'object',additionalProperties: false,properties: {} },startAt: 'a',nodes: { a: { id: 'a',kind: 'approval',title: 'A',binding: 'people',mode: 'single',onApprove: 'done',onReject: 'done' },done: { id: 'done',kind: 'end',title: 'Done',outcome: 'approved' } } };
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
