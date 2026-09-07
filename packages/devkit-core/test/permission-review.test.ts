import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSIONS, canonicalJson, sha256Digest } from 'openxiangda-contracts';
import {
  compileApplicationSources,
  defineDataModel,
  defineOpenXiangdaApp,
  defineResourceForm,
  resourceRoleCapabilities,
} from '../src/index.js';
import { buildPermissionReview } from '../src/compiler/permission-review.js';

const appCode = 'permission-review';
const readCapability = `app:${appCode}:data:records:read`;
const updateCapability = `app:${appCode}:data:records:update`;
const privateCapability = `app:${appCode}:records:private-read`;

function compileReviewFixture() {
  const model = defineDataModel({
    code: 'records', name: '记录', dataPolicyCode: 'record-access',
    fields: [
      { code: 'title', label: '标题', type: 'text.short', required: true },
      { code: 'owner_id', label: '负责人', type: 'user.single' },
      { code: 'private_note', label: '内部说明', type: 'text.long', access: { read: [privateCapability], update: false, mask: 'null' } },
      { code: 'source_key', label: '来源', type: 'text.short', hidden: true },
    ],
  });
  return compileApplicationSources(defineOpenXiangdaApp({
    app: { code: appCode, name: '权限审阅验证' },
    perspectives: [{ code: 'reading', name: '阅读视图', roleCodes: ['reader'] }],
    modules: [{ code: 'records', models: [model], crud: [
      { model: 'records', code: 'quick', name: '简要登记', form: defineResourceForm(model, { fields: ['title'] }) },
      { model: 'records', code: 'complete', name: '完整管理' },
    ] }],
    frontend: {
      admin: { navigation: [], access: { anyOf: [readCapability, updateCapability] } },
      routes: [{ code: 'record-summary', path: '/record-summary', label: '记录汇总', surface: 'user',
        access: { allOf: [readCapability], anyOf: [privateCapability, updateCapability] } }],
    },
    authz: {
      capabilities: [],
      roles: [
        { code: 'reader', name: '阅读成员', capabilities: [readCapability] },
        { code: 'manager', name: '管理成员', capabilities: [...resourceRoleCapabilities(appCode, 'records', 'manage'), privateCapability], deniedCapabilities: [updateCapability] },
        { code: 'contributor', name: '编辑成员', capabilities: [updateCapability] },
        { code: 'visitor', name: '待授权成员', capabilities: [] },
      ],
      dataPolicies: [{
        code: 'record-access', name: '记录范围', resourceCode: 'records',
        unrestrictedRoleCodes: ['manager'], matchMode: 'AND', rules: [],
        writeBoundary: 'capability_only',
        readExpression: { anyOf: [
          { subject: 'current_user', field: 'owner_id', roleCodes: ['reader'] },
          { allOf: [{ field: 'title', operator: 'eq', value: '公开' }, { field: 'source_key', operator: 'is_not_null' }] },
        ] },
      }],
    },
    workflows: {
      definitions: [{ version: 1, launch: { mode: 'standalone' }, definition: {
        schemaVersion: SCHEMA_VERSIONS.workflowDefinition, code: 'record-review', title: '记录审批',
        acceptedCommandDeactivationPolicy: 'finish-pinned',
        subject: { resourceCode: 'records', factProjection: { title: 'title' } },
        startAt: 'review', inputSchema: { type: 'object', additionalProperties: false },
        nodes: {
          review: { id: 'review', kind: 'approval', title: '成员审核', binding: 'reviewer', mode: 'all',
            onApprove: 'done', onReject: 'rejected', allowedOperations: ['approve', 'reject', 'transfer', 'add_assignee'],
            fieldPolicy: { default: 'readonly', fields: { private_note: 'hidden', title: 'edit_required' } } },
          done: { id: 'done', kind: 'end', title: '通过', outcome: 'approved' },
          rejected: { id: 'rejected', kind: 'end', title: '拒绝', outcome: 'rejected' },
        },
      } }],
      bindings: [{ version: 1, binding: {
        schemaVersion: SCHEMA_VERSIONS.workflowBinding, workflowCode: 'record-review',
        bindings: { reviewer: { provider: 'app_role', roleCode: 'manager', min: 1, max: 20, delegatable: true } },
      } }],
      activations: [{ workflowCode: 'record-review', definitionVersion: 1, bindingVersion: 1, acceptedCommandDeactivationPolicy: 'finish-pinned' }],
    },
  }));
}

test('review keeps sealed role grants local and never derives a grant from generated pages', () => {
  const source = compileReviewFixture();
  const review = buildPermissionReview(source.config.value, source.contracts.value);
  const role = (code: string) => review.roles.find(item => item.code === code)!;
  assert.equal(review.schemaVersion, 'openxiangda.permission-review/v2');
  assert.equal(review.authority, 'declaration-projection');
  assert.equal(review.runtimeAuthorizationRequired, true);
  assert.match(review.semantics.capabilityMatch, /never runtime allow/);
  assert.equal(role('manager').capabilityCodes.includes(updateCapability), false);
  assert.deepEqual(role('contributor').capabilityCodes, [updateCapability]);
  assert.deepEqual(role('visitor').capabilityCodes, []);
  assert.ok(review.pages.admin.some(page => page.kind === 'resource-update'));
  assert.equal(Object.hasOwn(role('manager'), 'deniedCapabilities'), false);
  assert.deepEqual(review.roles.map(item => item.code), ['contributor', 'manager', 'reader', 'visitor']);
});

test('named views refer to one field policy catalog and explicit empty field grants stay deny', () => {
  const source = compileReviewFixture();
  const review = buildPermissionReview(source.config.value, source.contracts.value);
  const resource = review.resources.find(item => item.code === 'records')!;
  const field = (code: string) => resource.fields.find(item => item.code === code)!;
  assert.equal(review.resources.length, 1);
  assert.equal(resource.fields.length, 4);
  assert.deepEqual(resource.views.map(view => view.code), ['complete', 'quick']);
  assert.equal(review.pages.admin.filter(page => page.resourceCode === 'records').length, 8);
  assert.deepEqual(new Set(review.pages.admin.map(page => page.viewCode)), new Set(['quick', 'complete']));
  assert.deepEqual(field('private_note').update, { kind: 'deny' });
  assert.deepEqual(field('private_note').read, { kind: 'all-of', capabilityCodes: [privateCapability] });
  assert.equal(field('private_note').mask, 'null');
  assert.equal(field('source_key').hidden, true);
  assert.deepEqual(field('source_key').create, { kind: 'all-of', capabilityCodes: [`app:${appCode}:data:records:create`] });
  assert.deepEqual(review.pages.custom.find(page => page.code === 'record-summary')?.access, {
    allOf: [readCapability], anyOf: [updateCapability, privateCapability],
  });
  assert.deepEqual(review.pages.adminAccess, source.contracts.value.adminAccess);
});

test('raw row expressions and workflow participant/task constraints stay unevaluated', () => {
  const source = compileReviewFixture();
  const review = buildPermissionReview(source.config.value, source.contracts.value);
  assert.deepEqual(review.authorization.dataPolicies, source.config.value.authz.dataPolicies);
  assert.equal(review.resources[0]?.dataPolicyCode, 'record-access');
  assert.deepEqual(review.workflows.bindings, source.config.value.workflows.bindings);
  assert.deepEqual(review.workflows.activations, source.config.value.workflows.activations);
  assert.deepEqual(review.workflows.definitions[0]?.nodes, source.config.value.workflows.definitions[0]?.definition.nodes);
  assert.equal(review.workflows.runtimeAuthorizationRequired, true);
  assert.deepEqual(review.perspectives, source.contracts.value.perspectives);
  assert.match(review.semantics.perspectives, /never replace the actor/);
  assert.match(review.semantics.workflowTasks, /Task Surface and fresh command token/);
  assert.ok(review.pages.standard.some(page => page.kind === 'workflow-task'));
  assert.ok(review.pages.standard.some(page => page.kind === 'workflow-launch' && page.workflowCode === 'record-review'));
});

test('review is deterministic, digest-paired and detached from compiler-owned objects', () => {
  const source = compileReviewFixture();
  const before = canonicalJson(source);
  const review = buildPermissionReview(source.config.value, source.contracts.value);
  assert.deepEqual(review, buildPermissionReview(source.config.value, source.contracts.value));
  assert.equal(review.configDigest, source.config.digest);
  assert.equal(review.contractDigest, source.contracts.digest);
  const { digest, ...value } = review;
  assert.equal(digest, sha256Digest(value));
  review.roles[0]!.capabilityCodes.push('untrusted.change');
  review.resources[0]!.views[0]!.fieldOrder.form.push('untrusted_field');
  review.workflows.bindings[0]!.binding.bindings.reviewer!.roleCode = 'visitor';
  assert.equal(canonicalJson(source), before);
  assert.throws(() => buildPermissionReview({ ...source.config.value, appCode: 'other-app' }, source.contracts.value), /PERMISSION_REVIEW_CONFIG_MISMATCH/);
  assert.throws(() => buildPermissionReview(source.config.value, { ...source.contracts.value, configDigest: '0'.repeat(64) }), /PERMISSION_REVIEW_CONFIG_MISMATCH/);
});

test('review grows by role catalog entries instead of multiplying targets and fields', () => {
  const source = compileReviewFixture();
  const before = buildPermissionReview(source.config.value, source.contracts.value);
  const config = structuredClone(source.config.value);
  config.authz.roles.push(...Array.from({ length: 100 }, (_, index) => ({
    code: `extra-${index}`, name: `审核角色 ${index}`, capabilities: [readCapability],
  })));
  const contract = { ...source.contracts.value, configDigest: sha256Digest(config) };
  const after = buildPermissionReview(config, contract);
  assert.equal(after.roles.length, before.roles.length + 100);
  assert.deepEqual(after.pages, before.pages);
  assert.deepEqual(after.resources, before.resources);
  assert.deepEqual(after.authorization, before.authorization);
  assert.deepEqual(after.workflows, before.workflows);
});

test('an omitted field policy is distinguishable from an explicit empty deny', () => {
  const source = compileReviewFixture();
  const config = structuredClone(source.config.value);
  delete config.data.resources[0]!.fieldPolicies.title!.read;
  const contract = { ...source.contracts.value, configDigest: sha256Digest(config) };
  const review = buildPermissionReview(config, contract);
  assert.deepEqual(review.resources[0]!.fields.find(field => field.code === 'title')!.read, { kind: 'inherit-resource-operation' });
  assert.deepEqual(review.resources[0]!.fields.find(field => field.code === 'private_note')!.update, { kind: 'deny' });
});
