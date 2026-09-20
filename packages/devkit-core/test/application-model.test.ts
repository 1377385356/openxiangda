import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileApplicationSources,
  defineApplicationModule,
  defineDataModel,
  defineOpenXiangdaApp,
  defineResourceForm,
  defineResourceList,
  resourceRoleCapabilities,
  suggestAdminNavigation,
  adminResourcePage,
  renderAdminNavigationSuggestion,
} from '../src/index.js';
import { projectDataResourceView } from 'openxiangda-contracts';
import { materializeApplicationModules } from '../src/compiler/application-model.js';

const record = defineDataModel({
  code: 'records', name: '记录',
  fields: [
    { code: 'title', label: '名称', type: 'text.short', required: true },
    { code: 'enabled', label: '启用', type: 'boolean' },
    { code: 'note', label: '说明', type: 'text.long' },
    { code: 'source_key', label: '来源标识', type: 'text.short', hidden: true },
  ],
});
const support = defineDataModel({
  code: 'support-records', name: '辅助记录',
  fields: [{ code: 'value', label: '值', type: 'text.short' }],
});
const application = (crud = false) => defineOpenXiangdaApp({
  app: { code: 'foundation-test', name: '平台能力验证' },
  frontend: { admin: { navigation: [] } },
  modules: [defineApplicationModule({
    code: 'records', models: [record, support],
    crud: crud ? [{
      model: record.code,
      sections: [{ title: '基本信息', fields: ['title', 'note'] }, { title: '使用设置', fields: ['enabled'] }],
      form: defineResourceForm(record, { fields: ['title', 'enabled'] }),
      detail: defineResourceForm(record, { fields: ['title', 'note'] }),
      list: defineResourceList(record, { fields: ['enabled', 'title'], filterFields: ['enabled'] }),
    }] : [],
  })],
  authz: { capabilities: [], roles: [
    { code: 'reader', name: '阅读成员', capabilities: resourceRoleCapabilities('foundation-test', 'records', 'read') },
    { code: 'editor', name: '管理成员', capabilities: resourceRoleCapabilities('foundation-test', 'records', 'manage') },
  ] },
});

test('models own storage without introducing pages, menus or a Nest process', () => {
  const config = application();
  assert.equal(config.backend.enabled, false);
  assert.equal(config.frontend.root, 'apps/web');
  assert.equal(config.data?.resources.length, 2);
  for (const model of config.data!.resources) {
    assert.deepEqual(model.surface?.generated, { list: false, detail: false, create: false, update: false, delete: false });
  }
  assert.deepEqual(suggestAdminNavigation(config), []);
  assert.doesNotThrow(() => compileApplicationSources(config));
});

test('selecting CRUD and form fields does not change storage or expose supporting models', () => {
  const plain = application();
  const crud = application(true);
  assert.deepEqual(crud.data?.resources.map(item => item.schema), plain.data?.resources.map(item => item.schema));
  const surface = crud.data!.resources[0].surface!;
  assert.deepEqual(surface.list?.fieldOrder, ['enabled', 'title']);
  assert.deepEqual(surface.form?.fieldOrder, ['title', 'enabled']);
  assert.deepEqual(surface.detail?.fieldOrder, ['title', 'note']);
  assert.equal(surface.form?.layout, 'sections');
  assert.equal(surface.fields.title.section, '基本信息');
  assert.equal(surface.fields.enabled.section, '使用设置');
  assert.equal(surface.fields.note.section, '基本信息');
  assert.equal(surface.fields.source_key.hidden, true);
  assert.equal(surface.fields.source_key.list, false);
  assert.deepEqual(surface.fields.source_key.createCapabilities, ['app:foundation-test:data:records:create']);
  assert.equal(crud.data!.resources[1].surface?.generated?.list, false);
  assert.deepEqual(suggestAdminNavigation(crud).flatMap(group => group.items.map(item => item.page)), [
    { kind: 'resource', resourceCode: 'records' },
  ]);
  const compiled = compileApplicationSources(crud);
  assert.equal(compiled.config.value.data.resources[0].surface?.fields.source_key.hidden, true);
  assert.deepEqual(compiled.config.value.data.resources[0].surface?.list?.fieldOrder, ['enabled', 'title']);
  assert.equal(compiled.config.value.data.resources[0].surface?.fields.title.section, '基本信息');
});

test('default and named forms project independent draft-only state schemas deterministically', () => {
  const defaultDraftState = {
    version: 2,
    maxBytes: 4096,
    fields: {
      zeta: { type: 'boolean' as const },
      mode: { type: 'string' as const, maxLength: 32, enum: ['template', 'custom'] },
    },
  };
  const namedDraftState = {
    version: 4,
    maxBytes: 8192,
    fields: {
      variables: { type: 'json.object' as const, maxBytes: 4096 },
    },
  };
  const config = defineOpenXiangdaApp({
    app: { code: 'foundation-test', name: '平台能力验证' },
    frontend: { admin: { navigation: [] } },
    modules: [{ code: 'records', models: [record], crud: [
      { model: 'records', form: defineResourceForm(record, { fields: ['title'], draftState: defaultDraftState }) },
      { model: 'records', code: 'quick', name: '快速起草', form: defineResourceForm(record, { fields: ['title'], draftState: namedDraftState }) },
    ] }],
  });
  const source = config.data!.resources[0];
  assert.deepEqual(source.surface?.form?.draftState, defaultDraftState);
  assert.deepEqual(source.surface?.views?.[0]?.form.draftState, namedDraftState);
  assert.deepEqual(source.schema.fields.map(field => field.code), [
    'title',
    'enabled',
    'note',
    'source_key',
  ]);
  const compiled = compileApplicationSources(config).config.value.data.resources[0];
  assert.deepEqual(Object.keys(compiled.surface!.form!.draftState!.fields), ['mode', 'zeta']);
  assert.deepEqual(compiled.surface!.form!.draftState!.fields.mode.enum, ['custom', 'template']);
  assert.deepEqual(compiled.surface!.views![0].form.draftState, namedDraftState);
  assert.equal(compiled.schema.fields.some(field => field.code === 'mode'), false);
});

test('draft-only state schema errors fail at declaration compile time', () => {
  const build = (draftState: any) => defineOpenXiangdaApp({
    app: { code: 'foundation-test', name: '验证' }, frontend: {},
    modules: [{ code: 'records', models: [record], crud: [{ model: 'records', form: { model: 'records', fields: ['title'], draftState } }] }],
  });
  for (const draftState of [
    { version: 0, maxBytes: 64, fields: { mode: { type: 'boolean' } } },
    { version: 1, maxBytes: 64, fields: { mode: { type: 'string', maxLength: 0 } } },
    { version: 1, maxBytes: 64, fields: { mode: { type: 'json.object', maxBytes: 65 } } },
    { version: 1, maxBytes: 64, fields: { mode: { type: 'boolean', extra: true } } },
  ]) assert.throws(() => compileApplicationSources(build(draftState)));
});

test('read and manage grants remain explicit regardless of page generation', () => {
  for (const config of [application(), application(true)]) {
    assert.deepEqual(config.authz?.roles[0].capabilities, ['app:foundation-test:data:records:read']);
    assert.deepEqual(config.authz?.roles[1].capabilities, [
      'app:foundation-test:data:records:create', 'app:foundation-test:data:records:delete',
      'app:foundation-test:data:records:read', 'app:foundation-test:data:records:update',
    ]);
  }
});

test('invalid view references fail before a user can encounter a broken form', () => {
  const compile = (fields: string[]) => defineOpenXiangdaApp({
    app: { code: 'foundation-test', name: '平台能力验证' },
    frontend: { admin: { navigation: [] } },
    modules: [{ code: 'records', models: [record], crud: [{ model: 'records', form: defineResourceForm(record, { fields }) }] }],
  });
  for (const fields of [['missing'], ['title', 'title'], ['title', 'source_key']]) {
    assert.throws(() => compile(fields), error => Boolean((error as any).diagnostics?.some((item: any) => item.code === 'APP_VIEW_FIELD_INVALID')));
  }
  assert.throws(() => compile(['enabled']), error => Boolean((error as any).diagnostics?.some((item: any) => item.code === 'APP_CONFIG_DATA_FORM_REQUIRED_FIELD_MISSING')));
});


test('explicit columns are not truncated and non-sortable columns do not create an invalid sort', () => {
  const model = defineDataModel({ code: 'wide-records', name: '记录', fields: [
    { code: 'payload', label: '附加信息', type: 'json' },
    ...Array.from({ length: 10 }, (_, index) => ({ code: `field_${index}`, label: `字段 ${index}`, type: 'text.short' as const })),
  ] });
  const order = model.fields.map(field => field.code).reverse();
  const config = defineOpenXiangdaApp({ app: { code: 'foundation-test', name: '验证' }, frontend: {},
    modules: [{ code: 'records', models: [model], crud: [{ model: model.code, list: defineResourceList(model, { fields: order }) }] }],
  });
  assert.deepEqual(config.data!.resources[0].surface?.list?.fieldOrder, order);
  assert.doesNotThrow(() => compileApplicationSources(config));
  const onlyJson = defineOpenXiangdaApp({ app: { code: 'foundation-test', name: '验证' }, frontend: {},
    modules: [{ code: 'records', models: [{ ...model, fields: model.fields.slice(0, 1) }], crud: [{ model: model.code }] }],
  });
  assert.equal(onlyJson.data!.resources[0].surface?.list?.defaultSort, undefined);
  assert.doesNotThrow(() => compileApplicationSources(onlyJson));
});

test('named views share one model and authorization while generating independent pages and menu references', () => {
  const config = defineOpenXiangdaApp({
    app: { code: 'foundation-test', name: '平台能力验证' },
    frontend: { admin: { navigation: [{ code: 'records', label: '记录', items: [
      adminResourcePage('records', { viewCode: 'quick' }),
      adminResourcePage('records', { viewCode: 'complete' }),
    ] }] } },
    modules: [{ code: 'records', models: [record], crud: [
      { model: 'records', code: 'quick', name: '简要登记',
        list: defineResourceList(record, { fields: ['title'] }),
        form: defineResourceForm(record, { fields: ['title'] }),
        detail: defineResourceForm(record, { fields: ['title'] }),
        sections: [{ title: '登记信息', fields: ['title'] }], generated: { delete: false } },
      { model: 'records', code: 'complete', name: '完整管理',
        list: defineResourceList(record, { fields: ['enabled', 'title', 'note'] }),
        sections: [{ title: '基础信息', fields: ['title', 'note'] }, { title: '管理设置', fields: ['enabled'] }] },
    ] }],
    authz: { capabilities: [], roles: [{ code: 'editor', name: '管理成员', capabilities: resourceRoleCapabilities('foundation-test', 'records', 'manage') }] },
  });
  assert.equal(config.data!.resources.length, 1);
  assert.deepEqual(config.data!.resources[0].schema, application().data!.resources[0].schema);
  const compiled = compileApplicationSources(config);
  const resource = compiled.config.value.data.resources[0];
  assert.equal(resource.surface!.views!.length, 2);
  assert.deepEqual(resource.capabilities, compileApplicationSources(application()).config.value.data.resources[0].capabilities);
  const pages = compiled.contracts.value.adminPages!;
  assert.equal(pages.length, 8);
  assert.equal(pages.some(page => !page.viewCode), false);
  assert.equal(pages.find(page => page.code === 'resource:records:view:quick:create')?.path, '/admin/resources/records/views/quick/new');
  assert.equal(pages.find(page => page.code === 'resource:records:view:complete:list')?.label, '完整管理');
  const quick = projectDataResourceView(resource.surface!, 'quick');
  assert.deepEqual(quick.form?.fieldOrder, ['title']);
  assert.equal(quick.fields.title.section, '登记信息');
  assert.equal(quick.fields.note.section, undefined);
  assert.equal(quick.fields.source_key.hidden, true);
  assert.deepEqual(quick.fields.title.createCapabilities, resource.surface!.fields.title.createCapabilities);
  assert.deepEqual(suggestAdminNavigation(config)[0].items.map(item => item.page), [
    { kind: 'resource', resourceCode: 'records', viewCode: 'complete' },
    { kind: 'resource', resourceCode: 'records', viewCode: 'quick' },
  ]);
  assert.match(renderAdminNavigationSuggestion(config).expression, /viewCode: "quick"/);
  assert.throws(() => projectDataResourceView(resource.surface!, 'missing'), /DATA_RESOURCE_VIEW_NOT_FOUND/);
});

test('invalid named views fail before generating incomplete create pages or ambiguous routes', () => {
  const build = (crud: any[], navigation: any[] = [], routes: any[] = []) => defineOpenXiangdaApp({
    app: { code: 'foundation-test', name: '平台能力验证' },
    frontend: { admin: { navigation }, routes },
    modules: [{ code: 'records', models: [record], crud }],
  });
  const view = { model: 'records', code: 'quick', name: '简要登记' };
  for (const invalid of [
    [view, view], [{ ...view, code: '../quick' }], [{ ...view, name: '' }],
    [{ ...view, form: defineResourceForm(record, { fields: ['enabled'] }) }],
    [{ ...view, form: defineResourceForm(record, { fields: ['title', 'source_key'] }) }],
    Array.from({ length: 21 }, (_, index) => ({ ...view, code: `view-${index}` })),
  ]) assert.throws(() => build(invalid));
  assert.throws(() => build([view], [{ code: 'records', label: '记录', items: [adminResourcePage('records')] }]));
  assert.throws(() => build([view], [{ code: 'records', label: '记录', items: [adminResourcePage('records', { viewCode: 'missing' })] }]));
  assert.throws(() => build([view], [], [{ code: 'duplicate-page', path: '/admin/resources/records/views/quick', label: '重复页面', surface: 'admin' }]));
  assert.doesNotThrow(() => compileApplicationSources(build([{ ...view, generated: { create: false },
    form: defineResourceForm(record, { fields: ['enabled'] }), mobile: { enabled: false } }])));
});

test('named create selection distinguishes writable required fields from optional arrays and denied fields', () => {
  const build = (selected: string[]) => defineOpenXiangdaApp({
    app: { code: 'foundation-test', name: '平台能力验证' }, frontend: {},
    modules: [{ code: 'records', models: [{ code: 'records', name: '记录', fields: [
      { code: 'identifier', label: '标识', type: 'uuid', required: true },
      { code: 'labels', label: '分类', type: 'option.multiple', options: [{ label: 'A', value: 'a' }] },
      { code: 'internal', label: '内部赋值', type: 'text.short', required: true, access: { create: false } },
    ] }], crud: [{ model: 'records', code: 'quick', name: '简要登记', form: { model: 'records', fields: selected } }] }],
  });
  assert.doesNotThrow(() => compileApplicationSources(build(['identifier'])));
  assert.throws(() => build(['labels']));
});

test('crud 视图的 list/form 缺省 model 时继承视图模型', () => {
  const config = defineOpenXiangdaApp({
    app: { code: 'model-inherit-test', name: '模型继承' },
    frontend: { admin: { navigation: [] } },
    modules: [defineApplicationModule({
      code: 'main', models: [record],
      crud: [{
        model: record.code,
        list: { fields: ['title'] },
        form: { layout: 'flat' },
      }],
    })],
  });
  assert.doesNotThrow(() => compileApplicationSources(config));
});

test('crud 视图显式声明不一致 model 仍然拒绝', () => {
  assert.throws(
    () => defineOpenXiangdaApp({
      app: { code: 'model-mismatch-test', name: '模型不一致' },
      frontend: { admin: { navigation: [] } },
      modules: [defineApplicationModule({
        code: 'main', models: [record],
        crud: [{ model: record.code, list: { model: 'other', fields: ['title'] } }],
      })],
    }),
    /列表\/表单绑定的 model 必须与 CRUD 视图一致/
  );
});

test('user surface 生成我的记录与提交标准页并接线首页', () => {
  const config = defineOpenXiangdaApp({
    app: { code: 'user-surface-app', name: '用户面' },
    frontend: {
      admin: { navigation: [] },
      routes: [
        { code: 'application-home', path: '/home', label: '应用首页', surface: 'user' },
        { code: 'application-home-mobile', path: '/m/home', label: '移动首页', surface: 'user' },
      ],
      authentication: {
        accountMode: 'existing-platform-users-only',
        registration: { mode: 'reject' },
        methods: [{ code: 'password', type: 'password', label: '登录', presentation: 'primary' as const, required: true }],
        surfaces: {
          desktop: { routeCode: 'application-login', path: '/login', defaultRouteCode: 'application-home' },
          mobile: { routeCode: 'application-login-mobile', path: '/m/login', defaultRouteCode: 'application-home-mobile' },
        },
      },
    },
    modules: [defineApplicationModule({
      code: 'main',
      models: [{ code: 'requests', name: '申请', fields: [{ code: 'title', type: 'text.short', label: '标题', required: true }] }],
      crud: [{ model: 'requests', user: true }],
    })],
  });
  const resources = (config as any).data.resources as Array<{ code: string; userSurface?: unknown }>;
  assert.ok(resources.find(item => item.code === 'requests')?.userSurface, 'userSurface 物化到资源');
  const surfaces = (config as any).frontend.authentication.surfaces;
  assert.equal(surfaces.desktop.defaultRouteCode, 'user.requests.records');
  assert.equal(surfaces.mobile.defaultRouteCode, 'user.requests.records');
  const sources = compileApplicationSources(config);
  const manifest = sources.contracts.value.routeManifest;
  const records = manifest.routes.find(route => route.code === 'user.requests.records');
  const submit = manifest.routes.find(route => route.code === 'user.requests.submit');
  assert.equal(records?.kind, 'resource-records');
  assert.equal(records?.resourceCode, 'requests');
  assert.equal(records?.desktop.path, '/my/requests');
  assert.equal(records?.mobile.path, '/m/my/requests');
  assert.equal(records?.desktop.capability, 'app:user-surface-app:data:requests:read');
  assert.equal(submit?.kind, 'resource-submit');
  assert.equal(submit?.desktop.capability, 'app:user-surface-app:data:requests:create');
  assert.equal(manifest.rootEntry.code, 'user.requests.records');
  assert.equal(manifest.rootEntry.desktop, '/my/requests');
});

test('未启用 user 面时不生成资源用户路由', () => {
  const config = defineOpenXiangdaApp({
    app: { code: 'no-user-surface-app', name: '无用户面' },
    frontend: {
      admin: { navigation: [] },
      routes: [
        { code: 'application-home', path: '/home', label: '应用首页', surface: 'user' },
        { code: 'application-home-mobile', path: '/m/home', label: '移动首页', surface: 'user' },
      ],
      authentication: {
        accountMode: 'existing-platform-users-only',
        registration: { mode: 'reject' },
        methods: [{ code: 'password', type: 'password', label: '登录', presentation: 'primary' as const, required: true }],
        surfaces: {
          desktop: { routeCode: 'application-login', path: '/login', defaultRouteCode: 'application-home' },
          mobile: { routeCode: 'application-login-mobile', path: '/m/login', defaultRouteCode: 'application-home-mobile' },
        },
      },
    },
    modules: [defineApplicationModule({
      code: 'main',
      models: [{ code: 'requests', name: '申请', fields: [{ code: 'title', type: 'text.short', label: '标题', required: true }] }],
    })],
  });
  const surfaces = (config as any).frontend.authentication.surfaces;
  assert.equal(surfaces.desktop.defaultRouteCode, 'application-home');
  const sources = compileApplicationSources(config);
  assert.equal(sources.contracts.value.routeManifest.routes.filter(route => String(route.kind).startsWith('resource-')).length, 0);
});

test('user 声明通过共享编译器的本地完整配置校验', async () => {
  const { compileLocalConfiguration } = await import('../src/configuration-preflight.js');
  const config = defineOpenXiangdaApp({
    app: { code: 'user-surface-test', name: '用户面' },
    frontend: {
      admin: { navigation: [] },
      routes: [
        { code: 'application-home', path: '/home', label: '应用首页', surface: 'user' },
        { code: 'application-home-mobile', path: '/m/home', label: '移动首页', surface: 'user' },
      ],
      authentication: {
        accountMode: 'existing-platform-users-only',
        registration: { mode: 'reject' },
        methods: [{ code: 'password', type: 'password', label: '登录', presentation: 'primary' as const, required: true }],
        surfaces: {
          desktop: { routeCode: 'application-login', path: '/login', defaultRouteCode: 'application-home' },
          mobile: { routeCode: 'application-login-mobile', path: '/m/login', defaultRouteCode: 'application-home-mobile' },
        },
      },
    },
    modules: [defineApplicationModule({
      code: 'main',
      models: [{ code: 'requests', name: '申请', fields: [{ code: 'title', type: 'text.short', label: '标题', required: true }] }],
      crud: [{ model: 'requests', user: true }],
    })],
  });
  const local = compileLocalConfiguration(config, '2.17.0');
  assert.ok(local.compiled, '共享编译器闭合通过，不再抛 NativeConfigurationCompilerError');
});

test('GAP-MODULE-001：列表视图 sortableFields 表达非默认排序能力', () => {
  const venue = defineDataModel({
    code: 'venues', name: '场地档案',
    fields: [
      { code: 'name', type: 'text.short', label: '场地名称', required: true },
      { code: 'capacity', type: 'number.integer', label: '可容纳人数', required: true },
    ],
  });
  const config = defineOpenXiangdaApp({
    app: { code: 'sortable-test', name: '排序' },
    frontend: { admin: { navigation: [] } },
    modules: [defineApplicationModule({
      code: 'venue',
      models: [venue],
      crud: [{
        model: 'venues',
        list: {
          model: 'venues',
          fields: ['name', 'capacity'],
          filterFields: ['capacity'],
          searchableFields: ['name'],
          sortableFields: ['capacity'],
          defaultPageSize: 20,
          defaultSort: { field: 'name', order: 'asc' },
        },
      }],
    })],
  });
  // 按 gap 文档验收：断言在 materializeApplicationModules 投影层（声明级字段）。
  const projected = materializeApplicationModules([defineApplicationModule({
    code: 'venue',
    models: [venue],
    crud: [{
      model: 'venues',
      list: {
        model: 'venues',
        fields: ['name', 'capacity'],
        filterFields: ['capacity'],
        searchableFields: ['name'],
        sortableFields: ['capacity'],
        defaultPageSize: 20,
        defaultSort: { field: 'name', order: 'asc' },
      },
    }],
  })]);
  assert.equal(projected.diagnostics.length, 0);
  const capacity = projected.resources[0].fields.find(field => field.code === 'capacity');
  assert.equal(capacity?.sortable, true, 'sortableFields 中的字段可排序');
  const name = projected.resources[0].fields.find(field => field.code === 'name');
  assert.equal(name?.sortable, true, 'defaultSort.field 保持隐式可排序');
  // defaultSort 字段重复出现在 sortableFields 中容忍不报错
  assert.doesNotThrow(() => defineOpenXiangdaApp({
    app: { code: 'sortable-test-2', name: '排序' },
    frontend: { admin: { navigation: [] } },
    modules: [defineApplicationModule({
      code: 'venue',
      models: [venue],
      crud: [{ model: 'venues', list: { model: 'venues', sortableFields: ['name', 'capacity'] } }],
    })],
  }));
  // 未声明字段报错（与 filterFields 对齐）
  assert.throws(() => defineOpenXiangdaApp({
    app: { code: 'sortable-test-3', name: '排序' },
    frontend: { admin: { navigation: [] } },
    modules: [defineApplicationModule({
      code: 'venue',
      models: [venue],
      crud: [{ model: 'venues', list: { model: 'venues', sortableFields: ['ghost'] } }],
    })],
  }));
});

test('GAP-MODULE-002：模型声明 detailRouteCode 透传资源，未知属性 fail-closed', () => {
  const reservation = defineDataModel({
    code: 'venue-reservations', name: '场地预约',
    // 复现 gap 场景：资源级详情路由在模块化声明上表达（Workflow 详情接管的资源侧声明）。
    detailRouteCode: { desktop: 'reservation-detail', mobile: 'reservation-detail-mobile' },
    fields: [{ code: 'title', type: 'text.short', label: '主题', required: true }],
  });

  // 验收 1：投影层完整透传且 diagnostics 为空（修复前该属性被静默丢弃）。
  const projected = materializeApplicationModules([defineApplicationModule({
    code: 'venue-detail-probe', models: [reservation],
  })]);
  assert.deepEqual(projected.diagnostics, []);
  assert.deepEqual(projected.resources[0].detailRouteCode, {
    desktop: 'reservation-detail', mobile: 'reservation-detail-mobile',
  });

  // 验收 3：端到端编译后资源与 Workflow 消费的 detailRouteCode 路由绑定不变。
  const config = defineOpenXiangdaApp({
    app: { code: 'venue-app', name: '场馆' },
    frontend: {
      admin: { navigation: [] },
      routes: [
        {
          code: 'reservation-detail',
          path: '/reservations/:instanceId',
          label: '预约详情', surface: 'user',
          capability: 'app:venue-app:data:venue-reservations:read',
        },
        {
          code: 'reservation-detail-mobile',
          path: '/m/reservations/:instanceId',
          label: '预约详情（移动）', surface: 'user',
          capability: 'app:venue-app:data:venue-reservations:read',
        },
      ],
    },
    modules: [defineApplicationModule({ code: 'venue', models: [reservation] })],
  });
  assert.deepEqual(config.data?.resources[0]?.detailRouteCode, {
    desktop: 'reservation-detail', mobile: 'reservation-detail-mobile',
  });

  // 验收 2：模型声明上的未知属性不再静默丢弃，投影报指向性错误并使编译失败。
  const typoModules = [defineApplicationModule({
    code: 'venue-detail-probe',
    models: [{ ...reservation, detailRouteCodes: { desktop: 'a', mobile: 'b' } } as any],
  })];
  const typoProjection = materializeApplicationModules(typoModules);
  assert.equal(typoProjection.diagnostics.length, 1);
  assert.equal(typoProjection.diagnostics[0].code, 'APP_MODEL_KEY_UNKNOWN');
  assert.equal(typoProjection.diagnostics[0].severity, 'error');
  assert.equal(typoProjection.diagnostics[0].path, 'modules[0].models[0].detailRouteCodes');
  assert.throws(
    () => defineOpenXiangdaApp({
      app: { code: 'venue-app-typo', name: '场馆' },
      frontend: { admin: { navigation: [] } },
      modules: typoModules,
    }),
    (error: any) => error?.code === 'OPENXIANGDA_APP_CONFIG_INVALID'
      && error.diagnostics?.some((item: any) => item.code === 'APP_MODEL_KEY_UNKNOWN'),
  );
});

// GAP-MODULE-003：system 字段（服务端赋值）可进入查询/分组类选择；展示与可写选择仍拒绝。
const snapshotModel = defineDataModel({
  code: 'welfare-selections', name: '福利领取',
  fields: [
    { code: 'title', label: '福利名称', type: 'text.short', required: true },
    { code: 'campaignId', label: '所属活动', type: 'uuid', required: true, system: true },
    { code: 'memberUserId', label: '领取会员', type: 'uuid', required: true, system: true },
    { code: 'campaignName', label: '活动名称快照', type: 'text.short', system: true },
    { code: 'internal_key', label: '内部键', type: 'text.short', hidden: true },
  ],
});

const welfareModule = defineApplicationModule({
  code: 'welfare', models: [snapshotModel],
  crud: [{
    model: snapshotModel.code,
    sections: [{ title: '归属快照', fields: ['campaignId', 'memberUserId'] }],
    list: defineResourceList(snapshotModel, {
      fields: ['title'],
      filterFields: ['campaignId', 'memberUserId'],
      searchableFields: ['campaignName'],
      sortableFields: ['memberUserId'],
      defaultSort: { field: 'memberUserId', order: 'desc' },
    }),
  }],
});

test('system fields compile in query and grouping selections and project their capabilities', () => {
  const { resources } = materializeApplicationModules([welfareModule]);
  const fields = Object.fromEntries((resources[0].fields as any[]).map(field => [field.code, field]));
  assert.equal(fields.campaignId.filter, true);
  assert.equal(fields.campaignName.searchable, true);
  assert.equal(fields.memberUserId.sortable, true);
  assert.equal(fields.memberUserId.section, '归属快照');
  assert.equal(fields.campaignId.list, false);
});

test('system fields stay rejected in display and writable selections, hidden everywhere', () => {
  const compile = (listFields: string[], formFields: string[]) => defineOpenXiangdaApp({
    app: { code: 'foundation-test', name: '平台能力验证' },
    frontend: { admin: { navigation: [] } },
    modules: [defineApplicationModule({
      code: 'welfare', models: [snapshotModel],
      crud: [{
        model: snapshotModel.code,
        list: defineResourceList(snapshotModel, { fields: listFields, filterFields: ['campaignId'] }),
        form: defineResourceForm(snapshotModel, { fields: formFields }),
      }],
    })],
    authz: { capabilities: [], roles: [] },
  });
  for (const [listFields, formFields] of [
    [['title', 'campaignId'], ['title']],
    [['title'], ['title', 'campaignId']],
  ] as const) {
    assert.throws(() => compile([...listFields], [...formFields]), error =>
      Boolean((error as any).diagnostics?.some((item: any) => item.code === 'APP_VIEW_FIELD_INVALID')));
  }
  assert.throws(() => defineOpenXiangdaApp({
    app: { code: 'foundation-test', name: '平台能力验证' },
    frontend: { admin: { navigation: [] } },
    modules: [defineApplicationModule({
      code: 'welfare', models: [snapshotModel],
      crud: [{ model: snapshotModel.code, list: defineResourceList(snapshotModel, { fields: ['title'], filterFields: ['internal_key'] }) }],
    })],
    authz: { capabilities: [], roles: [] },
  }), error => Boolean((error as any).diagnostics?.some((item: any) => item.code === 'APP_VIEW_FIELD_INVALID')));
});

test('platform audit columns are valid modular list sort selections', () => {
  const auditModule = defineApplicationModule({
    code: 'records', models: [record],
    crud: [{
      model: record.code,
      list: defineResourceList(record, {
        fields: ['title'],
        sortableFields: ['updated_at'],
        defaultSort: { field: 'created_at', order: 'desc' },
      }),
    }],
  });
  const projected = materializeApplicationModules([auditModule]);
  assert.equal(
    projected.diagnostics.some(item => item.code === 'APP_VIEW_FIELD_INVALID'),
    false
  );
  assert.deepEqual(projected.resources[0]!.list?.defaultSort, { field: 'created_at', order: 'desc' });
  assert.doesNotThrow(() => compileApplicationSources(defineOpenXiangdaApp({
    app: { code: 'foundation-test', name: '平台能力验证' },
    frontend: { admin: { navigation: [] } },
    modules: [auditModule],
    authz: { capabilities: [], roles: [] },
  })));

  const typo = materializeApplicationModules([defineApplicationModule({
    code: 'records', models: [record],
    crud: [{
      model: record.code,
      list: defineResourceList(record, { fields: ['title'], defaultSort: { field: 'nope' } }),
    }],
  })]);
  assert.equal(
    typo.diagnostics.some(item => item.code === 'APP_VIEW_FIELD_INVALID'),
    true
  );
});
