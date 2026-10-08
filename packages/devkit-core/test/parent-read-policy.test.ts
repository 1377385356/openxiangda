import assert from 'node:assert/strict';
import test from 'node:test';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, defineOpenXiangdaApp, dataPolicyExpression, resourceReadPolicy,
  resourceRoleCapabilities, requiredPlatformCapabilities } from '../src/index.js';

function declaration(): any {
  return { app: { code: 'parent-app', name: 'Parent read fixture' },
    data: { resources: [
      { code: 'orders', name: 'Orders', fields: [{ code: 'owner', label: 'Owner', type: 'user.single' },
        { code: 'costs', label: 'Costs', type: 'subtable', subtable: { resourceCode: 'order-costs', foreignKey: 'parent_id', orderField: 'position', maxRows: 49 } }],
      dataPolicyCode: 'order-access' },
      { code: 'order-costs', name: 'Costs', fields: [{ code: 'parent_id', label: 'Parent', type: 'uuid', required: true },
        { code: 'position', label: 'Position', type: 'number.integer', required: true }, { code: 'amount', label: 'Amount', type: 'number.decimal' }],
      dataPolicyCode: 'cost-access', mutationOwner: 'action' },
    ] }, authz: { capabilities: [], roles: [{ code: 'manager', name: 'Manager', capabilities: [
      ...resourceRoleCapabilities('parent-app', 'orders', 'read'), ...resourceRoleCapabilities('parent-app', 'order-costs', 'read') ] }],
      dataPolicies: [{ code: 'order-access', name: 'Owned order', resourceCode: 'orders', matchMode: 'AND',
        rules: [{ subject: 'current_user', field: 'owner', roleCodes: ['manager'] }] },
      resourceReadPolicy({ code: 'cost-access', name: 'Parent cost access', resourceCode: 'order-costs', writeBoundary: 'capability_only',
        expression: dataPolicyExpression.parentRead({ resourceCode: 'orders', subtableFieldCode: 'costs', roleCodes: ['manager'] }) })] } };
}

test('source normalization and sealed target compiler agree on parentRead without widening CRUD', () => {
  const app = defineOpenXiangdaApp(declaration());
  const sources = compileApplicationSources(app);
  const target = compileNativeApplicationConfiguration({ appCode: app.app.code,
    configBytes: sources.config.content, contractBytes: sources.contracts.content,
    expectedConfigDigest: sources.config.digest, expectedContractDigest: sources.contracts.digest });
  assert.deepEqual(target.requiredPlatformCapabilities, requiredPlatformCapabilities(app));
  assert.equal(target.requiredPlatformCapabilities.find(item => item.code === 'data.parent-read-policy')?.contractVersion, '1.0.0');
  const policy = (sources.config.value.authz.dataPolicies as any[]).find(policy => policy.code === 'cost-access');
  assert.deepEqual(policy.readExpression, { parentRead: { resourceCode: 'orders', subtableFieldCode: 'costs' }, roleCodes: ['manager'] });
  assert.deepEqual(policy.rules, []);
  assert.equal(policy.writeBoundary, 'capability_only');
  const child = sources.config.value.data.resources.find(resource => resource.code === 'order-costs')!;
  assert.equal(child.surface!.mutationOwner, 'action');
  assert.equal(child.schema.fields.find(field => field.code === 'parent_id')!.type, 'uuid');
  assert.deepEqual(app.authz!.roles![0]!.capabilities.filter(code => /order-costs:(create|update|delete)$/.test(code)), []);
});

test('authoring rejects a shadow FK/table input and a base rule that can affect writes', () => {
  const injected = declaration();
  injected.authz.dataPolicies[1].readExpression.parentRead.foreignKey = 'guessed_owner';
  assert.throws(() => defineOpenXiangdaApp(injected), (error: any) => error.diagnostics.some((item: any) => item.code === 'NATIVE_PARENT_READ_INVALID'));
  const writes = declaration();
  const policy = writes.authz.dataPolicies[1];
  policy.rules = [policy.readExpression]; delete policy.readExpression; delete policy.writeBoundary;
  assert.throws(() => defineOpenXiangdaApp(writes), (error: any) => error.diagnostics.some((item: any) => item.code === 'NATIVE_PARENT_READ_READ_ONLY'));
});
