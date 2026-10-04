import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalJson, sha256Digest, workflowDefinitionSchema, type WorkflowDefinition } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, defineOpenXiangdaApp, type OpenXiangdaAppDeclaration } from '../src/index.js';
import { requiredPlatformCapabilitiesFromConfiguration } from '../src/compiler/package-compiler.js';

const policy = { recipient: 'record_last_modifier' as const, title: '审批拒绝', summary: '您有一个审批被拒绝，请查看' };
function source(withNotification = true): OpenXiangdaAppDeclaration {
  const definition: WorkflowDefinition = {
    schemaVersion: 'openxiangda.workflow-definition/v2', code: 'review', title: '申请审批',
    acceptedCommandDeactivationPolicy: 'finish-pinned', subject: { resourceCode: 'requests', factProjection: { title: 'title' } },
    ...(withNotification ? { rejectionNotification: { ...policy } } : {}),
    inputSchema: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' } } },
    startAt: 'review', nodes: {
      review: { id: 'review', kind: 'approval', title: '审核', binding: 'reviewer', mode: 'single', onApprove: 'approved', onReject: 'rejected' },
      approved: { id: 'approved', kind: 'end', title: '通过', outcome: 'approved' },
      rejected: { id: 'rejected', kind: 'end', title: '拒绝', outcome: 'rejected' },
    },
  };
  return { app: { code: 'rejection-app', name: '拒绝通知' }, frontend: { root: 'apps/web' },
    data: { resources: [{ code: 'requests', name: '申请', fields: [{ code: 'title', type: 'text.short', label: '标题' }] }] },
    authz: { capabilities: [], roles: [{ code: 'reviewer', name: '审批人', capabilities: [] }] },
    workflows: { definitions: [{ version: 1, definition, launch: { mode: 'work-center-only' } }],
      bindings: [{ version: 1, binding: { schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: 'review', bindings: { reviewer: { provider: 'app_role', roleCode: 'reviewer' } } } }],
      activations: [{ workflowCode: 'review', definitionVersion: 1, bindingVersion: 1, acceptedCommandDeactivationPolicy: 'finish-pinned' }] },
  };
}
function platform(config: any, contracts: any) {
  const value = { ...contracts, configDigest: sha256Digest(config) };
  return compileNativeApplicationConfiguration({ appCode: 'rejection-app', configBytes: canonicalJson(config),
    expectedConfigDigest: sha256Digest(config), contractBytes: canonicalJson(value), expectedContractDigest: sha256Digest(value) });
}

test('source and target preserve the fixed policy and derive the same notification capability closure', () => {
  for (const enabled of [false, true]) {
    const compiled = compileApplicationSources(defineOpenXiangdaApp(source(enabled)));
    const target = platform(compiled.config.value, compiled.contracts.value);
    const capabilities = requiredPlatformCapabilitiesFromConfiguration(compiled.config.value);
    assert.deepEqual(target.requiredPlatformCapabilities, capabilities);
    assert.equal(capabilities.some(item => item.code === 'workflow.rejection-notification'), enabled);
    assert.equal(capabilities.some(item => item.code === 'notification-hub-v2'), enabled);
    const published = compiled.config.value.workflows.definitions[0]!.definition;
    assert.deepEqual(published.rejectionNotification, enabled ? policy : undefined);
    const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(workflowDefinitionSchema);
    assert.equal(validate(published), true, JSON.stringify(validate.errors));
  }
});

test('both compilers reject recipient injection and malformed text, and the closed schema agrees', () => {
  const original = compileApplicationSources(defineOpenXiangdaApp(source()));
  const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(workflowDefinitionSchema);
  for (const patch of [{ recipient: 'initiator' }, { userId: 'caller' }, { title: '  ' }, { summary: '' },
    { title: 'x'.repeat(161) }, { summary: 'x'.repeat(501) }]) {
    const declaration = source();
    (declaration.workflows!.definitions[0]!.definition as any).rejectionNotification = { ...policy, ...patch };
    assert.throws(() => defineOpenXiangdaApp(declaration));
    const config = structuredClone(original.config.value);
    (config.workflows.definitions[0]!.definition as any).rejectionNotification = { ...policy, ...patch };
    assert.throws(() => platform(config, original.contracts.value));
    assert.equal(validate(config.workflows.definitions[0]!.definition), false);
  }
});

test('fixed text changes alter usage digests without introducing a second application subscription', () => {
  const first = compileApplicationSources(defineOpenXiangdaApp(source()));
  const declaration = source();
  declaration.workflows!.definitions[0]!.definition.rejectionNotification!.title = '申请被拒绝';
  const second = compileApplicationSources(defineOpenXiangdaApp(declaration));
  const capabilities = (value: typeof first) => requiredPlatformCapabilitiesFromConfiguration(value.config.value);
  for (const code of ['workflow.rejection-notification', 'notification-hub-v2']) {
    assert.notEqual(capabilities(first).find(item => item.code === code)?.usageDigest, capabilities(second).find(item => item.code === code)?.usageDigest);
  }
  assert.deepEqual(first.config.value.events.subscriptions, []);
});
