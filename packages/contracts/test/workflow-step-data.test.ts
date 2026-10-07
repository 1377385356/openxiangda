import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { compileWorkflowBusinessStepHandlers, validateWorkflowBusinessSteps, validateWorkflowBusinessStepHandlerContract, validateWorkflowBusinessStepRequest } from '../src/native-compiler/workflow-business-step.js';
import { workflowBusinessStepHandlerDigest } from '../src/native-compiler/workflow-business-step-identity.js';
import { sha256Digest } from '../src/canonical.js';
import { parseWorkflowStepDataResolution, WORKFLOW_STEP_DATA_RESOLUTION_SCHEMA } from '../src/native-compiler/workflow-step-data.js';

const schema = { type: 'object', additionalProperties: false, required: ['amount'], properties: { amount: { type: 'integer' } } };
const node: any = { id: 'write', kind: 'action', title: '写入台账', next: 'end', handler: { code: 'ledger-v1', version: 1, mode: 'reconciled-effect', dataTransaction: true }, inputSchema: schema, outputSchema: schema, inputs: { amount: { source: 'fact', path: 'amount' } } };
const definition = () => ({ startAt: 'write', inputSchema: schema, nodes: { write: structuredClone(node), end: { id: 'end', kind: 'end', outcome: 'approved' } } });

test('data transactions are an explicit fixed effect contract; pure, false and mismatched modes are refused', () => {
  const def = definition();
  assert.deepEqual(validateWorkflowBusinessSteps(def), []);
  const contract = compileWorkflowBusinessStepHandlers([def])['ledger-v1']!;
  assert.equal(contract.dataTransaction, true);
  assert.equal(validateWorkflowBusinessStepHandlerContract(contract), true);
  const request = { executionId: randomUUID(), nodeId: 'write', handlerCode: 'ledger-v1', handlerVersion: 1, mode: 'reconciled-effect', dataTransaction: true, input: { amount: 2 }, inputDigest: sha256Digest({ amount: 2 }), expectedFactRevision: 1 };
  assert.equal(validateWorkflowBusinessStepRequest(request), true);
  for (const patch of [{ mode: 'pure' }, { dataTransaction: false }, { dataTransaction: 'true' }, { unsafe: true }]) {
    assert.equal(validateWorkflowBusinessStepHandlerContract({ ...contract, ...patch }), false);
    assert.equal(validateWorkflowBusinessStepRequest({ ...request, ...patch }), false);
    Object.assign(def.nodes.write.handler, patch);
    assert.ok(validateWorkflowBusinessSteps(def).length);
    def.nodes.write = structuredClone(node);
  }
  const previous: any = { code: 'ledger-v1', workflowStep: { ...contract } }; delete previous.workflowStep.dataTransaction;
  const manifest: any = { schemaVersion: 'manifest', appCode: 'test', handlers: [previous] };
  assert.notEqual(workflowBusinessStepHandlerDigest(manifest, 'ledger-v1'), workflowBusinessStepHandlerDigest({ ...manifest, handlers: [{ ...previous, workflowStep: contract }] }, 'ledger-v1'));
  const old = definition(); delete old.nodes.write.handler.dataTransaction;
  assert.throws(() => compileWorkflowBusinessStepHandlers([old, def]), /CONTRACT_CONFLICT/);
});

test('original results must match execution and Native key; incomplete results never imply permission to replay', () => {
  const executionId = randomUUID();
  const missing = { schemaVersion: WORKFLOW_STEP_DATA_RESOLUTION_SCHEMA, executionId, outcome: 'not_observed' };
  assert.deepEqual(parseWorkflowStepDataResolution(missing, executionId), missing);
  assert.throws(() => parseWorkflowStepDataResolution(missing, executionId, true), /RESPONSE_INVALID/);
  const result = { ...missing, outcome: 'committed', transaction: { schemaVersion: 'openxiangda.data-transaction-result/v2', idempotencyKey: `workflow-step:${executionId}`, replayed: true, items: [{ index: 0, operation: 'create', resourceCode: 'ledger', id: randomUUID(), revision: 1 }] } };
  assert.deepEqual(parseWorkflowStepDataResolution(result, executionId, true), result);
  for (const bad of [{ ...result, executionId: randomUUID() }, { ...missing, transaction: null }, { ...result, unsafe: true },
    { ...result, transaction: { ...result.transaction, idempotencyKey: 'another' } },
    { ...result, transaction: { ...result.transaction, items: [] } },
    { ...result, transaction: { ...result.transaction, items: [{ ...result.transaction.items[0], revision: 0 }] } }])
    assert.throws(() => parseWorkflowStepDataResolution(bad, executionId), /RESPONSE_INVALID/);
});
