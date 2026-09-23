import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest } from 'openxiangda-contracts';
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
