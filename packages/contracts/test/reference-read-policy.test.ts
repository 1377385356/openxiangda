import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as esm from '../dist/native-compiler/index.js';
const cjs = createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof esm;
function fixture(): any {
  return {
    resources: [
      {
        code: 'instruments',
        dataPolicyCode: 'instrument-access',
        schema: { fields: [{ code: 'owner', type: 'user.single' }] },
      },
      {
        code: 'orders',
        dataPolicyCode: 'order-access',
        schema: {
          fields: [
            {
              code: 'instrument_ref',
              type: 'resource-ref.single',
              source: { kind: 'resource', resourceCode: 'instruments' },
            },
            {
              code: 'costs',
              type: 'subtable',
              subtable: { resourceCode: 'costs', foreignKey: 'parent_id', maxRows: 49 },
            },
          ],
        },
      },
      {
        code: 'costs',
        dataPolicyCode: 'cost-access',
        schema: { fields: [{ code: 'parent_id', type: 'uuid' }] },
      },
    ],
    policies: [
      {
        code: 'instrument-access',
        resourceCode: 'instruments',
        matchMode: 'OR',
        rules: [{ subject: 'current_user', field: 'owner' }],
      },
      {
        code: 'order-access',
        resourceCode: 'orders',
        matchMode: 'AND',
        rules: [],
        writeBoundary: 'capability_only',
        readExpression: {
          referenceRead: {
            resourceCode: 'instruments',
            referenceFieldCode: 'instrument_ref',
            readFields: ['id', 'owner'],
          },
          roleCodes: ['manager'],
        },
      },
      {
        code: 'cost-access',
        resourceCode: 'costs',
        operations: ['read'],
        matchMode: 'OR',
        rules: [{ parentRead: { resourceCode: 'orders', subtableFieldCode: 'costs' } }],
      },
    ],
  };
}
function linear(edges: number, cycle = false): any {
  const resources: any[] = [],
    policies: any[] = [];
  for (let i = 0; i <= edges; i++) {
    const target = i < edges ? i + 1 : 0,
      referenced = i < edges || cycle;
    resources.push({
      code: `node-${i}`,
      dataPolicyCode: `access-${i}`,
      schema: {
        fields: [
          { code: 'owner', type: 'user.single' },
          ...(referenced
            ? [
                {
                  code: 'parent_ref',
                  type: 'resource-ref.single',
                  source: { kind: 'resource', resourceCode: `node-${target}` },
                },
              ]
            : []),
        ],
      },
    });
    policies.push({
      code: `access-${i}`,
      resourceCode: `node-${i}`,
      operations: ['read'],
      matchMode: 'OR',
      rules: referenced
        ? [
            {
              referenceRead: {
                resourceCode: `node-${target}`,
                referenceFieldCode: 'parent_ref',
                readFields: ['id', 'owner', ...(target < edges || cycle ? ['parent_ref'] : [])],
              },
            },
          ]
        : [{ subject: 'current_user', field: 'owner' }],
    });
  }
  return { resources, policies };
}
for (const [label, implementation] of [
  ['ESM', esm],
  ['CJS', cjs],
] as const) {
  test(`${label} seals Native single-reference identity, projection, mixed depth and event dependencies`, () => {
    const value = fixture();
    implementation.validateNativeParentReadPolicies(value.resources, value.policies);
    implementation.validateNativeReferenceReadPolicies(value.resources, value.policies);
    assert.deepEqual(
      implementation.resolveNativeReferenceReadBinding(
        value.resources,
        'orders',
        value.policies[1].readExpression.referenceRead,
        '/leaf'
      ),
      {
        resourceCode: 'instruments',
        referenceFieldCode: 'instrument_ref',
        readFields: ['id', 'owner'],
        childResourceCode: 'orders',
      }
    );
    const plans = implementation.compileNativeEventCapturePlansV2({
      resources: value.resources,
      dataPolicies: value.policies,
      subscriptions: [],
    });
    assert.deepEqual(plans.find((plan) => plan.resourceCode === 'orders')!.authorizationFields, [
      'instrument_ref',
    ]);
    assert.deepEqual(plans.find((plan) => plan.resourceCode === 'costs')!.authorizationFields, [
      'parent_id',
    ]);
    const accepted = linear(2);
    assert.doesNotThrow(() =>
      implementation.validateNativeReferenceReadPolicies(accepted.resources, accepted.policies)
    );
  });
  test(`${label} derives an opt-in exact capability and leaves legacy requirements alone`, () => {
    const corpus = JSON.parse(
      readFileSync(
        new URL('./fixtures/configuration-compatibility-corpus.json', import.meta.url),
        'utf8'
      )
    );
    const config = JSON.parse(corpus.configuration.canonical);
    assert.equal(
      implementation
        .compileRequiredPlatformCapabilitiesV3(config)
        .some((item) => item.code === 'data.reference-read-policy'),
      false
    );
    config.authz.dataPolicies.push(fixture().policies[1]);
    assert.equal(
      implementation
        .compileRequiredPlatformCapabilitiesV3(config)
        .find((item) => item.code === 'data.reference-read-policy')?.contractVersion,
      '1.0.0'
    );
  });
  const invalid: Array<[string, (value: any) => void, string]> = [
    [
      'table injection',
      (v) => {
        v.policies[1].readExpression.referenceRead.tableName = 'unsafe';
      },
      'NATIVE_REFERENCE_READ_INVALID',
    ],
    [
      'missing resource',
      (v) => {
        v.policies[1].readExpression.referenceRead.resourceCode = 'missing';
      },
      'NATIVE_REFERENCE_READ_BINDING_INVALID',
    ],
    [
      'wrong target',
      (v) => {
        v.resources[1].schema.fields[0].source.resourceCode = 'costs';
      },
      'NATIVE_REFERENCE_READ_BINDING_INVALID',
    ],
    [
      'text shadow',
      (v) => {
        v.resources[1].schema.fields[0].type = 'text.short';
      },
      'NATIVE_REFERENCE_READ_BINDING_INVALID',
    ],
    [
      'multiple reference',
      (v) => {
        v.resources[1].schema.fields[0].type = 'resource-ref.multiple';
      },
      'NATIVE_REFERENCE_READ_BINDING_INVALID',
    ],
    [
      'wrong child policy',
      (v) => {
        v.resources[1].dataPolicyCode = 'other-access';
      },
      'NATIVE_REFERENCE_READ_POLICY_BINDING_INVALID',
    ],
    [
      'unknown field',
      (v) => {
        v.policies[1].readExpression.referenceRead.readFields.push('private_missing');
      },
      'NATIVE_REFERENCE_READ_PROJECTION_INVALID',
    ],
    [
      'duplicate projection',
      (v) => {
        v.policies[1].readExpression.referenceRead.readFields.push('owner');
      },
      'NATIVE_REFERENCE_READ_INVALID',
    ],
    [
      'empty projection',
      (v) => {
        v.policies[1].readExpression.referenceRead.readFields = [];
      },
      'NATIVE_REFERENCE_READ_INVALID',
    ],
    [
      'implicit parent scope',
      (v) => {
        v.policies[1].readExpression.referenceRead.readFields = ['id'];
      },
      'NATIVE_REFERENCE_READ_AUTHORIZATION_PROJECTION_MISSING',
    ],
    [
      'missing parent policy',
      (v) => {
        v.resources[0].dataPolicyCode = 'missing';
      },
      'NATIVE_REFERENCE_READ_PARENT_POLICY_MISSING',
    ],
    [
      'leaf source splice',
      (v) => {
        v.policies[1].readExpression.subject = 'current_user';
      },
      'NATIVE_REFERENCE_READ_RULE_KEYS_INVALID',
    ],
    [
      'write expansion',
      (v) => {
        v.policies[1].rules = [v.policies[1].readExpression];
        v.policies[1].operations = ['read', 'update'];
        delete v.policies[1].readExpression;
      },
      'NATIVE_REFERENCE_READ_READ_ONLY',
    ],
    [
      'implicit write expansion',
      (v) => {
        v.policies[1].rules = [v.policies[1].readExpression];
        delete v.policies[1].readExpression;
      },
      'NATIVE_REFERENCE_READ_READ_ONLY',
    ],
  ];
  for (const [name, change, code] of invalid)
    test(`${label} rejects ${name}`, () => {
      const v = fixture();
      change(v);
      assert.throws(
        () => implementation.validateNativeReferenceReadPolicies(v.resources, v.policies),
        (e: any) => e.code === code
      );
    });
  test(`${label} refuses a third edge and cycles without loosening pure parentRead`, () => {
    const tooDeep = linear(3),
      cyclic = linear(1, true);
    assert.throws(
      () => implementation.validateNativeReferenceReadPolicies(tooDeep.resources, tooDeep.policies),
      /NATIVE_REFERENCE_READ_DEPTH_EXCEEDED/
    );
    assert.throws(
      () => implementation.validateNativeReferenceReadPolicies(cyclic.resources, cyclic.policies),
      /NATIVE_REFERENCE_READ_CYCLE/
    );
  });
}
