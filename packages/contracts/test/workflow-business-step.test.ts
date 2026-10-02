import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256Digest } from '../src/canonical.js';
import { projectWorkflowGraph, validateWorkflowReadability } from '../src/native-compiler/workflow-graph.js';
import {
  WORKFLOW_BUSINESS_STEP_EVENT, compileWorkflowBusinessStepHandlers, validateWorkflowBusinessStepResult,
  validateWorkflowBusinessStepSchema, validateWorkflowBusinessStepSubscriptions, validateWorkflowBusinessSteps,
  workflowBusinessStepInput,
  workflowBusinessStepValueMatches,
} from '../src/native-compiler/workflow-business-step.js';
import { workflowBusinessStepHandlerDigest, workflowBusinessStepReceiptSignatureSuffix } from '../src/native-compiler/workflow-business-step-identity.js';

function fixture() {
  const schema = { type: 'object', additionalProperties: false, required: ['amount'], properties: { amount: { type: 'integer', minimum: 0, maximum: 1_000_000 } } };
  return { code: 'calculated', title: '金额计算', startAt: 'calculate', inputSchema: schema, nodes: {
    calculate: { id: 'calculate', kind: 'action', title: '核算金额', next: 'branch', handler: { code: 'calculate-v1', version: 1, mode: 'pure' },
      inputSchema: schema, outputSchema: schema, inputs: { amount: { source: 'fact', path: 'amount' } } },
    branch: { id: 'branch', kind: 'condition', branches: [{ when: { op: 'gt', left: { op: 'path', path: 'steps.calculate.amount' }, right: { op: 'literal', value: 200_000 } }, target: 'end' }], otherwise: 'end' },
    end: { id: 'end', kind: 'end', title: '完成', outcome: 'approved' },
  }, readability: { variables: { 'steps.calculate.amount': { label: '核算金额', unit: '分' } } } } as any;
}

test('fixed executable step projects true next, version and computed variable owner', () => {
  const definition = fixture();
  assert.deepEqual(validateWorkflowBusinessSteps(definition), []);
  assert.deepEqual(validateWorkflowReadability(definition), []);
  const graph = projectWorkflowGraph(definition, 'frozen');
  assert.equal(graph.edges.find(item => item.from === 'calculate')?.to, 'branch');
  assert.equal(graph.nodes[0]?.businessStep?.handler.version, 1);
  assert.deepEqual(graph.variables.find(item => item.path === 'steps.calculate.amount')?.source,
    { kind: 'step_output', nodeId: 'calculate', handlerCode: 'calculate-v1', handlerVersion: 1 });
  assert.deepEqual(workflowBusinessStepInput(definition.nodes.calculate, { amount: 200_001 }), { amount: 200_001 });
  assert.throws(() => workflowBusinessStepInput(definition.nodes.calculate, { amount: '200001' }), /INPUT_SCHEMA/);
});

test('malformed schema and node structures produce diagnostics without throwing', () => {
  for (const value of [null, { type: 'object', properties: {}, required: 1, additionalProperties: false },
    { type: 'object', properties: { bad: { type: 'string', pattern: '.*' } }, additionalProperties: false },
    { type: 'object', properties: { bad: { type: 'integer', minimum: 2, maximum: 1 } }, additionalProperties: false },
    { type: 'object', properties: { bad: { type: 'integer', enum: ['1'] } }, additionalProperties: false },
    { type: 'object', properties: { bad: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }]) {
    assert.equal(validateWorkflowBusinessStepSchema(value), false);
    const definition = fixture(); definition.nodes.calculate.inputSchema = value; definition.nodes.branch.branches = {};
    assert.ok(validateWorkflowBusinessSteps(definition).some(item => item.includes('SCHEMA_INVALID')));
  }
  for (const patch of [{ fieldPolicy: {} }, { administration: {} }, { next: 'missing' }, { handler: { code: 'calculate', version: 1, mode: 'pure' } }]) {
    const definition = fixture(); Object.assign(definition.nodes.calculate, patch);
    assert.ok(validateWorkflowBusinessSteps(definition).length);
  }
});

test('producer must dominate every route and cannot read its own output', () => {
  const definition = fixture(); definition.startAt = 'branch';
  assert.ok(validateWorkflowBusinessSteps(definition).some(item => item.includes('OUTPUT_NOT_AVAILABLE')));
  const self = fixture(); self.nodes.calculate.inputs.amount.path = 'steps.calculate.amount';
  assert.ok(validateWorkflowBusinessSteps(self).some(item => item.includes('OUTPUT_NOT_AVAILABLE')));
  const reserved = fixture(); reserved.inputSchema.properties.steps = { type: 'object' };
  assert.ok(validateWorkflowBusinessSteps(reserved).includes('WORKFLOW_STEP_FACT_NAMESPACE_RESERVED'));
  const unsafe = fixture(); unsafe.nodes.calculate.inputs.amount.path = '__proto__.amount';
  assert.ok(validateWorkflowBusinessSteps(unsafe).some(item => item.includes('FACT_PATH_INVALID')));
});

test('literals, combined bytes and output are bounded without coercion', () => {
  const definition = fixture(); definition.nodes.calculate.inputs.amount = { source: 'literal', value: '1' };
  assert.ok(validateWorkflowBusinessSteps(definition).some(item => item.includes('LITERAL_INVALID')));
  assert.equal(workflowBusinessStepValueMatches(fixture().inputSchema, { amount: 1, extra: true }), false);
  const large = { type: 'object', additionalProperties: false, properties: { one: { type: 'string' }, two: { type: 'string' } } };
  assert.equal(workflowBusinessStepValueMatches(large, { one: 'a'.repeat(9_000), two: 'b'.repeat(9_000) }), false);
});

test('subscription cannot catch another handler and same named version cannot change contract', () => {
  const definition = fixture();
  const subscription = { code: 'calculate-v1', eventTypes: [WORKFLOW_BUSINESS_STEP_EVENT], filter: { workflowStep: { handlerCode: 'calculate-v1' } }, payload: { includeChanges: false, fields: [] } };
  assert.deepEqual(validateWorkflowBusinessStepSubscriptions([definition], [subscription], true), []);
  assert.ok(validateWorkflowBusinessStepSubscriptions([definition], [{ ...subscription, filter: {} }], true).length);
  assert.ok(validateWorkflowBusinessStepSubscriptions([definition], [subscription], false).includes('WORKFLOW_STEP_BACKEND_REQUIRED'));
  const changed = structuredClone(definition); changed.nodes.calculate.outputSchema.properties.amount.maximum++;
  assert.throws(() => compileWorkflowBusinessStepHandlers([definition, changed]), /CONTRACT_CONFLICT/);
  const v1: any = { code: 'calculate-v1', workflowStep: compileWorkflowBusinessStepHandlers([definition])['calculate-v1'] };
  const manifest: any = { schemaVersion: 'manifest', appCode: 'app', handlers: [v1] };
  assert.equal(workflowBusinessStepHandlerDigest(manifest, v1.code), workflowBusinessStepHandlerDigest({ ...manifest, handlers: [v1, { code: 'calculate-v2' }] }, v1.code));
  assert.equal(workflowBusinessStepHandlerDigest(manifest, 'ordinary'), sha256Digest(manifest));
});

test('result is closed, bounded and included in receipt signature; old calls are unchanged', () => {
  const result = { executionId: 'f4b9def5-67f9-42d8-9a8c-9101ba98d1ab', handlerVersion: 1, inputDigest: sha256Digest({ amount: 1 }), expectedFactRevision: 0, output: { amount: 1 } };
  assert.ok(validateWorkflowBusinessStepResult(result));
  assert.equal(workflowBusinessStepReceiptSignatureSuffix(), '');
  assert.equal(workflowBusinessStepReceiptSignatureSuffix(result), '\n' + sha256Digest(result));
  assert.equal(validateWorkflowBusinessStepResult({ ...result, userId: 'admin' }), false);
  assert.equal(validateWorkflowBusinessStepResult({ ...result, receipt: { secret: 'a'.repeat(2_049) } }), false);
  assert.notEqual(workflowBusinessStepReceiptSignatureSuffix(result), workflowBusinessStepReceiptSignatureSuffix({ ...result, output: { amount: 2 } }));
});

test('invalid literal schemas cannot throw; impossible property budgets and prototype keys are rejected', () => {
  for (const schema of [null, { type: 'object', additionalProperties: false, properties: { amount: null } },
    { type: 'object', additionalProperties: false, properties: {}, minProperties: 1 },
    { type: 'object', additionalProperties: false, properties: { amount: { type: 'integer' } }, required: ['amount'], maxProperties: 0 },
    JSON.parse('{"type":"object","additionalProperties":false,"properties":{"__proto__":{"type":"string"}}}')]) {
    const definition = fixture(); definition.nodes.calculate.inputSchema = schema;
    definition.nodes.calculate.inputs.amount = { source: 'literal', value: 1 };
    assert.equal(validateWorkflowBusinessStepSchema(schema), false);
    assert.ok(validateWorkflowBusinessSteps(definition).some(item => item.includes('SCHEMA_INVALID')));
  }
  assert.equal(workflowBusinessStepValueMatches({ type: 'object', properties: {}, additionalProperties: false }, new Date()), false);
  assert.equal(workflowBusinessStepValueMatches({ type: 'object', properties: {}, additionalProperties: false }, JSON.parse('{"constructor":1}')), false);
});

test('JSON object enums are independent of property order, duplicate equivalents fail, and mapped types are checked', () => {
  const schema = { type: 'object', additionalProperties: false, properties: { a: { type: 'integer' }, b: { type: 'boolean' } }, enum: [{ a: 1, b: true }] };
  assert.ok(validateWorkflowBusinessStepSchema(schema));
  assert.ok(workflowBusinessStepValueMatches(schema, { b: true, a: 1 }));
  assert.equal(validateWorkflowBusinessStepSchema({ ...schema, enum: [{ a: 1, b: true }, { b: true, a: 1 }] }), false);
  const definition = fixture(); definition.nodes.calculate.inputSchema = { ...definition.nodes.calculate.inputSchema, properties: { amount: { type: 'string' } } };
  assert.ok(validateWorkflowBusinessSteps(definition).includes('WORKFLOW_STEP_FACT_TYPE_MISMATCH:calculate:amount'));
});

test('computed people bindings require a preceding producer; delayed HTTP and selection answers are rejected', () => {
  const definition = fixture(); definition.nodes.branch.otherwise = 'review'; definition.nodes.review = {
    id: 'review', kind: 'approval', title: '审批', binding: 'reviewers', onApprove: 'end', onReject: 'end', mode: 'single',
  };
  for (const provider of ['application_provider', 'initiator_select']) {
    assert.ok(validateWorkflowBusinessSteps(definition, { bindings: { reviewers: { provider } } }).includes('WORKFLOW_STEP_NEXT_PROVIDER_REQUIRES_PREPARED_RESULT:review'));
  }
  assert.ok(validateWorkflowBusinessSteps(definition, { bindings: { reviewers: { provider: 'form_field_users', inputPath: 'steps.missing.users' } } }).some(item => item.includes('OUTPUT_NOT_AVAILABLE')));
  assert.deepEqual(validateWorkflowBusinessSteps(definition, { bindings: { reviewers: { provider: 'app_role', roleCode: 'reviewer' } } }), []);
});
