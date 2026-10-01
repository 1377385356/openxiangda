import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { contractSchemas } from 'openxiangda-contracts';

test('potential references carry bounded source and version meaning without business facts', () => {
  const validate = new Ajv2020({ strict: false }).compile(contractSchemas.workflowRoleReferencePage);
  const node = { workflowCode: 'request', workflowTitle: '合成申请', nodeId: 'review', nodeTitle: '审批', roleCode: 'reviewer', definitionVersion: 1, bindingVersion: 2, definitionDigest: 'a'.repeat(64), bindingDigest: 'b'.repeat(64), configurationRevision: 3, contexts: ['active', 'in_flight'], source: 'default_binding', provider: 'app_role' };
  const page = { schemaVersion: 'openxiangda.workflow-role-reference-page/v2', roleCode: 'reviewer', items: [node], total: 1, limit: 20, offset: 0, meaning: 'potential_nodes_keep_existing_tasks' };
  assert.equal(validate(page), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...page, items: [{ ...node, source: 'routing_source', routingSourceCode: 'extra', provider: 'app_role_in_scope', scopeDimensionCode: 'college' }] }), true);
  for (const item of [{ ...node, userId: 'private' }, { ...node, instanceId: 'private' }, { ...node, contexts: ['active', 'active'] }, { ...node, source: 'routing_source' }, { ...node, provider: 'app_role_in_scope' }, { ...node, scopeDimensionCode: 'college' }]) assert.equal(validate({ ...page, items: [item] }), false);
  for (const changed of [{ limit: 101 }, { total: 10001 }, { meaning: 'affected_tasks' }, { items: Array.from({ length: 101 }, () => node) }]) assert.equal(validate({ ...page, ...changed }), false);
});

test('management scope values have their own offset contract rather than the field picker cursor contract', () => {
  const validate = new Ajv2020({ strict: false }).compile(contractSchemas.nativeRoleManagementScopeValuePage);
  const page = { schemaVersion: 'openxiangda.native-role-management-scope-value-page/v2', environment: { id: 'environment', key: 'preproduction', headRevision: 2, authzRevisionId: 'authorization', scopeDataVersion: '1' }, dimensionCode: 'college', items: [{ id: 'art', label: '合成学院' }], limit: 20, offset: 40 };
  assert.equal(validate(page), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...page, items: [{ value: 'art', label: '合成学院' }], nextCursor: 'cursor' }), false);
  assert.equal(validate({ ...page, schemaVersion: 'openxiangda.native-scope-value-page/v2' }), false);
  assert.equal(validate({ ...page, items: Array.from({ length: 101 }, () => ({ id: 'art', label: '合成学院' })) }), false);
});
