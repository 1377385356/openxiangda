import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalJson, sha256Digest } from '../src/canonical.js';
import { compileNativeApplicationConfiguration } from '../dist/native-compiler/index.js';
import { validateWorkflowBusinessStepSubscriptions, validateWorkflowBusinessSteps, compileWorkflowBusinessStepHandlers, workflowBusinessStepInput } from '../src/native-compiler/workflow-business-step.js';
import { validateWorkflowDesignerCapabilities } from '../src/native-compiler/workflow-designer.js';
import { WORKFLOW_PLATFORM_NOTIFY_HANDLER, WORKFLOW_PLATFORM_NOTIFY_INPUT_SCHEMA, WORKFLOW_PLATFORM_NOTIFY_OUTPUT_SCHEMA } from '../src/native-compiler/workflow-platform-notify.js';
function fixture() {
  const corpus = JSON.parse(readFileSync(new URL('./fixtures/configuration-compatibility-corpus.json', import.meta.url), 'utf8'));
  const config = JSON.parse(corpus.configuration.canonical);
  const definition = config.workflows.definitions[0].definition;
  const base = structuredClone(definition);
  definition.nodes.notice = { id: 'notice', kind: 'action', title: '发送通知', next: definition.startAt,
    handler: { code: WORKFLOW_PLATFORM_NOTIFY_HANDLER, version: 1, mode: 'reconciled-effect' }, inputSchema: WORKFLOW_PLATFORM_NOTIFY_INPUT_SCHEMA, outputSchema: WORKFLOW_PLATFORM_NOTIFY_OUTPUT_SCHEMA,
    inputs: { text: { source: 'literal', value: '请查看最新进展' } }, notification: { template: 'workflow_message', recipients: { provider: 'initiator' } } };
  definition.startAt = 'notice';
  const binding = config.workflows.bindings[0].binding;
  const input = () => { const contract = { ...JSON.parse(corpus.contract.canonical), configDigest: sha256Digest(config) }; const eventType = 'openxiangda.workflow.node.notified.v2'; contract.eventTypes = [...contract.eventTypes,eventType].sort(); contract.eventProducers.push({ code: `workflow:${eventType}`, source: 'workflow', eventType, dataSchemaVersion: '2.0.0' }); contract.eventProducers.sort((a: any,b: any) => `${a.source}:${a.code}:${a.eventType}`.localeCompare(`${b.source}:${b.code}:${b.eventType}`)); return { appCode: corpus.appCode, configBytes: canonicalJson(config), expectedConfigDigest: sha256Digest(config), contractBytes: canonicalJson(contract), expectedContractDigest: sha256Digest(contract) }; };
  return { base, config, definition, notice: definition.nodes.notice, binding, input };
}
test('platform notification compiles without an application backend and does not create a step barrier', () => {
  const { config, definition, input } = fixture();
  assert.deepEqual(validateWorkflowBusinessStepSubscriptions([definition], [], false), []);
  const compiled = compileNativeApplicationConfiguration(input());
  assert.ok(compiled.requiredPlatformCapabilities.some(cap => cap.code === 'workflow.platform-notify'));
  assert.ok(!compiled.requiredPlatformCapabilities.some(cap => cap.code === 'workflow.durable-business-step'));
  assert.deepEqual(compileWorkflowBusinessStepHandlers([definition]), {});
  assert.deepEqual(validateWorkflowBusinessSteps(definition), []);
});
test('canvas accepts the bounded platform preset while retaining application step restrictions', () => {
  const { base, definition, binding, notice } = fixture();
  assert.deepEqual(validateWorkflowDesignerCapabilities(base, definition, binding, binding), []);
  notice.handler.code = 'custom-v1'; delete notice.notification;
  assert.ok(validateWorkflowDesignerCapabilities(base, definition, binding, binding).some(error => error.includes('STEP_UNRELEASED')));
});
test('notification refuses arbitrary templates, handlers, output, invalid users, or oversized text', () => {
  const { definition, notice } = fixture();
  for (const patch of [{ notification: { template: 'other', recipients: { provider: 'initiator' } } }, { notification: { template: 'workflow_message', recipients: { provider: 'fixed_users', users: Array.from({length:51},(_,i)=>`u${i}`) } } }, { notification: { template: 'workflow_message', recipients: { provider: 'fixed_users', users: ['a','a'] } } }, { handler: { ...notice.handler, mode: 'pure' } }, { outputSchema: { type: 'object', properties: { arbitrary: {type:'string'} }, additionalProperties: false } }, { inputs: { text: { source: 'literal', value: 'x'.repeat(2049) } } }]) {
    const next = structuredClone(definition); next.nodes.notice = {...next.nodes.notice,...patch};
    assert.ok(validateWorkflowBusinessSteps(next).length, JSON.stringify(patch));
  }
  assert.deepEqual(workflowBusinessStepInput(notice, {}), { text: '请查看最新进展' });
});
