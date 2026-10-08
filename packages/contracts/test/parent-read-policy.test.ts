import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as esm from '../dist/native-compiler/index.js';
const cjs = createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof esm;

function fixture() {
  return {
    resources: [{ code: 'orders', schema: { fields: [{ code: 'costs', type: 'subtable',
      subtable: { resourceCode: 'order-costs', foreignKey: 'parent_id', orderField: 'position', maxRows: 49 } }] } },
    { code: 'order-costs', dataPolicyCode: 'cost-access', schema: { fields: [{ code: 'parent_id', type: 'uuid', nullable: false },
      { code: 'position', type: 'number.integer', nullable: false }] } }],
    policies: [{ code: 'cost-access', resourceCode: 'order-costs', matchMode: 'AND', rules: [], writeBoundary: 'capability_only',
      readExpression: { anyOf: [{ relationCode: 'order-reserver', resourceCode: 'orders', field: 'parent_id' },
        { parentRead: { resourceCode: 'orders', subtableFieldCode: 'costs' }, roleCodes: ['college-admin'] }] } }],
  };
}
for (const [label, implementation] of [['ESM', esm], ['CJS', cjs]] as const) {
  test(`${label} resolves the sealed parent relation and captures original child FK`, () => {
    const { resources, policies } = fixture();
    assert.doesNotThrow(() => implementation.validateNativeParentReadPolicies(resources, policies));
    assert.deepEqual(implementation.resolveNativeParentReadBinding(resources, 'order-costs',
      { resourceCode: 'orders', subtableFieldCode: 'costs' }, '/leaf'),
    { resourceCode: 'orders', subtableFieldCode: 'costs', childResourceCode: 'order-costs', foreignKey: 'parent_id', orderField: 'position' });
    const plans = implementation.compileNativeEventCapturePlansV2({ resources, dataPolicies: policies, subscriptions: [] });
    assert.deepEqual(plans.find(plan => plan.resourceCode === 'order-costs')!.authorizationFields, ['parent_id']);
    assert.equal(implementation.nativeDataPolicyExpressionToCnfV2(policies[0]!.readExpression, '/read').flat().length, 2);
  });
  test(`${label} derives exact capability usage and preserves ordinary policies`, () => {
    const corpus = JSON.parse(readFileSync(new URL('./fixtures/configuration-compatibility-corpus.json', import.meta.url), 'utf8'));
    const config = JSON.parse(corpus.configuration.canonical);
    assert.equal(implementation.compileRequiredPlatformCapabilitiesV3(config).some(item => item.code === 'data.parent-read-policy'), false);
    config.authz.dataPolicies.push(fixture().policies[0]);
    assert.equal(implementation.compileRequiredPlatformCapabilitiesV3(config).find(item => item.code === 'data.parent-read-policy')?.contractVersion, '1.0.0');
  });
  const invalidCases: Array<[string, (value: ReturnType<typeof fixture>) => void, string]> = [
    ['policy bound to another child contract', value => { value.resources[1]!.dataPolicyCode = 'other-access'; }, 'NATIVE_PARENT_READ_POLICY_BINDING_INVALID'],
    ['missing parent', value => { value.policies[0]!.readExpression.anyOf[1]!.parentRead!.resourceCode = 'missing'; }, 'NATIVE_PARENT_READ_BINDING_INVALID'],
    ['wrong subtable', value => { value.policies[0]!.readExpression.anyOf[1]!.parentRead!.subtableFieldCode = 'missing'; }, 'NATIVE_PARENT_READ_BINDING_INVALID'],
    ['table injection', value => { Object.assign(value.policies[0]!.readExpression.anyOf[1]!.parentRead!, { tableName: 'injected' }); }, 'NATIVE_PARENT_READ_INVALID'],
    ['leaf field injection', value => { Object.assign(value.policies[0]!.readExpression.anyOf[1]!, { field: 'parent_id' }); }, 'NATIVE_PARENT_READ_RULE_KEYS_INVALID'],
    ['ambiguous shared child', value => { value.resources.push({ ...structuredClone(value.resources[0]!), code: 'other-orders' }); }, 'NATIVE_PARENT_READ_PARENT_AMBIGUOUS'],
    ['non UUID FK', value => { value.resources[1]!.schema.fields[0]!.type = 'text.short'; }, 'NATIVE_PARENT_READ_FOREIGN_KEY_INVALID'],
    ['write expansion', value => { Object.assign(value.policies[0]!, { rules: [value.policies[0]!.readExpression.anyOf[1]], operations: ['read', 'update'] }); }, 'NATIVE_PARENT_READ_READ_ONLY'],
    ['implicit write expansion', value => { Object.assign(value.policies[0]!, { rules: [value.policies[0]!.readExpression.anyOf[1]] }); }, 'NATIVE_PARENT_READ_READ_ONLY'],
  ];
  for (const [name, edit, code] of invalidCases) test(`${label} rejects ${name}`, () => {
    const value = fixture(); edit(value);
    assert.throws(() => implementation.validateNativeParentReadPolicies(value.resources, value.policies), (error: any) => error.code === code);
  });
  test(`${label} forbids self references and parent-read multi-hop/cycles`, () => {
    const value: any = fixture();
    value.resources[0].schema.fields[0].subtable.resourceCode = 'orders';
    value.policies[0].resourceCode = 'orders'; value.resources[0].dataPolicyCode='cost-access';
    assert.throws(() => implementation.validateNativeParentReadPolicies(value.resources, value.policies), /NATIVE_PARENT_READ_BINDING_INVALID/);
    const chained: any = fixture();
    chained.resources.push({ code: 'grandparents', schema: { fields: [{ code: 'orders', type: 'subtable',
      subtable: { resourceCode: 'orders', foreignKey: 'parent_id', orderField: 'position' } }] } });
    chained.resources[0].dataPolicyCode='order-access';
    chained.resources[0].schema.fields.push({ code: 'parent_id', type: 'uuid' });
    chained.policies.push({ code: 'order-access', resourceCode: 'orders', operations: ['read'], matchMode: 'OR',
      rules: [{ parentRead: { resourceCode: 'grandparents', subtableFieldCode: 'orders' } }] });
    assert.throws(() => implementation.validateNativeParentReadPolicies(chained.resources, chained.policies), /NATIVE_PARENT_READ_MULTI_HOP_FORBIDDEN/);
  });
}
