import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, WORKFLOW_BUSINESS_STEP_EVENT, workflowBusinessStepHandlerDigest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities, type OpenXiangdaAppDeclaration } from '../src/index.js';

function fixture() {
  const schema = { type: 'object', additionalProperties: false, required: ['amount'], properties: { amount: { type: 'integer', minimum: 0 } } };
  const definitions: NonNullable<OpenXiangdaAppDeclaration['workflows']>['definitions'] = [1, 2].map(version => ({ version, launch: { mode: 'work-center-only' },
    definition: { schemaVersion: 'openxiangda.workflow-definition/v2', code: 'calculated', title: '计算审批', acceptedCommandDeactivationPolicy: 'finish-pinned',
      subject: { resourceCode: 'requests', factProjection: { amount: 'amount' }, summaryFields: ['amount'] }, startAt: 'calculate', inputSchema: schema,
      nodes: { calculate: { id: 'calculate', kind: 'action', title: '计算金额', next: 'approved', handler: { code: `calculate-v${version}`, version, mode: 'pure' }, inputSchema: schema, outputSchema: schema,
        inputs: { amount: { source: 'fact', path: 'amount' } } }, approved: { id: 'approved', kind: 'end', title: '完成', outcome: 'approved' } } },
  }));
  return defineOpenXiangdaApp({ app: { code: 'steps', name: '步骤' }, backend: { enabled: true },
    modules: [{ code: 'requests', models: [{ code: 'requests', name: '申请', fields: [{ code: 'amount', label: '金额', type: 'number.integer', required: true }] }], crud: [] }],
    workflows: { definitions, bindings: [{ version: 1, binding: { schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: 'calculated', bindings: {} } }],
      activations: [{ workflowCode: 'calculated', definitionVersion: 2, bindingVersion: 1, acceptedCommandDeactivationPolicy: 'finish-pinned' }] },
    events: { subscriptions: [1, 2].map(version => ({ code: `calculate-v${version}`, eventTypes: [WORKFLOW_BUSINESS_STEP_EVENT],
      filter: { workflowStep: { handlerCode: `calculate-v${version}` } }, payload: { includeChanges: false, fields: [] } })) },
  });
}
test('authoring preserves fixed step subscriptions and both compilers seal identical handlers and capability requirements', () => {
  const app = fixture(), compiled = compileApplicationSources(app);
  const platform = compileNativeApplicationConfiguration({ appCode: app.app.code,
    configBytes: canonicalJson(compiled.config.value), contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: compiled.config.digest, expectedContractDigest: compiled.contracts.digest });
  const manifest = compiled.contracts.value.eventHandlerManifest;
  for (const handler of manifest.handlers) {
    const consumer = compiled.contracts.value.eventConsumers.find(item => item.code === handler.code)!;
    assert.deepEqual(consumer.filter, { workflowStep: { handlerCode: handler.code } });
    assert.deepEqual(consumer.payload, { includeChanges: false, fields: [] });
    assert.equal(handler.workflowStep?.version, Number(handler.code.slice(-1)));
    assert.equal(workflowBusinessStepHandlerDigest(manifest, handler.code), workflowBusinessStepHandlerDigest({ ...manifest, handlers: [handler] }, handler.code));
  }
  assert.deepEqual(platform.projections.events.value.consumers.map((consumer: any) => consumer.filter), compiled.contracts.value.eventConsumers.map(consumer => consumer.filter));
  assert.deepEqual(requiredPlatformCapabilities(app), platform.requiredPlatformCapabilities);
  assert.ok(platform.requiredPlatformCapabilities.some(item => item.code === 'workflow.durable-business-step'));
});
test('authoring rejects missing subscriptions and broadened filters before generating a waiting step', () => {
  for (const change of ['missing', 'filter', 'payload'] as const) {
    const app = fixture();
    if (change === 'missing') app.events!.subscriptions.pop();
    if (change === 'filter') app.events!.subscriptions[0]!.filter = { workflowStep: { handlerCode: 'calculate-v1' }, subject: { equals: 'other' } };
    if (change === 'payload') app.events!.subscriptions[0]!.payload = { includeChanges: true, fields: [] };
    assert.throws(() => compileApplicationSources(app), /WORKFLOW_STEP_SUBSCRIPTION_INVALID/);
  }
});

test('full authoring and Native ingestion keep opted-in data contracts and reject pure data effects', () => {
  const app = fixture();
  const action: any = app.workflows!.definitions[0]!.definition.nodes.calculate;
  action.handler.mode = 'reconciled-effect'; action.handler.dataTransaction = true;
  const compiled = compileApplicationSources(app);
  const native = compileNativeApplicationConfiguration({ appCode: app.app.code,
    configBytes: canonicalJson(compiled.config.value), contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: compiled.config.digest, expectedContractDigest: compiled.contracts.digest });
  assert.equal(compiled.contracts.value.eventHandlerManifest.handlers.find(h => h.code === 'calculate-v1')?.workflowStep?.dataTransaction, true);
  assert.deepEqual(requiredPlatformCapabilities(app), native.requiredPlatformCapabilities);
  assert.equal(native.requiredPlatformCapabilities.find(v => v.code === 'workflow.step-data-transaction')?.contractVersion, '1.0.0');
  action.handler.mode = 'pure'; assert.throws(() => compileApplicationSources(app), /WORKFLOW_STEP.*INVALID/);
});
