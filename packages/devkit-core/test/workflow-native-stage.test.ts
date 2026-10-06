import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest, type WorkflowDefinition } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities } from '../src/index.js';
function source(): any {
  const definition: WorkflowDefinition = { schemaVersion: 'openxiangda.workflow-definition/v2', code: 'approval', title: '证明申请',
    acceptedCommandDeactivationPolicy: 'finish-pinned', subject: { resourceCode: 'requests', factProjection: { title: 'title' } },
    inputSchema: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' } } }, startAt: 'confirm', nodes: {
      confirm: { id: 'confirm', kind: 'approval', title: '本人确认', binding: 'reviewer', mode: 'single', onApprove: 'approved', onReject: 'rejected' },
      approved: { id: 'approved', kind: 'end', title: '通过', outcome: 'approved' }, rejected: { id: 'rejected', kind: 'end', title: '拒绝', outcome: 'rejected' },
    } };
  return { app: { code: 'stage-app', name: '阶段守卫' }, frontend: { root: 'apps/web' },
    data: { resources: [{ code: 'requests', name: '申请', fields: [{ code: 'title', label: '标题', type: 'text.short' }] }] },
    authz: { roles: [{ code: 'reviewer', name: '审批人', capabilities: [] }], capabilities: [{ code: 'app:stage-app:generate', kind: 'backend', name: '生成证明' }] },
    backend: { enabled: true, operations: [{ code: 'proof.generate', method: 'POST', path: '/api/proof', capability: 'app:stage-app:generate',
      requestSchema: { type: 'object', additionalProperties: false }, responseSchema: { type: 'object', additionalProperties: false },
      platformAccess: { dataCommands: { mode: 'recoverable-native' }, workflow: { codes: ['approval'] },
        workflowStage: { workflowCode: 'approval', resourceCode: 'requests', actor: 'initiator', runningNodeIds: ['confirm'], allowedStatuses: ['approved'] } } }] },
    workflows: { definitions: [{ version: 1, definition, launch: { mode: 'work-center-only' } }],
      bindings: [{ version: 1, binding: { schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: 'approval', bindings: { reviewer: { provider: 'app_role', roleCode: 'reviewer' } } } }],
      activations: [{ workflowCode: 'approval', definitionVersion: 1, bindingVersion: 1, acceptedCommandDeactivationPolicy: 'finish-pinned' }] } };
}
function compile(value = source()) {
  const app = defineOpenXiangdaApp(value), compiled = compileApplicationSources(app);
  const native = compileNativeApplicationConfiguration({ appCode: 'stage-app', configBytes: canonicalJson(compiled.config.value),
    contractBytes: canonicalJson(compiled.contracts.value), expectedConfigDigest: sha256Digest(compiled.config.value), expectedContractDigest: sha256Digest(compiled.contracts.value) });
  return { app, compiled, native };
}
test('authoring, emitted contracts and the platform share the same fixed stage and optional capability', () => {
  const { app, compiled, native } = compile();
  assert.deepEqual(compiled.config.value.backend.operations[0]?.platformAccess, source().backend.operations[0].platformAccess);
  assert.match(compiled.contracts.typescript, /workflowStage/);
  assert.equal(native.requiredPlatformCapabilities.find(c => c.code === 'workflow.native-stage-guard')?.contractVersion, '1.0.0');
  assert.equal(requiredPlatformCapabilities(app).find(c => c.code === 'workflow.native-stage-guard')?.contractVersion, '1.0.0');
  const plain = source(); delete plain.backend.operations[0].platformAccess.workflowStage;
  assert.equal(compile(plain).native.requiredPlatformCapabilities.some(c => c.code === 'workflow.native-stage-guard'), false);
});
test('a stage requires explicit recoverable writes, references and a bounded fixed policy', () => {
  for (const mutate of [(s: any) => { delete s.backend.operations[0].platformAccess.dataCommands; },
    (s: any) => { s.backend.operations[0].platformAccess.workflowStage.workflowCode = 'missing'; },
    (s: any) => { s.backend.operations[0].platformAccess.workflowStage.resourceCode = 'missing'; },
    (s: any) => { s.backend.operations[0].platformAccess.workflowStage.runningNodeIds = ['missing']; },
    (s: any) => { s.backend.operations[0].platformAccess.workflowStage.actor = 'developer'; }]) {
    const value = source(); mutate(value); assert.throws(() => compile(value));
  }
});
