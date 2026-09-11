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
