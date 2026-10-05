import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { businessProcessCommandWithDataSchema, workflowBusinessCommandInvocationSchema, workflowDefinitionSchema, validateWorkflowCommandHandlers } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources } from '../src/compiler/bundle.js';
import { defineOpenXiangdaApp, type OpenXiangdaAppDeclaration } from '../src/compiler/config.js';
import { requiredPlatformCapabilitiesFromConfiguration } from '../src/compiler/package-compiler.js';

function fixture(): OpenXiangdaAppDeclaration {
  const capability = 'app:command-review:request:decide';
  return {
    schemaVersion: 3, app: { code: 'command-review', name: '事务审批' }, frontend: { root: 'apps/web' },
    data: { resources: [{ code: 'requests', name: '申请', fields: [
      { code: 'amount', label: '金额', type: 'number.integer', required: true },
      { code: 'status', label: '业务状态', type: 'text.short' },
    ] }] },
    authz: { capabilities: [{ code: capability, name: '业务决定', kind: 'backend' }], roles: [{ code: 'reviewer', name: '审批人', capabilities: [capability] }] },
    backend: { root: 'apps/server', operations: [{ code: 'decide-request', capability,
      method: 'POST', path: '/api/request/decide', requestSchema: workflowBusinessCommandInvocationSchema,
      responseSchema: { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: 'string' } } },
      platformAccess: { workflow: { codes: ['request-approval'], businessCommands: ['withdraw', 'reject', 'approve'] } },
      browser: { exposure: 'authenticated', behavior: 'controlled', idempotency: 'required', subject: { resourceCode: 'requests', inputField: 'recordId' } },
    }] },
    workflows: {
      definitions: [{ version: 1, launch: { mode: 'work-center-only' }, definition: {
        schemaVersion: 'openxiangda.workflow-definition/v2', code: 'request-approval', title: '申请审批', acceptedCommandDeactivationPolicy: 'finish-pinned',
        subject: { resourceCode: 'requests', factProjection: { amount: 'amount' } },
        commandHandlers: { approve: { operationCode: 'decide-request' }, reject: { operationCode: 'decide-request' }, withdraw: { operationCode: 'decide-request' } },
        inputSchema: { type: 'object', additionalProperties: false, required: ['amount'], properties: { amount: { type: 'integer' } } },
        startAt: 'review', nodes: {
          review: { id: 'review', title: '审批', kind: 'approval', mode: 'single', binding: 'reviewer', onApprove: 'approved', onReject: 'rejected' },
          approved: { id: 'approved', title: '同意', kind: 'end', outcome: 'approved' },
          rejected: { id: 'rejected', title: '拒绝', kind: 'end', outcome: 'rejected' },
        },
      } }],
      bindings: [{ version: 1, binding: { schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: 'request-approval', bindings: { reviewer: { provider: 'app_role', roleCode: 'reviewer' } } } }],
      activations: [{ workflowCode: 'request-approval', definitionVersion: 1, bindingVersion: 1, acceptedCommandDeactivationPolicy: 'finish-pinned' }],
    },
  };
}

test('app/target compilers retain fixed handlers and command access with identical capability closure', () => {
  const output = compileApplicationSources(defineOpenXiangdaApp(fixture()));
  const target = compileNativeApplicationConfiguration({ appCode: 'command-review', configBytes: output.config.content,
    expectedConfigDigest: output.config.digest, contractBytes: output.contracts.content, expectedContractDigest: output.contracts.digest });
  assert.deepEqual(target.requiredPlatformCapabilities, requiredPlatformCapabilitiesFromConfiguration(output.config.value));
  assert.equal(target.requiredPlatformCapabilities.find(item => item.code === 'workflow.business-data-command')?.contractVersion, '1.0.0');
  assert.deepEqual(output.config.value.backend.operations[0]!.platformAccess!.workflow!.businessCommands, ['approve', 'reject', 'withdraw']);
  const definition = output.config.value.workflows.definitions[0]!.definition;
  assert.deepEqual(definition.commandHandlers, fixture().workflows!.definitions[0]!.definition.commandHandlers);
  const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(workflowDefinitionSchema);
  assert.equal(validate(definition), true, JSON.stringify(validate.errors));
});

test('missing/wrong handlers and automatic human decisions cannot seal a business workflow', () => {
  for (const mutate of [
    (value: any) => { value.backend.operations = []; },
    (value: any) => { value.backend.operations[0].platformAccess.workflow.businessCommands = ['approve']; },
    (value: any) => { value.backend.operations[0].method = 'GET'; },
    (value: any) => { delete value.backend.operations[0].browser.subject; },
    (value: any) => { value.backend.operations[0].browser.subject.resourceCode = 'other'; },
    (value: any) => { value.workflows.definitions[0].definition.nodes.review.emptyPolicy = 'skip'; },
    (value: any) => { value.workflows.definitions[0].definition.nodes.review.initiatorApprovalPolicy = 'auto_approve'; },
  ]) {
    const source = fixture(); mutate(source);
    assert.ok(validateWorkflowCommandHandlers(source.workflows!.definitions[0]!.definition, source.backend!.operations).length);
    assert.throws(() => compileApplicationSources(defineOpenXiangdaApp(source)));
  }
});

test('ordinary workflow declarations retain their existing required capabilities', () => {
  const source = fixture();
  delete source.workflows!.definitions[0]!.definition.commandHandlers;
  delete source.backend!.operations[0]!.platformAccess!.workflow!.businessCommands;
  const output = compileApplicationSources(defineOpenXiangdaApp(source));
  assert.equal(requiredPlatformCapabilitiesFromConfiguration(output.config.value).some(item => item.code === 'workflow.business-data-command'), false);
});

test('500-row declarations and aggregate expansion negotiate identical authoring and target capabilities', () => {
  for (const [tableCount, maxRows, required] of [[1, 20, false], [1, 100, false], [7, 50, false], [5, 100, true], [1, 500, true]] as const) {
    const source = fixture();
    for (let index = 0; index < tableCount; index++) {
      const code = `items${index}`;
      source.data!.resources![0]!.fields!.push({ code, label: code, type: 'subtable', subtable: { resourceCode: code, foreignKey: 'parentId', orderField: 'position', maxRows } });
      source.data!.resources!.push({ code, name: code, fields: [
        { code: 'parentId', label: '所属申请', type: 'uuid', required: true },
        { code: 'position', label: '顺序', type: 'number.integer', required: true },
        { code: 'name', label: '名称', type: 'text.short' },
      ] });
    }
    const output = compileApplicationSources(defineOpenXiangdaApp(source));
    const target = compileNativeApplicationConfiguration({ appCode: 'command-review', configBytes: output.config.content,
      expectedConfigDigest: output.config.digest, contractBytes: output.contracts.content, expectedContractDigest: output.contracts.digest });
    assert.deepEqual(target.requiredPlatformCapabilities, requiredPlatformCapabilitiesFromConfiguration(output.config.value));
    assert.equal(target.requiredPlatformCapabilities.find(item => item.code === 'data.extended-owned-subtable-capacity')?.contractVersion, required ? '1.0.0' : undefined);
  }
});

test('optional rejection comments seal an opt-in capability with identical app and target policy', () => {
  for (const commentRequired of [undefined, true, false]) {
    const source = fixture();
    const review = source.workflows!.definitions[0]!.definition.nodes.review;
    assert.equal(review!.kind, 'approval');
    if (review!.kind === 'approval' && commentRequired !== undefined) review.operationPolicy = { reject: { commentRequired } };
    const output = compileApplicationSources(defineOpenXiangdaApp(source));
    const target = compileNativeApplicationConfiguration({ appCode: 'command-review', configBytes: output.config.content,
      expectedConfigDigest: output.config.digest, contractBytes: output.contracts.content, expectedContractDigest: output.contracts.digest });
    assert.deepEqual(target.requiredPlatformCapabilities, requiredPlatformCapabilitiesFromConfiguration(output.config.value));
    assert.equal(target.requiredPlatformCapabilities.find(item => item.code === 'workflow.optional-rejection-comment')?.contractVersion,
      commentRequired === false ? '1.0.0' : undefined);
    assert.deepEqual(output.config.value.workflows.definitions[0]!.definition.nodes.review, review);
    const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(workflowDefinitionSchema);
    assert.equal(validate(output.config.value.workflows.definitions[0]!.definition), true, JSON.stringify(validate.errors));
  }
});

test('operation reason policies preserve authoring and target capability closure and reject invalid placements', () => {
  const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(workflowDefinitionSchema);
  for (const operation of ['transfer', 'delegate', 'add_assignee', 'return']) {
    for (const reasonRequired of [undefined, true, false]) {
      const source = fixture();
      const review = source.workflows!.definitions[0]!.definition.nodes.review!;
      assert.equal(review.kind, 'approval');
      if (review.kind === 'approval' && reasonRequired !== undefined) review.operationPolicy = { [operation]: { reasonRequired } };
      const output = compileApplicationSources(defineOpenXiangdaApp(source));
      const target = compileNativeApplicationConfiguration({ appCode: 'command-review', configBytes: output.config.content,
        expectedConfigDigest: output.config.digest, contractBytes: output.contracts.content, expectedContractDigest: output.contracts.digest });
      assert.deepEqual(target.requiredPlatformCapabilities, requiredPlatformCapabilitiesFromConfiguration(output.config.value));
      assert.equal(target.requiredPlatformCapabilities.find(item => item.code === 'workflow.optional-operation-reason')?.contractVersion, reasonRequired === false ? '1.0.0' : undefined);
      assert.equal(validate(output.config.value.workflows.definitions[0]!.definition), true, JSON.stringify(validate.errors));
    }
  }
  for (const operation of ['approve', 'reject', 'admin_reassign']) {
    const source = fixture();
    (source.workflows!.definitions[0]!.definition.nodes.review as any).operationPolicy = { [operation]: { reasonRequired: false } };
    assert.equal(validate(source.workflows!.definitions[0]!.definition), false);
    assert.throws(() => compileApplicationSources(defineOpenXiangdaApp(source)));
  }
});

test('browser invocation has an exact target/subject/CAS/token envelope', () => {
  const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(workflowBusinessCommandInvocationSchema);
  const input = { workflowCode: 'request-approval', target: { kind: 'task', id: '11111111-1111-4111-8111-111111111111', command: 'approve' },
    recordId: '22222222-2222-4222-8222-222222222222', expectedRevision: 3, commandToken: 'A'.repeat(43), idempotencyKey: 'original', input: { comment: '同意' } };
  assert.equal(validate(input), true);
  assert.equal(validate({ ...input, expectedRevision: 0 }), false);
  assert.equal(validate({ ...input, target: { ...input.target, command: 'withdraw' } }), false);
  assert.equal(validate({ ...input, capability: 'forged' }), false);
  const validateCommand = new Ajv2020({ strict: false, validateFormats: false }).compile(businessProcessCommandWithDataSchema);
  const command = { schemaVersion: 'openxiangda.business-process-command-with-data/v2', environmentKey: 'preproduction', workflow: input,
    subject: { fromOperation: 'subject' }, data: { operations: [{ key: 'subject', kind: 'update', resourceCode: 'requests',
      id: input.recordId, expectedRevision: input.expectedRevision, data: { status: 'approved' } }] },
    expectedTransition: { status: 'approved', outcome: 'approved', currentNodeId: null } };
  assert.equal(validateCommand(command), true, JSON.stringify(validateCommand.errors));
  for (const status of ['running', 'approved', 'rejected', 'withdrawn']) {
    assert.equal(validateCommand({ ...command, expectedTransition: { ...command.expectedTransition, status } }), true,
      `authoritative instance status ${status}: ${JSON.stringify(validateCommand.errors)}`);
  }
  assert.equal(validateCommand({ ...command, expectedTransition: { ...command.expectedTransition, status: 'completed' } }), false);
  assert.equal(validateCommand({ ...command, workflow: { ...input, command: 'forged' } }), false);
});

test('launch preflight seals required approval nodes and identical opt-in capability closure', () => {
  const source = fixture();
  source.workflows!.definitions[0]!.definition.launchPreflight = { requiredApprovalNodes: ['review'] };
  const output = compileApplicationSources(defineOpenXiangdaApp(source));
  const target = compileNativeApplicationConfiguration({ appCode: 'command-review', configBytes: output.config.content,
    expectedConfigDigest: output.config.digest, contractBytes: output.contracts.content, expectedContractDigest: output.contracts.digest });
  assert.deepEqual(target.requiredPlatformCapabilities, requiredPlatformCapabilitiesFromConfiguration(output.config.value));
  assert.equal(target.requiredPlatformCapabilities.find(item => item.code === 'workflow.launch-preflight')?.contractVersion, '1.0.0');
  const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(workflowDefinitionSchema);
  assert.equal(validate(output.config.value.workflows.definitions[0]!.definition), true, JSON.stringify(validate.errors));
  const ordinary = compileApplicationSources(defineOpenXiangdaApp(fixture()));
  assert.equal(requiredPlatformCapabilitiesFromConfiguration(ordinary.config.value).some(item => item.code === 'workflow.launch-preflight'), false);
});

test('launch preflight rejects invalid references, cardinality and providers before sealing', () => {
  for (const nodes of [[], ['missing'], ['approved'], ['review', 'review'], Array.from({ length: 21 }, (_, i) => `node${i}`)]) {
    const source = fixture(); source.workflows!.definitions[0]!.definition.launchPreflight = { requiredApprovalNodes: nodes };
    assert.throws(() => compileApplicationSources(defineOpenXiangdaApp(source)), JSON.stringify(nodes));
  }
  for (const provider of ['form_field_users', 'initiator_select', 'application_provider', 'previous_node_actor']) {
    const source = fixture(); source.workflows!.definitions[0]!.definition.launchPreflight = { requiredApprovalNodes: ['review'] };
    (source.workflows!.bindings[0]!.binding.bindings.reviewer as any) = { provider, inputPath: 'amount', providerCode: 'directory' };
    assert.throws(() => compileApplicationSources(defineOpenXiangdaApp(source)), provider);
  }
});
