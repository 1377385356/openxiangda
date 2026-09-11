import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, defineOpenXiangdaApp, type OpenXiangdaAppDeclaration } from '../src/index.js';

function declaration(): OpenXiangdaAppDeclaration {
  return {
    app: { code: 'public-fields', name: '公开字段回归' },
    frontend: {
      routes: [{ code: 'apply', path: '/apply', label: '申请', surface: 'user' }],
      publicAccess: { policies: [{
        code: 'public-apply', routeCode: 'apply', resourceCode: 'requests', mode: 'anonymous',
        operations: ['create'], fields: ['title', 'file', 'photo', 'choices'], requiredFields: ['title'],
        draft: { enabled: true },
      }] },
    },
    data: { resources: [{
      code: 'requests', name: '申请',
      fields: [
        { code: 'title', label: '标题', type: 'text.short', required: true },
        { code: 'file', label: '材料', type: 'file', file: { maxCount: 5, maxSizeMb: 10, accept: ['application/pdf'] } },
        { code: 'photo', label: '图片', type: 'image', file: { maxCount: 1, maxSizeMb: 5, accept: ['image/png'] } },
        { code: 'choices', label: '可选项目', type: 'option.multiple', options: [{ value: 'a', label: '甲' }] },
        { code: 'internalFiles', label: '内部附件', type: 'file', file: { maxCount: 5, maxSizeMb: 10, accept: ['application/pdf'] } },
      ],
    }] },
  };
}

function nativeCompile(compiled: ReturnType<typeof compileApplicationSources>) {
  const configBytes = canonicalJson(compiled.config.value);
  const contractBytes = canonicalJson(compiled.contracts.value);
  return compileNativeApplicationConfiguration({
    appCode: 'public-fields', configBytes, contractBytes,
    expectedConfigDigest: sha256Digest(compiled.config.value), expectedContractDigest: sha256Digest(compiled.contracts.value),
  });
}

test('可选附件、图片、多选与未公开可选字段贯通声明、AI 输入和原生编译', () => {
  const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration()));
  const create = compiled.aiCatalog.value.capabilities.find(item => item.code === 'public-fields.requests.create');
  assert.ok(create);
  assert.deepEqual(create.inputSchema.required, ['title']);
  assert.equal(nativeCompile(compiled).appCode, 'public-fields');
  const resource = compiled.config.value.data.resources[0]!;
  assert.equal(resource.schema.fields.find(field => field.code === 'file')?.nullable, false);
  assert.equal(resource.surface?.fields.file?.requiredHint, undefined);
  assert.equal(compiled.config.value.frontend.publicAccess!.policies[0]!.fields.includes('internalFiles'), false);
});

test('明确必填的附件仍必须覆盖，错误指出 requiredFields 和实际字段', () => {
  const input = declaration();
  input.data!.resources![0]!.fields![1]!.required = true;
  assert.throws(() => defineOpenXiangdaApp(input), (error: any) =>
    error.diagnostics.some((item: any) => item.code === 'APP_CONFIG_ANONYMOUS_CREATE_FIELDS_INCOMPLETE' &&
      item.path === 'frontend.publicAccess.policies[0].requiredFields' && item.message.includes('file')));
  input.frontend!.publicAccess!.policies[0]!.requiredFields!.push('file');
  const compiled = compileApplicationSources(defineOpenXiangdaApp(input));
  assert.equal(nativeCompile(compiled).appCode, 'public-fields');
  const create = compiled.aiCatalog.value.capabilities.find(item => item.code === 'public-fields.requests.create')!;
  assert.deepEqual(create.inputSchema.required, ['title', 'file']);

  // 绕过应用声明层直接送原生配置，也不能省略真正必填字段。
  compiled.config.value.frontend.publicAccess!.policies[0]!.requiredFields = ['title'];
  compiled.contracts.value.publicAccess!.policies[0]!.requiredFields = ['title'];
  assert.throws(() => nativeCompile(compiled), (error: any) =>
    error.code === 'NATIVE_PUBLIC_CREATE_FIELDS_INCOMPLETE' &&
      error.pointer.endsWith('/requiredFields') && error.identifiers.fieldCode === 'file');
});

test('必填标量不能漏出公开字段集合，默认表单不把可选数组变为必填', () => {
  const input = declaration();
  input.frontend!.publicAccess!.policies[0]!.fields = ['file'];
  input.frontend!.publicAccess!.policies[0]!.requiredFields = [];
  assert.throws(() => defineOpenXiangdaApp(input), (error: any) =>
    error.diagnostics.some((item: any) => item.code === 'APP_CONFIG_ANONYMOUS_CREATE_FIELDS_INCOMPLETE' &&
      item.path === 'frontend.publicAccess.policies[0].fields' && item.message.includes('title')));
  const config = defineOpenXiangdaApp(declaration());
  delete config.data.resources[0]!.surface;
  const compiled = compileApplicationSources(config);
  assert.equal(compiled.config.value.data.resources[0]!.surface?.fields.file?.requiredHint, undefined);
  assert.equal(nativeCompile(compiled).appCode, 'public-fields');
});

test('固定公开过滤条件可编译，并允许同一路由声明多条策略', () => {
  const input = declaration();
  input.frontend!.publicAccess!.policies = [
    {
      code: 'public-catalog',
      routeCode: 'apply',
      resourceCode: 'requests',
      mode: 'anonymous',
      operations: ['public.list', 'public.read'],
      fields: ['title'],
      publicRecordFields: ['title'],
      publicFilters: [{ field: 'title', operator: 'eq', value: 'published' }],
    },
    {
      code: 'public-catalog-secondary',
      routeCode: 'apply',
      resourceCode: 'requests',
      mode: 'anonymous',
      operations: ['public.read'],
      fields: ['title'],
      publicRecordFields: ['title'],
    },
  ];
  const compiled = compileApplicationSources(defineOpenXiangdaApp(input));
  assert.deepEqual(compiled.config.value.frontend.publicAccess?.policies, [
    {
      code: 'public-catalog',
      routeCode: 'apply',
      mode: 'anonymous',
      resourceCode: 'requests',
      operations: ['public.list', 'public.read'],
      fields: ['title'],
      publicRecordFields: ['title'],
      publicFilters: [{ field: 'title', operator: 'eq', value: 'published' }],
    },
    {
      code: 'public-catalog-secondary',
      routeCode: 'apply',
      mode: 'anonymous',
      resourceCode: 'requests',
      operations: ['public.read'],
      fields: ['title'],
      publicRecordFields: ['title'],
    },
  ]);
  assert.equal(nativeCompile(compiled).appCode, 'public-fields');
});

test('accepts camelCase field references in anonymous filters and schedule validation', () => {
  const base = declaration();
  const resource = base.data!.resources![0]!;
  const compiled = compileApplicationSources(defineOpenXiangdaApp({
    ...base,
    data: {
      resources: [{
        ...resource,
        fields: [
          ...resource.fields!,
          { code: 'campusId', label: 'Campus', type: 'text.short' },
          { code: 'visitDate', label: 'Date', type: 'date' },
          { code: 'visitTime', label: 'Time', type: 'time' },
          { code: 'qrToken', label: 'Token', type: 'text.short' },
        ],
      }],
    },
    frontend: {
      ...base.frontend,
      publicAccess: {
        policies: [
          {
            code: 'campus-public', routeCode: 'apply', mode: 'anonymous', resourceCode: 'requests',
            operations: ['public.list', 'public.read'],
            fields: ['campusId', 'visitDate', 'visitTime'],
            publicRecordFields: ['campusId', 'visitDate', 'visitTime'],
            publicFilters: [{ field: 'campusId', operator: 'eq', value: 'main' }],
          },
          {
            code: 'rule-public', routeCode: 'apply', mode: 'anonymous', resourceCode: 'requests',
            operations: ['public.read'],
            fields: ['campusId', 'visitDate', 'visitTime'],
            publicRecordFields: ['campusId', 'visitDate', 'visitTime'],
          },
          {
            code: 'reservation-public', routeCode: 'apply', mode: 'anonymous', resourceCode: 'requests',
            operations: ['draft.read', 'draft.update', 'create'],
            fields: ['campusId', 'visitDate', 'visitTime', 'title'],
            requiredFields: ['campusId', 'visitDate', 'visitTime', 'title'],
            serverGeneratedFields: [{ field: 'qrToken', kind: 'random-token' }],
            schedule: {
              campusPolicyCode: 'campus-public', rulePolicyCode: 'rule-public',
              campusField: 'campusId', ruleCampusField: 'campusId',
              ruleWeekdaysField: 'weekdays', ruleOpenAtField: 'openAt', ruleCloseAtField: 'closeAt',
              ruleSlotMinutesField: 'slotMinutes', ruleAdvanceHoursField: 'advanceHours',
              ruleAdvanceDaysField: 'advanceDays', campusEnabledField: 'enabled',
              ruleEnabledField: 'enabled', dateField: 'visitDate', timeField: 'visitTime',
            },
            draft: { enabled: true },
          },
        ],
      },
    },
  }));
  assert.equal(nativeCompile(compiled).appCode, 'public-fields');
});

test('公开过滤条件拒绝复杂值和不可过滤字段', () => {
  const input = declaration();
  input.frontend!.publicAccess!.policies[0] = {
    ...input.frontend!.publicAccess!.policies[0]!,
    operations: ['public.list', 'public.read'],
    fields: ['file'],
    publicRecordFields: ['file'],
    publicFilters: [{ field: 'file', operator: 'eq', value: true }],
  };
  assert.throws(() => defineOpenXiangdaApp(input), (error: any) =>
    error.diagnostics.some((item: any) =>
      item.code === 'APP_CONFIG_ANONYMOUS_PUBLIC_POLICY_INVALID' &&
      item.path === 'frontend.publicAccess.policies[0]'
    )
  );
});
