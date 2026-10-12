import assert from 'node:assert/strict';
import test from 'node:test';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, compileAppPackage, defineOpenXiangdaApp, requiredPlatformCapabilities, type OpenXiangdaAppDeclaration } from '../src/index.js';

function source(): OpenXiangdaAppDeclaration {
  return { app: { code: 'conditional-app', name: '条件审批' }, frontend: { root: 'apps/web' },
    data: { resources: [{ code: 'requests', name: '申请', fields: [{ code: 'title', type: 'text.short', label: '标题' }] }] },
    authz: { capabilities: [], roles: [{ code: 'reviewer', name: '审核人', capabilities: [] }, { code: 'legal', name: '法务', capabilities: [] }] },
    workflows: { definitions: [{ version: 1, launch: { mode: 'work-center-only' }, definition: {
      schemaVersion: 'openxiangda.workflow-definition/v2', code: 'review', title: '审批',
      acceptedCommandDeactivationPolicy: 'finish-pinned', subject: { resourceCode: 'requests', factProjection: { title: 'title' } },
      inputSchema: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string' } } },
      startAt: 'review', nodes: {
        review: { id: 'review', kind: 'approval', title: '审核', binding: 'people', mode: 'all', onApprove: 'done', onReject: 'done' },
        done: { id: 'done', kind: 'end', title: '结束', outcome: 'approved' },
      },
    } }], bindings: [{ version: 1, binding: {
      schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: 'review', bindings: {
        people: { provider: 'conditional', cases: [{ when: { op: 'eq', left: { op: 'path', path: 'title' }, right: { op: 'literal', value: 'legal' } },
          assignee: { provider: 'app_role', roleCodes: ['reviewer', 'legal'] } }], otherwise: { provider: 'app_role', roleCode: 'reviewer' } },
      },
    } }], activations: [{ workflowCode: 'review', definitionVersion: 1, bindingVersion: 1, acceptedCommandDeactivationPolicy: 'finish-pinned' }] },
  };
}

test('code declaration, sealed package and target have identical all-leaf capability closure and rule bytes', () => {
  const app = defineOpenXiangdaApp(source()), sources = compileApplicationSources(app);
  const target = compileNativeApplicationConfiguration({ appCode: app.app.code, configBytes: sources.config.content,
    contractBytes: sources.contracts.content, expectedConfigDigest: sources.config.digest, expectedContractDigest: sources.contracts.digest });
  const sealed = compileAppPackage({ config: app, version: '0.1.0', source: { repository: 'https://example.invalid/conditional.git', commit: 'a'.repeat(40), dirty: false },
    toolchainVersion: '2.66.0', artifacts: [], manifests: {}, minimumPlatformVersion: '2.66.0' });
  assert.deepEqual(requiredPlatformCapabilities(app), target.requiredPlatformCapabilities);
  assert.deepEqual(sealed.manifest.compatibility.requiredPlatformCapabilities, target.requiredPlatformCapabilities);
  for (const code of ['workflow.conditional-assignment', 'workflow.role-union'])
    assert.equal(target.requiredPlatformCapabilities.find(item => item.code === code)?.contractVersion, '1.0.0');
  assert.deepEqual(sources.config.value.workflows.bindings[0]!.binding.bindings.people, source().workflows!.bindings[0]!.binding.bindings.people);
});

test('authoring rejects invalid unselected leaves, undeclared roles and optional/unknown facts rather than throwing raw iterator errors', () => {
  for (const mutate of [
    (entry: any) => { entry.otherwise = { provider: 'fixed_users', users: [] }; },
    (entry: any) => { entry.otherwise.roleCode = 'undeclared'; },
    (entry: any) => { entry.cases[0].when.left.path = 'missing'; },
    (entry: any) => { entry.cases[0].assignee = { provider: 'conditional', cases: [], otherwise: { provider: 'initiator' } }; },
  ]) {
    const value = source(); mutate(value.workflows!.bindings[0]!.binding.bindings.people);
    assert.throws(() => defineOpenXiangdaApp(value), (error: any) => Array.isArray(error.diagnostics) && error.diagnostics.length > 0);
  }
});
