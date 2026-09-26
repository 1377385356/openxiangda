import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalJson, sha256Digest, contractSchemas, validateDataResource } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import {
  compileApplicationSources,
  defineOpenXiangdaApp,
  requiredPlatformCapabilities,
  type OpenXiangdaAppDeclaration,
} from '../src/index.js';

function declaration(): OpenXiangdaAppDeclaration {
  return {
    app: { code: 'quota-example', name: 'Quota example' },
    data: { resources: [{
      code: 'contracts', name: 'Contracts', fields: [
        { code: 'amount', label: 'Amount', type: 'number.decimal', precision: 18, scale: 2, exactDecimal: true },
        { code: 'amountAlternate', label: 'Alternate amount', type: 'number.decimal', precision: 18, scale: 2, exactDecimal: true },
        { code: 'currencyCode', label: 'Currency', type: 'option.single', options: [{ label: 'CNY', value: 'CNY' }] },
        { code: 'relation', label: 'Relation', type: 'option.single', options: [{ label: 'Main', value: 'main' }, { label: 'Child', value: 'child' }] },
        { code: 'parent', label: 'Parent', type: 'resource-ref.single', source: { kind: 'resource', resourceCode: 'contracts', labelField: 'name' } },
        { code: 'rootId', label: 'Root', type: 'uuid' },
        { code: 'name', label: 'Name', type: 'text.short' },
        { code: 'status', label: 'Status', type: 'option.single', options: [{ label: 'Draft', value: 'draft' }, { label: 'Approving', value: 'approving' }, { label: 'Sign', value: 'signing' }] },
      ],
    }] },
    authz: {
      capabilities: [{ code: 'app:quota-example:contract:submit', kind: 'backend', name: 'Submit' }],
      roles: [{ code: 'manager', name: 'Manager', capabilities: ['app:quota-example:contract:submit'] }],
    },
    backend: { enabled: true, operations: [{
      code: 'contract.submit', method: 'POST', path: '/contracts/submit',
      capability: 'app:quota-example:contract:submit',
      requestSchema: { type: 'object' }, responseSchema: { type: 'object' },
      platformAccess: { decimalReservation: {
        mode: 'reserve', resourceCode: 'contracts', amountFieldCode: 'amount',
        currencyFieldCode: 'currencyCode', relationFieldCode: 'relation',
        parentFieldCode: 'parent', rootFieldCode: 'rootId', statusFieldCode: 'status',
        parentRelationValue: 'main', childRelationValue: 'child',
        eligibleParentStatuses: ['signing'], eligibleChildStatuses: ['approving'],
      } },
    }] },
  };
}

test('immutable decimal reservation declaration survives both compilers and adds its capability', () => {
  const defined = defineOpenXiangdaApp(declaration());
  const compiled = compileApplicationSources(defined);
  const access = compiled.config.value.backend.operations[0]!.platformAccess!.decimalReservation;
  assert.equal(access?.amountFieldCode, 'amount');
  assert.deepEqual(access?.eligibleChildStatuses, ['approving']);
  assert.ok(requiredPlatformCapabilities(defined).some(item => item.code === 'data.decimal-reservations'));
  const input = {
    appCode: 'quota-example',
    configBytes: canonicalJson(compiled.config.value),
    contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: sha256Digest(compiled.config.value),
    expectedContractDigest: sha256Digest(compiled.contracts.value),
  };
  const native = compileNativeApplicationConfiguration(input);
  assert.ok(native.requiredPlatformCapabilities.some(item => item.code === 'data.decimal-reservations'));
});

test('decimal reservation declaration rejects imprecise amount and foreign parent resource', () => {
  const imprecise = declaration();
  imprecise.data!.resources[0]!.fields[0]!.exactDecimal = false;
  assert.throws(() => defineOpenXiangdaApp(imprecise), (error: any) =>
    error.diagnostics?.some((item: any) => item.code === 'APP_CONFIG_BACKEND_OPERATION_PLATFORM_ACCESS_INVALID'));

  const foreign = declaration();
  foreign.data!.resources[0]!.fields[4]!.source!.resourceCode = 'other';
  assert.throws(() => defineOpenXiangdaApp(foreign), (error: any) =>
    error.diagnostics?.some((item: any) => item.code === 'APP_CONFIG_BACKEND_OPERATION_PLATFORM_ACCESS_INVALID'));
});

test('reservation actions sharing a resource cannot disagree on the money mapping', () => {
  const conflicting = declaration();
  const original = conflicting.backend!.operations![0]!;
  conflicting.backend!.operations!.push({
    ...original,
    code: 'contract.release',
    path: '/contracts/release',
    platformAccess: { decimalReservation: {
      ...original.platformAccess!.decimalReservation!,
      mode: 'release',
      amountFieldCode: 'amountAlternate',
    } },
  });
  assert.throws(() => defineOpenXiangdaApp(conflicting), (error: any) =>
    error.diagnostics?.some((item: any) => item.code === 'APP_CONFIG_BACKEND_OPERATION_PLATFORM_ACCESS_INVALID'));

  const consistent = declaration();
  consistent.backend!.operations!.push({
    ...consistent.backend!.operations![0]!,
    code: 'contract.release',
    path: '/contracts/release',
    platformAccess: { decimalReservation: {
      ...consistent.backend!.operations![0]!.platformAccess!.decimalReservation!,
      mode: 'release',
    } },
  });
  const compiled = compileApplicationSources(defineOpenXiangdaApp(consistent));
  const config = structuredClone(compiled.config.value);
  config.backend.operations[1]!.platformAccess!.decimalReservation!.amountFieldCode = 'amountAlternate';
  const contracts = structuredClone(compiled.contracts.value);
  contracts.configDigest = sha256Digest(config);
  contracts.operations.find(operation => operation.code === 'contract.release')!
    .platformAccess!.decimalReservation!.amountFieldCode = 'amountAlternate';
  assert.throws(() => compileNativeApplicationConfiguration({
    appCode: 'quota-example',
    configBytes: canonicalJson(config),
    contractBytes: canonicalJson(contracts),
    expectedConfigDigest: sha256Digest(config),
    expectedContractDigest: sha256Digest(contracts),
  }), (error: any) => error.code === 'NATIVE_DECIMAL_RESERVATION_MAPPING_CONFLICT');
});

test('decimal reservation declaration rejects unknown status and undeclared contract values', () => {
  const badStatus = declaration();
  badStatus.backend!.operations![0]!.platformAccess!.decimalReservation!.eligibleChildStatuses = ['unknown'];
  assert.throws(() => defineOpenXiangdaApp(badStatus), (error: any) =>
    error.diagnostics?.some((item: any) => item.code === 'APP_CONFIG_BACKEND_OPERATION_PLATFORM_ACCESS_INVALID'));

  const badRelation = declaration();
  badRelation.backend!.operations![0]!.platformAccess!.decimalReservation!.childRelationValue = 'subcontract';
  assert.throws(() => defineOpenXiangdaApp(badRelation), (error: any) =>
    error.diagnostics?.some((item: any) => item.code === 'APP_CONFIG_BACKEND_OPERATION_PLATFORM_ACCESS_INVALID'));
});

function lifecycleDeclaration(): OpenXiangdaAppDeclaration {
  const source = declaration();
  const definition = {
    schemaVersion: 'openxiangda.workflow-definition/v2' as const,
    code: 'contract-approval', title: 'Contract approval',
    acceptedCommandDeactivationPolicy: 'finish-pinned' as const,
    subject: { resourceCode: 'contracts', factProjection: { name: 'name' } },
    inputSchema: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' } } },
    startAt: 'review', nodes: {
      review: { id: 'review', title: 'Review', kind: 'approval' as const, mode: 'single' as const,
        binding: 'reviewer', onApprove: 'approved', onReject: 'rejected' },
      approved: { id: 'approved', title: 'Approved', kind: 'end' as const, outcome: 'approved' as const },
      rejected: { id: 'rejected', title: 'Rejected', kind: 'end' as const, outcome: 'rejected' as const },
    },
  };
  source.workflows = {
    definitions: [{ version: 1, definition, launch: { mode: 'work-center-only' } }],
    bindings: [{ version: 1, binding: {
      schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: definition.code,
      bindings: { reviewer: { provider: 'app_role', roleCode: 'manager' } },
    } }],
    activations: [{ workflowCode: definition.code, definitionVersion: 1, bindingVersion: 1,
      acceptedCommandDeactivationPolicy: 'finish-pinned' }],
  };
  source.events = { subscriptions: [{
    code: 'approval-outcome',
    eventTypes: ['openxiangda.workflow.instance.withdrawn.v2', 'openxiangda.workflow.instance.completed.v2'],
    platformAccess: { decimalReservation: {
      resourceCode: 'contracts', workflowCode: 'contract-approval', outcomes: [
        { eventType: 'openxiangda.workflow.instance.withdrawn.v2', mode: 'release', eligibleChildStatuses: ['draft'] },
        { eventType: 'openxiangda.workflow.instance.completed.v2', mode: 'commit', eligibleChildStatuses: ['signing'] },
      ],
    } },
    delivery: { ordering: 'workflow-instance' },
  }] };
  return source;
}

function platformCompile(output: ReturnType<typeof compileApplicationSources>) {
  return compileNativeApplicationConfiguration({
    appCode: 'quota-example', configBytes: canonicalJson(output.config.value),
    contractBytes: canonicalJson(output.contracts.value),
    expectedConfigDigest: sha256Digest(output.config.value), expectedContractDigest: sha256Digest(output.contracts.value),
  });
}

function committedLifecycleDeclaration(): OpenXiangdaAppDeclaration {
  const source = declaration();
  const resource = source.data!.resources[0]!;
  resource.fields.find(field => field.code === 'status')!.options!.push(
    { label: 'Fulfilled', value: 'fulfilled' }, { label: 'Closed', value: 'closed' },
    { label: 'Terminated', value: 'terminated' });
  resource.decimalReservationLifecycle = {
    parentTransitions: [{ from: 'signing', to: 'closed' }, { from: 'closed', to: 'signing' }],
    childTransitions: [{ from: 'signing', to: 'fulfilled' }, { from: 'fulfilled', to: 'signing' },
      { from: 'signing', to: 'terminated' }],
    fulfilledChildStatuses: ['fulfilled'], lockedParentStatuses: ['closed'],
  };
  return source;
}

test('committed lifecycle survives model and resource authoring with identical platform capability evidence', () => {
  const source = committedLifecycleDeclaration();
  const direct = compileApplicationSources(defineOpenXiangdaApp(source));
  const resource = source.data!.resources[0]!;
  delete source.data;
  source.modules = [{ code: 'quota', models: [resource], crud: [{ model: resource.code }] }];
  const model = compileApplicationSources(defineOpenXiangdaApp(source));
  assert.deepEqual(model.config.value.data.resources[0]!.decimalReservationLifecycle,
    direct.config.value.data.resources[0]!.decimalReservationLifecycle);
  const defined = defineOpenXiangdaApp(committedLifecycleDeclaration());
  const requirement = requiredPlatformCapabilities(defined).find(item => item.code === 'data.decimal-reservation-lifecycle');
  assert.equal(requirement?.contractVersion, '1.0.0');
  assert.deepEqual(platformCompile(direct).requiredPlatformCapabilities.find(item => item.code === requirement!.code), requirement);
  assert.deepEqual(platformCompile(model).requiredPlatformCapabilities.find(item => item.code === requirement!.code), requirement);
  const changed = committedLifecycleDeclaration();
  changed.data!.resources[0]!.decimalReservationLifecycle!.childTransitions.pop();
  assert.notDeepEqual(requiredPlatformCapabilities(defineOpenXiangdaApp(changed)).find(item => item.code === requirement!.code), requirement);
  assert.ok(!requiredPlatformCapabilities(defineOpenXiangdaApp(declaration())).some(item => item.code === requirement!.code));
  const reordered = committedLifecycleDeclaration();
  reordered.data!.resources[0]!.decimalReservationLifecycle!.childTransitions.reverse();
  assert.deepEqual(compileApplicationSources(defineOpenXiangdaApp(reordered)).config, direct.config);
});

test('both compilers reject unknown states, invalid edges, absent grants and reserve into locked parents before deployment', () => {
  const mutations: Array<(rule: any, config: any) => void> = [
    rule => { rule.parentTransitions[0].to = 'missing'; },
    rule => { rule.childTransitions[0].to = rule.childTransitions[0].from; },
    rule => { rule.childTransitions.push(rule.childTransitions[0]); },
    rule => { rule.childTransitions[0].extra = true; },
    rule => { rule.fulfilledChildStatuses = ['fulfilled', 'fulfilled']; },
    rule => { rule.lockedParentStatuses = []; },
    rule => { rule.extra = true; },
    (_rule, config) => { config.backend.operations = []; },
    (_rule, config) => { config.backend.operations[0].platformAccess.decimalReservation.eligibleParentStatuses = ['closed']; },
  ];
  for (const mutate of mutations) {
    const source = committedLifecycleDeclaration();
    mutate(source.data!.resources[0]!.decimalReservationLifecycle, source);
    assert.throws(() => defineOpenXiangdaApp(source), (error: any) => error.diagnostics?.some((item: any) =>
      ['APP_CONFIG_DECIMAL_LIFECYCLE_INVALID', 'NATIVE_DECIMAL_LIFECYCLE_INVALID'].includes(item.code) && item.path.includes('decimalReservationLifecycle')));
    const compiled = compileApplicationSources(defineOpenXiangdaApp(committedLifecycleDeclaration()));
    mutate(compiled.config.value.data.resources[0]!.decimalReservationLifecycle, compiled.config.value);
    compiled.contracts.value.configDigest = sha256Digest(compiled.config.value);
    assert.throws(() => platformCompile(compiled), (error: any) =>
      error.code === 'NATIVE_DECIMAL_LIFECYCLE_INVALID' && error.pointer.includes('decimalReservationLifecycle'));
  }
});

test('DataResource schema and public validator enforce the same bounded closed lifecycle shape', () => {
  const resource = compileApplicationSources(defineOpenXiangdaApp(committedLifecycleDeclaration())).config.value.data.resources[0]!;
  const validate = new Ajv2020({ strict: false, formats: { 'date-time': true } }).compile(contractSchemas.dataResource);
  assert.equal(validate(resource), true, JSON.stringify(validate.errors));
  assert.deepEqual(validateDataResource(resource), []);
  const invalid = [null, {}, { ...resource.decimalReservationLifecycle, childTransitions: Array(65).fill({ from: 'signing', to: 'fulfilled' }) },
    { ...resource.decimalReservationLifecycle, childTransitions: [{ from: 'signing', to: 'fulfilled', authority: true }] },
    { ...resource.decimalReservationLifecycle, lockedParentStatuses: ['closed', 'closed'] }];
  for (const rule of invalid) {
    const value = { ...resource, decimalReservationLifecycle: rule };
    assert.equal(validate(value), false);
    assert.ok(validateDataResource(value).some(item => item.code === 'NATIVE_DECIMAL_LIFECYCLE_INVALID'));
  }
});

test('workflow outcome grants survive both compilers and bind the same 1.1 capability digest', () => {
  const compiled = compileApplicationSources(defineOpenXiangdaApp(lifecycleDeclaration()));
  const platform = platformCompile(compiled);
  const requirement = requiredPlatformCapabilities(defineOpenXiangdaApp(lifecycleDeclaration()))
    .find(item => item.code === 'data.decimal-reservations');
  assert.deepEqual(platform.requiredPlatformCapabilities.find(item => item.code === requirement!.code), requirement);
  assert.equal(requirement!.contractVersion, '1.1.0');
  assert.deepEqual(compiled.contracts.value.eventConsumers[0]!.platformAccess,
    compiled.config.value.events.subscriptions[0]!.platformAccess);
  const altered = lifecycleDeclaration();
  altered.events!.subscriptions[0]!.platformAccess!.decimalReservation!.outcomes[0]!.eligibleChildStatuses = ['draft', 'signing'];
  const changed = requiredPlatformCapabilities(defineOpenXiangdaApp(altered)).find(item => item.code === requirement!.code);
  assert.notDeepEqual(changed, requirement);
});

test('both compilers reject forged workflow outcome grants without widening authority', () => {
  const mutations: Array<(grant: any, config: any) => void> = [
    grant => { grant.outcomes[0].mode = grant.outcomes[0].mode === 'commit' ? 'release' : 'commit'; },
    grant => { grant.outcomes[0].eligibleChildStatuses = ['missing']; },
    grant => { grant.outcomes.push(grant.outcomes[0]); },
    grant => { grant.outcomes[0].eventType = 'custom.completed.v2'; },
    grant => { grant.workflowCode = 'unknown'; },
    grant => { grant.resourceCode = 'missing'; },
    grant => { grant.mode = 'release'; },
    (_grant, config) => { config.backend.operations = []; },
    (_grant, config) => { config.events.subscriptions[0].eventTypes = ['openxiangda.workflow.instance.completed.v2']; },
  ];
  for (const mutate of mutations) {
    const source = lifecycleDeclaration();
    mutate(source.events!.subscriptions[0]!.platformAccess!.decimalReservation, source);
    assert.throws(() => defineOpenXiangdaApp(source), (error: any) =>
      error.diagnostics?.some((item: any) => item.code === 'APP_CONFIG_EVENT_PLATFORM_ACCESS_INVALID'));
    const compiled = compileApplicationSources(defineOpenXiangdaApp(lifecycleDeclaration()));
    mutate(compiled.config.value.events.subscriptions[0]!.platformAccess!.decimalReservation, compiled.config.value);
    compiled.contracts.value.configDigest = sha256Digest(compiled.config.value);
    assert.throws(() => platformCompile(compiled), (error: any) => error.code === 'NATIVE_EVENT_DECIMAL_RESERVATION_INVALID');
  }
});
