import assert from 'node:assert/strict';
import test from 'node:test';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import {
  compileApplicationSources,
  defineOpenXiangdaApp,
  dataPolicyExpression,
  resourceReadPolicy,
  resourceRoleCapabilities,
  requiredPlatformCapabilities,
} from '../src/index.js';
function declaration(): any {
  return {
    app: { code: 'reference-app', name: 'Current Native reference read' },
    data: {
      resources: [
        {
          code: 'instruments',
          name: 'Instruments',
          fields: [
            { code: 'name', label: 'Name', type: 'text.short' },
            { code: 'owner', label: 'Current owner', type: 'user.single' },
          ],
          dataPolicyCode: 'instrument-access',
        },
        {
          code: 'orders',
          name: 'Orders',
          fields: [
            {
              code: 'instrument_ref',
              label: 'Instrument',
              type: 'resource-ref.single',
              source: {
                kind: 'resource',
                resourceCode: 'instruments',
                labelField: 'name',
                searchFields: ['name'],
              },
            },
            {
              code: 'costs',
              label: 'Costs',
              type: 'subtable',
              subtable: {
                resourceCode: 'costs',
                foreignKey: 'parent_id',
                orderField: 'position',
                maxRows: 49,
              },
            },
          ],
          dataPolicyCode: 'order-access',
          mutationOwner: 'action',
        },
        {
          code: 'costs',
          name: 'Costs',
          fields: [
            { code: 'parent_id', label: 'Order', type: 'uuid', required: true },
            { code: 'position', label: 'Position', type: 'number.integer', required: true },
          ],
          dataPolicyCode: 'cost-access',
          mutationOwner: 'action',
        },
      ],
    },
    authz: {
      capabilities: [],
      roles: [
        {
          code: 'manager',
          name: 'Manager',
          capabilities: ['instruments', 'orders', 'costs'].flatMap((code) =>
            resourceRoleCapabilities('reference-app', code, 'read')
          ),
        },
      ],
      dataPolicies: [
        {
          code: 'instrument-access',
          name: 'Current instrument owner',
          resourceCode: 'instruments',
          matchMode: 'OR',
          rules: [{ subject: 'current_user', field: 'owner', roleCodes: ['manager'] }],
        },
        resourceReadPolicy({
          code: 'order-access',
          name: 'Current parent instrument',
          resourceCode: 'orders',
          writeBoundary: 'capability_only',
          expression: dataPolicyExpression.referenceRead({
            resourceCode: 'instruments',
            referenceFieldCode: 'instrument_ref',
            readFields: ['owner', 'id'],
            roleCodes: ['manager'],
          }),
        }),
        resourceReadPolicy({
          code: 'cost-access',
          name: 'Current order',
          resourceCode: 'costs',
          writeBoundary: 'capability_only',
          expression: dataPolicyExpression.parentRead({
            resourceCode: 'orders',
            subtableFieldCode: 'costs',
            roleCodes: ['manager'],
          }),
        }),
      ],
    },
  };
}
test('authoring, normalization and target compiler preserve exact mixed read contracts without CRUD expansion', () => {
  const app = defineOpenXiangdaApp(declaration()),
    sources = compileApplicationSources(app);
  const target = compileNativeApplicationConfiguration({
    appCode: app.app.code,
    configBytes: sources.config.content,
    contractBytes: sources.contracts.content,
    expectedConfigDigest: sources.config.digest,
    expectedContractDigest: sources.contracts.digest,
  });
  assert.deepEqual(target.requiredPlatformCapabilities, requiredPlatformCapabilities(app));
  assert.equal(
    target.requiredPlatformCapabilities.find((item) => item.code === 'data.reference-read-policy')
      ?.contractVersion,
    '1.0.0'
  );
  assert.equal(
    target.requiredPlatformCapabilities.find((item) => item.code === 'data.parent-read-policy')
      ?.contractVersion,
    '1.0.0'
  );
  const policy = (sources.config.value.authz.dataPolicies as any[]).find(
    (item) => item.code === 'order-access'
  );
  assert.deepEqual(policy.readExpression, {
    referenceRead: {
      resourceCode: 'instruments',
      referenceFieldCode: 'instrument_ref',
      readFields: ['id', 'owner'],
    },
    roleCodes: ['manager'],
  });
  assert.deepEqual(
    app.authz!.roles![0]!.capabilities.filter((code) => /:(create|update|delete)$/.test(code)),
    []
  );
  assert.equal(
    sources.config.value.data.resources.find((item) => item.code === 'orders')!.surface!
      .mutationOwner,
    'action'
  );
});
test('authoring refuses text identity, hidden extra sources, missing parent authorization fields and write inheritance', () => {
  for (const [change, code] of [
    [
      (value: any) => {
        value.data.resources[1].fields[0].type = 'text.short';
        delete value.data.resources[1].fields[0].source;
      },
      'NATIVE_REFERENCE_READ_BINDING_INVALID',
    ],
    [
      (value: any) => {
        value.authz.dataPolicies[1].readExpression.referenceRead.readFields = ['id'];
      },
      'NATIVE_REFERENCE_READ_AUTHORIZATION_PROJECTION_MISSING',
    ],
    [
      (value: any) => {
        value.authz.dataPolicies[1].readExpression.referenceRead.foreignKey = 'instrument_code';
      },
      'NATIVE_REFERENCE_READ_INVALID',
    ],
    [
      (value: any) => {
        const p = value.authz.dataPolicies[1];
        p.rules = [p.readExpression];
        delete p.readExpression;
        delete p.writeBoundary;
      },
      'NATIVE_REFERENCE_READ_READ_ONLY',
    ],
  ] as const) {
    const value = declaration();
    change(value);
    assert.throws(
      () => defineOpenXiangdaApp(value),
      (error: any) => error.diagnostics.some((item: any) => item.code === code)
    );
  }
});
