import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalJson,
  SCHEMA_VERSIONS,
  sha256Digest,
} from 'openxiangda-contracts';
import {
  adminApplicationTodoCenterPage,
  adminNavigationGroup,
  adminOperationPage,
  adminResourcePage,
  compileApplicationSources,
  compileAppPackage,
  currentUserDataPolicy,
  dataPolicyExpression,
  defineAdminNavigation,
  defineOpenXiangdaApp,
  NATIVE_GOLDEN_CRUD_CAPABILITY,
  type OpenXiangdaAppDeclaration,
  requiredPlatformCapabilities,
  renderAdminNavigationSuggestion,
  resourceReadPolicy,
  resourceRoleCapabilities,
  suggestAdminNavigation,
  validateAppConfig,
} from '../src/index.js';

function diagnosticOf(error: unknown, code: string, path: string) {
  return Boolean(
    (error as { diagnostics?: Array<{ code: string; path?: string }> })
      .diagnostics?.some(item => item.code === code && item.path === path)
  );
}

const sourceDeclaration: OpenXiangdaAppDeclaration = {
  schemaVersion: 3,
  app: { code: 'reference-app', name: 'Reference App' },
  frontend: { root: 'apps/web' },
  backend: { root: 'apps/server', runtime: 'node', framework: 'nestjs' },
  platform: { root: 'platform' },
  authz: {
    capabilities: [],
    roles: [
      {
        code: 'instrument_admin',
        name: 'Instrument administrator',
        capabilities: resourceRoleCapabilities('reference-app', 'instruments', 'manage'),
      },
    ],
    scopeDimensions: [
      {
        code: 'college',
        name: 'College',
        valueType: 'uuid',
        hierarchyMode: 'flat',
        valueSource: {
          kind: 'native_resource',
          resourceCode: 'colleges',
          labelField: 'name',
          enabledField: 'enabled',
        },
      },
    ],
    scopeSources: [
      {
        code: 'college_memberships',
        name: 'College role memberships',
        resourceCode: 'college-memberships',
        subject: {
          type: 'role_membership',
          userIdField: 'user_id.value',
          roleCode: 'instrument_admin',
        },
        grants: [{ dimensionCode: 'college', valueField: 'college_id.value' }],
        enabledField: 'enabled',
        failureMode: 'strict',
      },
    ],
    roleMembershipSources: [
      {
        code: 'instrument-role-members',
        name: 'Instrument role members',
        resourceCode: 'college-memberships',
        userIdField: 'user_id.value',
        roleCode: 'instrument_admin',
        enabledField: 'enabled',
        failureMode: 'strict',
      },
    ],
    relationshipGrantSources: [
      {
        code: 'college-resource-members',
        name: 'College resource members',
        resourceCode: 'college-memberships',
        subject: { type: 'user', userIdField: 'user_id.value' },
        relationCode: 'member',
        targetResourceCode: 'colleges',
        resourceIdField: 'college_id.value',
        operations: ['read', 'update'],
        enabledField: 'enabled',
        failureMode: 'strict',
      },
    ],
    dataPolicies: [
      {
        code: 'instrument_access',
        name: 'Instrument access',
        resourceCode: 'instruments',
        matchMode: 'OR',
        rules: [
          {
            subject: 'current_user',
            field: 'owner',
            roleCodes: ['instrument_admin'],
          },
          {
            dimensionCode: 'college',
            field: 'college_id',
            valuePath: 'value',
            roleCodes: ['instrument_admin'],
          },
        ],
      },
    ],
  },
  data: {
    resources: [
      {
        code: 'instruments',
        name: 'Instruments',
        fields: [
          {
            code: 'name',
            type: 'text.short',
            label: 'Instrument name',
            required: true,
            searchable: true,
            list: true,
          },
          {
            code: 'owner',
            type: 'user.single',
            label: 'Creator',
            required: true,
            list: false,
          },
          {
            code: 'college_id',
            type: 'resource-ref.single',
            label: 'College',
            required: true,
            list: false,
            source: {
              kind: 'resource',
              resourceCode: 'colleges',
              labelField: 'name',
            },
          },
        ],
        dataPolicyCode: 'instrument_access',
        list: { defaultPageSize: 20, defaultSort: { field: 'name', order: 'asc' } },
      },
      {
        code: 'colleges',
        name: 'Colleges',
        fields: [
          { code: 'name', type: 'text.short', label: 'College name', required: true },
          { code: 'enabled', type: 'boolean', label: 'Enabled', required: true },
        ],
      },
      {
        code: 'college-memberships',
        name: 'College role memberships',
        fields: [
          { code: 'user_id', type: 'user.single', label: 'User', required: true },
          {
            code: 'college_id',
            type: 'resource-ref.single',
            label: 'College',
            required: true,
            source: {
              kind: 'resource',
              resourceCode: 'colleges',
              labelField: 'name',
            },
          },
          { code: 'enabled', type: 'boolean', label: 'Enabled', required: true },
        ],
      },
    ],
  },
};
const source = defineOpenXiangdaApp(sourceDeclaration);
const sharedFieldCapability =
  'app:reference-app:instrument:protected-update';

test('grants Native CRUD through an explicit management preset and honors explicit denials', () => {
  assert.deepEqual(source.authz?.roles[0]?.capabilities, [
    'app:reference-app:data:instruments:create',
    'app:reference-app:data:instruments:delete',
    'app:reference-app:data:instruments:read',
    'app:reference-app:data:instruments:update',
  ]);

  const restricted = defineOpenXiangdaApp({
    ...sourceDeclaration,
    authz: {
      ...sourceDeclaration.authz,
      roles: [
        {
          code: 'instrument_admin',
          name: 'Instrument administrator',
          capabilities: resourceRoleCapabilities('reference-app', 'instruments', 'manage'),
          deniedCapabilities: [
            'app:reference-app:data:instruments:delete',
          ],
        },
      ],
    },
  });

  assert.deepEqual(restricted.authz?.roles[0]?.capabilities, [
    'app:reference-app:data:instruments:create',
    'app:reference-app:data:instruments:read',
    'app:reference-app:data:instruments:update',
  ]);
  assert.equal(
    'deniedCapabilities' in (restricted.authz?.roles[0] || {}),
    false,
  );
});

test('rejects an unknown explicit role denial with a stable pointer', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        authz: {
          ...sourceDeclaration.authz,
          roles: [
            {
              ...sourceDeclaration.authz!.roles[0]!,
              deniedCapabilities: ['app:reference-app:data:unknown:delete'],
            },
          ],
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_CAPABILITY_CLOSURE_FAILED',
        'authz.roles[0].deniedCapabilities[0]',
      ),
  );
});

test('suggests a deterministic editable initial navigation without making it compiler-owned', () => {
  const suggestion = suggestAdminNavigation(source);
  assert.deepEqual(
    suggestion.map(group => ({
      code: group.code,
      pages: group.items.map(item => item.page),
    })),
    [
      {
        code: 'data-management',
        pages: [
          { kind: 'resource', resourceCode: 'college-memberships' },
          { kind: 'resource', resourceCode: 'colleges' },
          { kind: 'resource', resourceCode: 'instruments' },
        ],
      },
    ]
  );
  const authoring = renderAdminNavigationSuggestion(source);
  assert.deepEqual(authoring.imports, [
    'adminNavigationGroup',
    'adminResourcePage',
    'defineAdminNavigation',
  ]);
  assert.equal(authoring.module, 'openxiangda/config');
  assert.equal(authoring.groupCount, 1);
  assert.equal(authoring.itemCount, 3);
  assert.deepEqual(authoring.proposal, suggestion);
  assert.match(authoring.expression, /^defineAdminNavigation\(\[/);
  assert.match(
    authoring.expression,
    /adminResourcePage\("instruments", \{ label: "Instruments" \}\)/
  );
  const helpers = {
    adminNavigationGroup,
    adminResourcePage,
    defineAdminNavigation,
  };
  const execute = new Function(
    ...authoring.imports,
    `return (${authoring.expression});`
  );
  assert.deepEqual(
    execute(
      ...authoring.imports.map(
        name => helpers[name as keyof typeof helpers]
      )
    ),
    suggestion
  );
  assert.deepEqual(renderAdminNavigationSuggestion(source), authoring);
});

test('compiles an explicit admin page registry and never appends undeclared resources to navigation', () => {
  const configured = defineOpenXiangdaApp({
    ...sourceDeclaration,
    frontend: {
      root: 'apps/web',
      user: { applicationTodoCenter: true },
      routes: [
        {
          code: 'instrument-import',
          path: '/admin/operations/instrument-import',
          label: '仪器导入',
          surface: 'admin',
        },
      ],
      admin: {
        access: {
          anyOf: [
            'app:reference-app:data:instruments:update',
            'app:reference-app:data:instruments:read',
          ],
        },
        navigation: defineAdminNavigation([
          adminNavigationGroup(
            'instruments',
            '仪器管理',
            [
              adminResourcePage('instruments'),
              adminOperationPage('instrument-import'),
            ],
            { icon: 'database' }
          ),
        ]),
      },
    },
  });
  const compiled = compileApplicationSources(configured);
  assert.deepEqual(
    compiled.contracts.value.adminNavigation[0]?.items.map(item => item.pageCode),
    ['resource:instruments:list', 'operation:instrument-import']
  );
  assert.deepEqual(
    compiled.contracts.value.adminAccess,
    {
      anyOf: [
        'app:reference-app:data:instruments:read',
        'app:reference-app:data:instruments:update',
      ],
    }
  );
  assert.equal(
    compiled.config.value.frontend.user.applicationTodoCenter,
    true
  );
  assert.equal(
    compiled.contracts.value.adminPages.some(
      page => page.code === 'application:todo-center'
    ),
    false
  );
  const todoManifest = compiled.contracts.value.routeManifest.routes.find(
    route => route.code === 'application:todo-center'
  );
  assert.deepEqual(todoManifest?.desktop, {
    routeCode: 'application.todo-center.desktop',
    path: '/todos',
    surface: 'user',
    pathParams: [],
    requiresAuthentication: true,
  });
  assert.deepEqual(todoManifest?.mobile, {
    routeCode: 'application.todo-center.mobile',
    path: '/m/todos',
    surface: 'user',
    pathParams: [],
    requiresAuthentication: true,
  });
  assert.equal(
    compiled.contracts.value.routeManifest.digest,
    sha256Digest({
      schemaVersion: SCHEMA_VERSIONS.applicationRouteManifest,
      appCode: 'reference-app',
      devicePolicy: {
        kind: 'viewport-family',
        mobileMaxWidthPx: 900,
        desktopMinWidthPx: 901,
      },
      rootEntry: { code: 'application-root', desktop: '/', mobile: '/m/' },
      authentication: {
        desktop: { routeCode: 'application-login', path: '/login' },
        mobile: { routeCode: 'application-login-mobile', path: '/m/login' },
      },
      routes: compiled.contracts.value.routeManifest.routes,
    })
  );
  assert.equal(
    compiled.contracts.value.adminPages.some(
      page => page.code === 'resource:colleges:list'
    ),
    true,
    'internal resources still have reachable generated pages'
  );
  assert.equal(
    compiled.contracts.value.adminNavigation.some(group =>
      group.items.some(item => item.pageCode.includes('colleges'))
    ),
    false,
    'compiler must not discover internal resources into navigation'
  );
  assert.deepEqual(
    compiled.contracts.value.adminPages
      .filter(page => page.resourceCode === 'instruments')
      .map(page => [page.kind, page.path]),
    [
      ['resource-create', '/admin/resources/instruments/new'],
      ['resource-detail', '/admin/resources/instruments/:id'],
      ['resource-list', '/admin/resources/instruments'],
      ['resource-update', '/admin/resources/instruments/:id/edit'],
    ]
  );
  assert.match(compiled.contracts.typescript, /export const adminPages/);
  assert.match(compiled.contracts.typescript, /export const adminAccess/);
  assert.match(compiled.contracts.typescript, /export const routeManifest/);
  assert.match(compiled.contracts.typescript, /export const adminNavigation/);
  assert.match(
    compiled.contracts.typescript,
    /export const applicationAuthentication = undefined;/
  );
  assert.match(
    compiled.contracts.typescript,
    /export const platformAuthManifest = null;/
  );
  assert.doesNotMatch(compiled.contracts.typescript, /undefined as const/);
  assert.doesNotMatch(compiled.contracts.typescript, /null as const/);
});

test('normalizes the legacy Todo Center admin helper into the independent user Surface', () => {
  const configured = defineOpenXiangdaApp({
    ...sourceDeclaration,
    frontend: {
      root: 'apps/web',
      admin: {
        navigation: defineAdminNavigation([
          adminNavigationGroup('overview', '工作台', [
            adminResourcePage('instruments'),
            adminApplicationTodoCenterPage({ label: '待办中心' }),
          ]),
        ]),
      },
    },
  });
  assert.equal(configured.frontend.user?.applicationTodoCenter, true);
  assert.deepEqual(
    configured.frontend.admin?.navigation[0]?.items.map(item => item.page),
    [{ kind: 'resource', resourceCode: 'instruments' }]
  );
  const compiled = compileApplicationSources(configured);
  assert.equal(
    compiled.config.value.frontend.user.applicationTodoCenter,
    true
  );
  assert.deepEqual(
    compiled.contracts.value.adminNavigation[0]?.items.map(item => item.pageCode),
    ['resource:instruments:list']
  );
  assert.deepEqual(
    compiled.contracts.value.routeManifest.routes
      .filter(route => route.code === 'application:todo-center')
      .map(route => [route.desktop.path, route.mobile.path]),
    [['/todos', '/m/todos']]
  );
});

test('rejects mutation ownership conflicts and empty Native forms with stable pointers', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        data: {
          resources: [
            {
              code: 'action-records',
              name: '业务处理记录',
              mutationOwner: 'action',
              generated: { create: true },
              fields: [{ code: 'name', type: 'text.short', label: '名称' }],
            },
          ],
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_DATA_RESOURCE_NATIVE_MUTATION_OWNER_CONFLICT',
        'data.resources[0].generated.create'
      )
  );
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        data: {
          resources: [
            {
              code: 'system-records',
              name: '仅系统字段记录',
              fields: [
                {
                  code: 'system_timestamp',
                  type: 'datetime',
                  label: '系统时间',
                  system: true,
                },
              ],
            },
          ],
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_DATA_RESOURCE_WRITABLE_FIELDS_REQUIRED',
        'data.resources[0].generated.create'
      )
  );
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        data: {
          resources: [
            {
              code: 'serial-records',
              name: '只读编号记录',
              fields: [
                { code: 'number', type: 'serial-number', label: '编号' },
              ],
            },
          ],
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_DATA_RESOURCE_WRITABLE_FIELDS_REQUIRED',
        'data.resources[0].generated.create'
      )
  );
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        authz: {
          ...sourceDeclaration.authz,
          roles: [
            {
              code: 'action_operator',
              name: '业务操作员',
              capabilities: [
                'app:reference-app:data:action-records:create',
              ],
            },
          ],
        },
        data: {
          resources: [
            {
              code: 'action-records',
              name: '业务处理记录',
              mutationOwner: 'action',
              fields: [{ code: 'name', type: 'text.short', label: '名称' }],
            },
          ],
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_DATA_RESOURCE_NATIVE_MUTATION_GRANT_FORBIDDEN',
        'authz.roles[0].capabilities[0]'
      )
  );
});

test('rejects invalid admin navigation and malformed or unclosed global access', () => {
  const workflowDefinition = {
    schemaVersion: SCHEMA_VERSIONS.workflowDefinition,
    code: 'record-approval',
    title: '记录审批',
    acceptedCommandDeactivationPolicy: 'finish-pinned' as const,
    subject: {
      resourceCode: 'instruments',
      factProjection: { instrumentName: 'name' },
    },
    startAt: 'approved',
    inputSchema: { type: 'object', additionalProperties: false },
    nodes: {
      approved: {
        id: 'approved',
        kind: 'end' as const,
        title: '完成',
        outcome: 'approved',
      },
    },
  };
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        workflows: {
          definitions: [
            {
              version: 1,
              definition: {
                ...workflowDefinition,
                title: workflowDefinition.code,
              },
              launch: { mode: 'work-center-only' },
            },
          ],
          bindings: [],
          activations: [],
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_WORKFLOW_USER_TITLE_REQUIRED',
        'workflows.definitions[0].definition.title'
      )
  );
  const cases: Array<[unknown, string, string]> = [
    [
      [adminResourcePage('missing-resource')],
      'APP_CONFIG_ADMIN_PAGE_NOT_FOUND',
      'frontend.admin.navigation[0].items[0].page',
    ],
    [
      [adminResourcePage('instruments'), adminResourcePage('instruments')],
      'APP_CONFIG_ADMIN_PAGE_DUPLICATE',
      'frontend.admin.navigation[0].items[1].page',
    ],
    [
      [adminResourcePage('instruments', { label: 'instruments' })],
      'APP_CONFIG_ADMIN_USER_LABEL_REQUIRED',
      'frontend.admin.navigation[0].items[0].label',
    ],
  ];
  for (const [items, code, path] of cases) {
    assert.throws(
      () =>
        defineOpenXiangdaApp({
          ...sourceDeclaration,
          frontend: {
            root: 'apps/web',
            admin: {
              navigation: defineAdminNavigation([
                adminNavigationGroup('records', '记录管理', items as never),
              ]),
            },
          },
        }),
      error => diagnosticOf(error, code, path)
    );
  }
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        frontend: {
          root: 'apps/web',
          admin: {
            navigation: defineAdminNavigation([
              adminNavigationGroup('empty', '空分组', []),
            ]),
          },
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_ADMIN_GROUP_ORPHANED',
        'frontend.admin.navigation[0].items'
      )
  );
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        frontend: {
          root: 'apps/web',
          admin: {
            access: { anyOf: [] },
            navigation: defineAdminNavigation([]),
          },
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_ADMIN_ACCESS_INVALID',
        'frontend.admin.access'
      )
  );
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        frontend: {
          root: 'apps/web',
          admin: {
            access: { anyOf: ['app:reference-app:admin:missing'] },
            navigation: defineAdminNavigation([]),
          },
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_CAPABILITY_CLOSURE_FAILED',
        'frontend.admin.access.anyOf[0]'
      )
  );
});

test('compiles canonical desktop/mobile Workflow detail routes and rejects broken declarations', () => {
  const workflowDefinition = {
    schemaVersion: SCHEMA_VERSIONS.workflowDefinition,
    code: 'purchase-approval',
    title: '采购审批',
    acceptedCommandDeactivationPolicy: 'finish-pinned' as const,
    subject: {
      resourceCode: 'instruments',
      factProjection: { instrumentName: 'name' },
    },
    startAt: 'approved',
    inputSchema: { type: 'object', additionalProperties: false },
    nodes: {
      approved: {
        id: 'approved',
        kind: 'end' as const,
        title: '完成',
        outcome: 'approved',
      },
    },
  };
  const declaration: OpenXiangdaAppDeclaration = {
    ...sourceDeclaration,
    frontend: {
      root: 'apps/web',
      routes: [
        {
          code: 'purchase-detail',
          path: '/admin/operations/purchases/:instanceId',
          label: '采购审批详情',
          surface: 'admin',
        },
        {
          code: 'purchase-detail-mobile',
          path: '/m/purchases/:instanceId',
          label: '移动采购审批详情',
          surface: 'user',
        },
      ],
    },
    workflows: {
      definitions: [
        {
          version: 1,
          definition: workflowDefinition,
          launch: { mode: 'standalone' },
          detailRouteCode: {
            desktop: 'purchase-detail',
            mobile: 'purchase-detail-mobile',
          },
        },
      ],
      bindings: [],
      activations: [],
    },
  };
  const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration));
  assert.deepEqual(compiled.contracts.value.workflows[0]?.detailRouteCode, {
    desktop: 'purchase-detail',
    mobile: 'purchase-detail-mobile',
  });
  assert.deepEqual(compiled.contracts.value.workflows[0]?.subject, {
    resourceCode: 'instruments',
    factProjection: { instrumentName: 'name' },
    summaryFields: [],
  });
  assert.equal(
    compiled.contracts.value.workflows[0]?.processOperationCode,
    'openxiangda.workflow.purchase-approval.submit'
  );
  assert.deepEqual(
    compiled.contracts.value.routeManifest.routes.map(route => route.code),
    [
      'workflow:instance',
      'workflow:purchase-approval:launch',
      'workflow:task',
      'workflow:work-center',
    ],
  );
  const launchManifest = compiled.contracts.value.routeManifest.routes.find(
    route => route.code === 'workflow:purchase-approval:launch'
  );
  assert.deepEqual(launchManifest, {
    code: 'workflow:purchase-approval:launch',
    kind: 'workflow-launch',
    workflowCode: 'purchase-approval',
    desktop: {
      routeCode: 'workflow.purchase-approval.launch.desktop',
      path: '/workflows/:workflowCode/start',
      surface: 'user',
      pathParams: ['workflowCode'],
      requiresAuthentication: true,
    },
    mobile: {
      routeCode: 'workflow.purchase-approval.launch.mobile',
      path: '/m/workflows/:workflowCode/start',
      surface: 'user',
      pathParams: ['workflowCode'],
      requiresAuthentication: true,
    },
  });
  const taskManifest = compiled.contracts.value.routeManifest.routes.find(
    route => route.code === 'workflow:task'
  );
  assert.deepEqual(taskManifest?.mobile.pathParams, ['taskId']);
  assert.deepEqual(taskManifest?.desktop.pathParams, ['taskId']);
  assert.equal(
    compiled.contracts.value.routeManifest.digest,
    sha256Digest({
      schemaVersion: SCHEMA_VERSIONS.applicationRouteManifest,
      appCode: 'reference-app',
      devicePolicy: {
        kind: 'viewport-family',
        mobileMaxWidthPx: 900,
        desktopMinWidthPx: 901,
      },
      rootEntry: { code: 'application-root', desktop: '/', mobile: '/m/' },
      authentication: {
        desktop: { routeCode: 'application-login', path: '/login' },
        mobile: { routeCode: 'application-login-mobile', path: '/m/login' },
      },
      routes: compiled.contracts.value.routeManifest.routes,
    })
  );
  assert.match(
    compiled.contracts.typescript,
    /"detailRouteCode": \{\s+"desktop": "purchase-detail",\s+"mobile": "purchase-detail-mobile"/m
  );
  assert.match(
    compiled.contracts.typescript,
    /"subject": \{\s+"resourceCode": "instruments",\s+"factProjection": \{\s+"instrumentName": "name"/m
  );
  assert.match(
    compiled.contracts.typescript,
    /"processOperationCode": "openxiangda\.workflow\.purchase-approval\.submit"/
  );

  const invalidCases: Array<[(value: any) => void, string, string]> = [
    [
      value => {
        value.workflows.definitions[0].detailRouteCode = {
          desktop: 'purchase-detail',
        };
      },
      'APP_CONFIG_WORKFLOW_DETAIL_ROUTE_INVALID',
      'workflows.definitions[0].detailRouteCode',
    ],
    [
      value => {
        value.workflows.definitions[0].detailRouteCode.mobile =
          'missing-mobile-detail';
      },
      'APP_CONFIG_WORKFLOW_DETAIL_ROUTE_REFERENCE_MISSING',
      'workflows.definitions[0].detailRouteCode.mobile',
    ],
    [
      value => {
        value.frontend.routes[1].surface = 'admin';
      },
      'APP_CONFIG_WORKFLOW_DETAIL_ROUTE_SURFACE_INVALID',
      'workflows.definitions[0].detailRouteCode.mobile',
    ],
    [
      value => {
        value.frontend.routes[1].path =
          '/m/purchases/:instanceId/tasks/:taskId';
      },
      'APP_CONFIG_WORKFLOW_DETAIL_ROUTE_PATH_INVALID',
      'workflows.definitions[0].detailRouteCode.mobile',
    ],
  ];
  for (const [mutate, code, path] of invalidCases) {
    const invalid = structuredClone(declaration) as any;
    mutate(invalid);
    assert.throws(
      () => defineOpenXiangdaApp(invalid),
      error => diagnosticOf(error, code, path)
    );
  }
});

test('compiles named-operation Workflow submission routes and rejects unsealed mappings', () => {
  const capability = 'app:reference-app:purchase:submit';
  const workflowCode = 'purchase-submit';
  const responseSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'revision'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      revision: { type: 'integer', minimum: 1 },
      processCommand: { type: ['object', 'null'] },
    },
  };
  const declaration: OpenXiangdaAppDeclaration = {
    ...sourceDeclaration,
    authz: {
      ...sourceDeclaration.authz,
      capabilities: [
        ...(sourceDeclaration.authz.capabilities || []),
        { code: capability, kind: 'backend', name: '提交采购审批' },
      ],
      roles: sourceDeclaration.authz.roles.map(role => ({
        ...role,
        capabilities: [...role.capabilities, capability],
      })),
    },
    backend: {
      ...sourceDeclaration.backend,
      operations: [
        {
          code: 'purchase.create-submit',
          method: 'POST',
          path: '/api/purchases/submit',
          capability,
          requestSchema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'idempotencyKey',
              'name',
              'owner',
              'college',
              'requestedAt',
            ],
            properties: {
              idempotencyKey: { type: 'string' },
              name: { type: 'string' },
              owner: { type: 'object' },
              college: { type: 'object' },
              requestedAt: { type: 'string', format: 'date-time' },
            },
          },
          responseSchema,
          platformAccess: { workflow: { codes: [workflowCode] } },
        },
        {
          code: 'purchase.existing-submit',
          method: 'POST',
          path: '/api/purchases/resubmit',
          capability,
          requestSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'expectedRevision', 'idempotencyKey', 'name'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              expectedRevision: { type: 'integer', minimum: 1 },
              idempotencyKey: { type: 'string' },
              name: { type: 'string' },
            },
          },
          responseSchema,
          platformAccess: { workflow: { codes: [workflowCode] } },
        },
      ],
    },
    workflows: {
      definitions: [
        {
          version: 1,
          launch: {
            mode: 'hidden-handoff',
            submission: {
              kind: 'named-operation',
              create: {
                operationCode: 'purchase.create-submit',
                inputs: {
                  idempotencyKey: { source: 'idempotency-key' },
                  name: { source: 'field', fieldCode: 'name' },
                  owner: { source: 'current-user-reference' },
                  college: { source: 'field', fieldCode: 'college_id' },
                  requestedAt: { source: 'requested-at' },
                },
                output: {
                  subjectId: 'id',
                  subjectRevision: 'revision',
                  processCommand: 'processCommand',
                },
              },
              existing: {
                operationCode: 'purchase.existing-submit',
                inputs: {
                  id: { source: 'subject-id' },
                  expectedRevision: { source: 'subject-revision' },
                  idempotencyKey: { source: 'idempotency-key' },
                  name: { source: 'field', fieldCode: 'name' },
                },
                output: {
                  subjectId: 'id',
                  subjectRevision: 'revision',
                  processCommand: 'processCommand',
                },
              },
              context: [
                { queryParameter: 'collegeId', fieldCode: 'college_id' },
              ],
            },
          },
          definition: {
            schemaVersion: SCHEMA_VERSIONS.workflowDefinition,
            code: workflowCode,
            title: '采购提交',
            acceptedCommandDeactivationPolicy: 'finish-pinned',
            subject: {
              resourceCode: 'instruments',
              factProjection: { instrumentName: 'name' },
            },
            startAt: 'completed',
            inputSchema: { type: 'object', additionalProperties: false },
            nodes: {
              completed: {
                id: 'completed',
                kind: 'end',
                title: '完成',
                outcome: 'approved',
              },
            },
          },
        },
      ],
      bindings: [
        {
          version: 1,
          binding: {
            schemaVersion: SCHEMA_VERSIONS.workflowBinding,
            workflowCode,
            bindings: {},
          },
        },
      ],
      activations: [
        {
          workflowCode,
          definitionVersion: 1,
          bindingVersion: 1,
          acceptedCommandDeactivationPolicy: 'finish-pinned',
        },
      ],
    },
  };
  const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration));
  assert.equal(requiredPlatformCapabilities(defineOpenXiangdaApp(declaration)).find(item =>
    item.code === 'workflow.named-input-sources')?.contractVersion, '1.0.0');
  assert.equal(requiredPlatformCapabilities(defineOpenXiangdaApp(sourceDeclaration)).some(item =>
    item.code === 'workflow.named-input-sources'), false);
  const workflow = compiled.contracts.value.workflows[0]!;
  assert.equal(workflow.processOperationCode, undefined);
  assert.equal(
    workflow.launch.submission?.create?.path,
    '/api/purchases/submit',
  );
  assert.equal(
    workflow.launch.submission?.existing?.requestSchemaDigest,
    sha256Digest(declaration.backend.operations![1]!.requestSchema),
  );
  assert.deepEqual(workflow.launch.submission?.context, [
    { queryParameter: 'collegeId', fieldCode: 'college_id' },
  ]);
  const launch = compiled.contracts.value.routeManifest.routes.find(
    route => route.code === `workflow:${workflowCode}:launch`,
  );
  assert.equal(launch?.desktop.path, '/workflows/:workflowCode/start');
  assert.equal(launch?.mobile.path, '/m/workflows/:workflowCode/start');
  assert.equal(launch?.desktop.capability, capability);
  assert.equal(launch?.mobile.capability, capability);

  const invalidCases: Array<[(value: any) => void, string, string]> = [
    [
      value => {
        value.backend.operations[0].platformAccess.workflow.codes = [];
      },
      'APP_CONFIG_WORKFLOW_NAMED_OPERATION_INVALID',
      'workflows.definitions[0].launch.submission.create',
    ],
    [
      value => {
        delete value.workflows.definitions[0].launch.submission.existing.inputs
          .expectedRevision;
      },
      'APP_CONFIG_WORKFLOW_NAMED_OPERATION_INPUT_INVALID',
      'workflows.definitions[0].launch.submission.existing.inputs',
    ],
    [
      value => {
        value.workflows.definitions[0].launch.submission.context[0].fieldCode =
          'missing';
      },
      'APP_CONFIG_WORKFLOW_LAUNCH_CONTEXT_INVALID',
      'workflows.definitions[0].launch.submission.context',
    ],
  ];
  for (const [mutate, code, path] of invalidCases) {
    const invalid = structuredClone(declaration) as any;
    mutate(invalid);
    assert.throws(
      () => defineOpenXiangdaApp(invalid),
      error => diagnosticOf(error, code, path),
    );
  }
});

test('projects bounded Workflow summary fields and rejects unsupported fields', () => {
  const workflow = {
    schemaVersion: SCHEMA_VERSIONS.workflowDefinition,
    code: 'summary-approval',
    title: '摘要审批',
    acceptedCommandDeactivationPolicy: 'finish-pinned' as const,
    subject: {
      resourceCode: 'instruments',
      factProjection: { instrumentName: 'name' },
      summaryFields: ['name', 'owner'],
    },
    startAt: 'approved',
    inputSchema: { type: 'object', additionalProperties: false },
    nodes: {
      approved: {
        id: 'approved',
        kind: 'end' as const,
        title: '完成',
        outcome: 'approved',
      },
    },
  };
  const binding = {
    schemaVersion: SCHEMA_VERSIONS.workflowBinding,
    workflowCode: workflow.code,
    bindings: {},
  };
  const configured = defineOpenXiangdaApp({
    ...sourceDeclaration,
    workflows: {
      definitions: [{ version: 1, definition: workflow }],
      bindings: [{ version: 1, binding }],
      activations: [],
    },
  });
  const compiled = compileApplicationSources(configured);
  assert.deepEqual(compiled.contracts.value.workflows[0]?.subject, {
    resourceCode: 'instruments',
    factProjection: { instrumentName: 'name' },
    summaryFields: ['name', 'owner'],
  });

  for (const summaryFields of [
    ['name', 'name'],
    ['name', 'missing'],
    ['name', 'rich_notes'],
    ['system_stamp'],
    ['long_notes'],
    Array.from({ length: 17 }, (_, index) => `field_${index}`),
  ]) {
    const invalid = structuredClone(sourceDeclaration) as any;
    invalid.data.resources[0].fields.push(
      { code: 'rich_notes', type: 'text.rich', label: 'Rich notes' },
      {
        code: 'long_notes',
        type: 'text.long',
        maxLength: 4096,
        label: 'Long notes',
      },
      {
        code: 'system_stamp',
        type: 'datetime',
        label: 'System stamp',
        system: true,
      },
    );
    invalid.workflows = {
      definitions: [{ version: 1, definition: { ...workflow, subject: { ...workflow.subject, summaryFields } } }],
      bindings: [{ version: 1, binding }],
      activations: [],
    };
    assert.throws(
      () => defineOpenXiangdaApp(invalid),
      error =>
        diagnosticOf(
          error,
          'APP_CONFIG_WORKFLOW_SUMMARY_FIELDS_INVALID',
          'workflows.definitions[0].definition.subject.summaryFields',
        ),
    );
  }
});

function sharedFieldApplication(fieldOrder: string[]) {
  return defineOpenXiangdaApp({
    ...sourceDeclaration,
    data: {
      resources: [
        {
          ...sourceDeclaration.data!.resources[0]!,
          list: {
            defaultPageSize: 20,
            defaultSort: { field: fieldOrder[0]!, order: 'asc' },
          },
          fields: [
            ...fieldOrder.map(code => ({
              code,
              type: 'text.short' as const,
              label: code,
              access: { update: [sharedFieldCapability] },
            })),
            ...sourceDeclaration.data!.resources[0]!.fields.filter(field =>
              ['owner', 'college_id'].includes(field.code)
            ),
          ],
        },
        ...sourceDeclaration.data!.resources.slice(1),
      ],
    },
  });
}

type TestDataCapability = {
  code: string;
  kind: 'data';
  name: string;
  source: 'data';
};

function compareStrings(left: string, right: string) {
  return left === right ? 0 : left < right ? -1 : 1;
}

/**
 * Minimal independent platform-style rebuild for data capabilities. It reads
 * only the canonical config artifact and deliberately mirrors the server's
 * fixed operation order; it does not call the client compiler under test.
 */
function rebuildDataCapabilityFromConfigArtifact(
  content: string,
  targetCode: string
): TestDataCapability | undefined {
  const configuration = JSON.parse(content) as {
    data: {
      resources: Array<{
        code: string;
        name: string;
        capabilities: Record<string, string>;
        fieldPolicies: Record<
          string,
          Partial<Record<'read' | 'create' | 'update', string[]>>
        >;
      }>;
    };
  };
  const capabilities = new Map<string, TestDataCapability>();
  for (const resource of [...configuration.data.resources].sort((left, right) =>
    compareStrings(left.code, right.code)
  )) {
    const operationNames = {
      read: `读取${resource.name}`,
      create: `新建${resource.name}`,
      update: `更新${resource.name}`,
      delete: `删除${resource.name}`,
    } as const;
    for (const operation of ['read', 'create', 'update', 'delete'] as const) {
      const code = resource.capabilities[operation];
      if (!code) continue;
      capabilities.set(code, {
        code,
        kind: 'data',
        name: operationNames[operation],
        source: 'data',
      });
    }
    for (const [fieldCode, policy] of Object.entries(
      resource.fieldPolicies
    ).sort(([left], [right]) => compareStrings(left, right))) {
      for (const operation of ['read', 'create', 'update'] as const) {
        for (const code of [...(policy[operation] || [])].sort(compareStrings)) {
          if (capabilities.has(code)) continue;
          capabilities.set(code, {
            code,
            kind: 'data',
            name: `${resource.name}.${fieldCode}.${operation}`,
            source: 'data',
          });
        }
      }
    }
  }
  return capabilities.get(targetCode);
}

test('compiles deterministic configuration and generated contracts', () => {
  const first = compileApplicationSources(source);
  const second = compileApplicationSources(source);
  assert.equal(first.config.digest, second.config.digest);
  assert.equal(first.contracts.digest, second.contracts.digest);
  assert.match(first.contracts.typescript, /interface InstrumentsRecord/);
  assert.match(first.contracts.typescript, /resourceSurfaces/);
  assert.match(first.contracts.typescript, /resourceDefinitions/);
  assert.match(
    first.contracts.typescript,
    /applicationInformational: "application\.informational\.standard"/
  );
  assert.match(first.contracts.typescript, /Instrument name/);
  assert.match(first.contracts.typescript, /instruments:delete/);
  assert.match(first.contracts.typescript, /instruments:update/);
  assert.equal(first.contracts.typescript.endsWith('\n'), true);
  assert.equal(first.contracts.typescript.endsWith('\n\n'), false);
  assert.equal(
    first.config.value.data.resources.find(item => item.code === 'instruments')
      ?.code,
    'instruments'
  );
  assert.deepEqual(
    first.config.value.data.resources.find(item => item.code === 'instruments')
      ?.surface?.generated,
    {
      list: true,
      detail: true,
      create: true,
      update: true,
      delete: true,
    }
  );
  assert.equal(
    first.contracts.value.resources.find(item => item.code === 'instruments')
      ?.fields.find(field => field.code === 'name')?.type,
    'text.short'
  );
  assert.equal(first.config.value.authz.roles[0]?.code, 'instrument_admin');
  assert.deepEqual(first.config.value.authz.scopeDimensions[0]?.valueSource, {
    kind: 'native_resource',
    resourceCode: 'colleges',
    labelField: 'name',
    enabledField: 'enabled',
  });
  assert.equal(
    first.config.value.authz.scopeSources[0]?.resourceCode,
    'college-memberships'
  );
  assert.equal(
    first.config.value.authz.dataPolicies[0]?.rules[0]?.subject,
    'current_user'
  );
  assert.deepEqual(
    first.config.value.authz.dataPolicies[0]?.rules[0]?.roleCodes,
    ['instrument_admin']
  );
});

test('compiles explicit resource detail routes and rejects guessed or unsafe navigation contracts', () => {
  const declaration = structuredClone(sourceDeclaration);
  declaration.frontend.routes = [
    {
      code: 'instrument-detail',
      path: '/instruments/:instrumentId',
      label: 'Instrument detail',
      surface: 'user',
      capability: 'app:reference-app:data:instruments:read',
    },
    {
      code: 'instrument-detail-mobile',
      path: '/m/instruments/:instrumentId',
      label: 'Mobile instrument detail',
      surface: 'user',
      capability: 'app:reference-app:data:instruments:read',
    },
  ];
  declaration.data!.resources[0]!.detailRouteCode = {
    desktop: 'instrument-detail',
    mobile: 'instrument-detail-mobile',
  };

  const configured = defineOpenXiangdaApp(declaration);
  const compiled = compileApplicationSources(configured);
  assert.deepEqual(configured.data?.resources[0]?.detailRouteCode, {
    desktop: 'instrument-detail',
    mobile: 'instrument-detail-mobile',
  });
  assert.equal(
    'detailRouteCode' in (compiled.config.value.data.resources[0] || {}),
    false,
  );
  assert.deepEqual(compiled.config.value.data.resourceDetailRoutes, [
    {
      resourceCode: 'instruments',
      desktop: 'instrument-detail',
      mobile: 'instrument-detail-mobile',
    },
  ]);
  assert.deepEqual(
    compiled.contracts.value.resources.find(
      resource => resource.code === 'instruments',
    )?.detailRouteCode,
    {
      desktop: 'instrument-detail',
      mobile: 'instrument-detail-mobile',
    },
  );
  assert.match(
    compiled.contracts.typescript,
    /detailRouteCode: \{"desktop":"instrument-detail","mobile":"instrument-detail-mobile"\}/,
  );

  const invalidCases: Array<[(value: any) => void, string, string]> = [
    [
      value => {
        value.data.resources[0].detailRouteCode = {
          desktop: 'instrument-detail',
        };
      },
      'APP_CONFIG_DATA_RESOURCE_DETAIL_ROUTE_INVALID',
      'data.resources[0].detailRouteCode',
    ],
    [
      value => {
        value.data.resources[0].detailRouteCode.mobile = 'missing-detail';
      },
      'APP_CONFIG_DATA_RESOURCE_DETAIL_ROUTE_REFERENCE_MISSING',
      'data.resources[0].detailRouteCode.mobile',
    ],
    [
      value => {
        value.frontend.routes[1].surface = 'admin';
      },
      'APP_CONFIG_DATA_RESOURCE_DETAIL_ROUTE_SURFACE_INVALID',
      'data.resources[0].detailRouteCode.mobile',
    ],
    [
      value => {
        value.frontend.routes[0].path = '/instruments/:instrumentId/tabs/:tabId';
      },
      'APP_CONFIG_DATA_RESOURCE_DETAIL_ROUTE_PATH_INVALID',
      'data.resources[0].detailRouteCode.desktop',
    ],
    [
      value => {
        value.frontend.routes[0].capability =
          'app:reference-app:data:instruments:update';
      },
      'APP_CONFIG_DATA_RESOURCE_DETAIL_ROUTE_CAPABILITY_INVALID',
      'data.resources[0].detailRouteCode.desktop',
    ],
  ];
  for (const [mutate, code, path] of invalidCases) {
    const invalid = structuredClone(declaration) as any;
    mutate(invalid);
    assert.throws(
      () => defineOpenXiangdaApp(invalid),
      error => diagnosticOf(error, code, path),
    );
  }
});

test('emits one Surface copy for a nineteen-resource application', () => {
  const resourceCount = 19;
  const application = defineOpenXiangdaApp({
    ...sourceDeclaration,
    authz: {
      capabilities: [],
      roles: [],
      scopeDimensions: [],
      scopeSources: [],
      dataPolicies: [],
    },
    data: {
      resources: Array.from({ length: resourceCount }, (_, resourceIndex) => ({
        code: `scaled-resource-${String(resourceIndex + 1).padStart(2, '0')}`,
        name: `Scaled resource ${resourceIndex + 1}`,
        fields: Array.from({ length: 8 }, (_, fieldIndex) => ({
          code: `field_${String(fieldIndex + 1).padStart(2, '0')}`,
          type: 'text.short' as const,
          label: `Shared scale field ${String(fieldIndex + 1).padStart(2, '0')}`,
          required: fieldIndex < 2,
          searchable: fieldIndex < 2,
          list: fieldIndex < 4,
        })),
        list: {
          defaultPageSize: 20,
          defaultSort: { field: 'field_01', order: 'asc' as const },
        },
      })),
    },
  });
  const generated = compileApplicationSources(application).contracts.typescript;
  assert.equal(
    generated.match(/surface: resourceSurfaces\[/g)?.length,
    resourceCount
  );
  assert.equal(
    generated.match(/Shared scale field 01/g)?.length,
    resourceCount,
    'each field label must appear only in the single resourceSurfaces literal'
  );
  assert.doesNotMatch(generated, /"surface": \{/);
});

test('materializes one field declaration into platform schema, Surface and access', () => {
  const compiled = compileApplicationSources(source);
  const resource = compiled.config.value.data.resources.find(
    item => item.code === 'instruments'
  )!;
  const surface = JSON.parse(
    compiled.contracts.typescript.match(
      /export const resourceSurfaces = ([\s\S]*?) as const;/
    )![1]!
  ).instruments;
  assert.deepEqual(resource.schema.fields[0], {
    code: 'name',
    type: 'text.short',
    nullable: false,
    indexed: true,
  });
  assert.deepEqual(resource.fieldPolicies.name, {
    read: ['app:reference-app:data:instruments:read'],
    create: ['app:reference-app:data:instruments:create'],
    update: ['app:reference-app:data:instruments:update'],
  });
  assert.equal(surface.fields.name.label, 'Instrument name');
  assert.equal(surface.fields.name.type, 'text.short');
  assert.equal(surface.fields.name.widget, 'text');
  assert.deepEqual(surface.fields.name.createCapabilities, [
    'app:reference-app:data:instruments:create',
  ]);
  assert.deepEqual(surface.fields.name.updateCapabilities, [
    'app:reference-app:data:instruments:update',
  ]);
});

test('keeps system fields out of every generated mutation projection', () => {
  const application = defineOpenXiangdaApp({
    ...sourceDeclaration,
    authz: {
      capabilities: [],
      roles: [],
      scopeDimensions: [],
      scopeSources: [],
      dataPolicies: [],
    },
    data: {
      resources: [
        {
          code: 'system-field-records',
          name: '系统字段记录',
          fields: [
            {
              code: 'audit_stamp',
              type: 'datetime',
              label: '更新时间',
              system: true,
            },
            { code: 'name', type: 'text.short', label: '名称', required: true },
          ],
        },
      ],
    },
  });
  const compiled = compileApplicationSources(application);
  const resource = compiled.config.value.data.resources[0]!;
  assert.deepEqual(
    resource.surface?.fields.audit_stamp?.createCapabilities,
    []
  );
  assert.deepEqual(
    resource.surface?.fields.audit_stamp?.updateCapabilities,
    []
  );
  const createType = compiled.contracts.typescript.match(
    /interface SystemFieldRecordsCreateInput \{([\s\S]*?)\}/
  )?.[1];
  const updateType = compiled.contracts.typescript.match(
    /interface SystemFieldRecordsUpdateInput \{([\s\S]*?)\}/
  )?.[1];
  assert.match(createType || '', /name:/);
  assert.doesNotMatch(createType || '', /audit_stamp/);
  assert.doesNotMatch(updateType || '', /audit_stamp/);
  const createCapability = compiled.aiCatalog.value.capabilities.find(
    item => item.code === 'reference-app.system-field-records.create'
  );
  assert.deepEqual(
    Object.keys(createCapability?.inputSchema.properties || {}),
    ['name']
  );
});

test('emits one Surface copy for a nineteen-resource application', () => {
  const resourceCount = 19;
  const application = defineOpenXiangdaApp({
    ...sourceDeclaration,
    authz: {
      capabilities: [],
      roles: [],
      scopeDimensions: [],
      scopeSources: [],
      dataPolicies: [],
    },
    data: {
      resources: Array.from({ length: resourceCount }, (_, resourceIndex) => ({
        code: `scaled-resource-${String(resourceIndex + 1).padStart(2, '0')}`,
        name: `Scaled resource ${resourceIndex + 1}`,
        fields: Array.from({ length: 8 }, (_, fieldIndex) => ({
          code: `field_${String(fieldIndex + 1).padStart(2, '0')}`,
          type: 'text.short' as const,
          label: `Shared scale field ${String(fieldIndex + 1).padStart(2, '0')}`,
          required: fieldIndex < 2,
          searchable: fieldIndex < 2,
          list: fieldIndex < 4,
        })),
        list: {
          defaultPageSize: 20,
          defaultSort: { field: 'field_01', order: 'asc' as const },
        },
      })),
    },
  });
  const generated = compileApplicationSources(application).contracts.typescript;
  assert.equal(
    generated.match(/surface: resourceSurfaces\[/g)?.length,
    resourceCount
  );
  assert.equal(generated.match(/Shared scale field 01/g)?.length, resourceCount);
  assert.doesNotMatch(generated, /"surface": \{/);
});

test('rejects the removed dual schema and Surface application declaration', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        data: { resources: [source.data!.resources[0]!] },
      } as any),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_DATA_RESOURCE_PROPERTY_UNSUPPORTED' &&
          item.path.endsWith('.schema')
      )
  );
});

test('rejects invalid field types at the authored declaration path', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        data: {
          resources: [
            {
              code: 'invalid-numbers',
              name: 'Invalid numbers',
              fields: [
                { code: 'count', type: 'number', label: 'Count' },
              ],
            },
          ],
        },
      } as any),
    (error: any) => {
      const diagnostics = error?.diagnostics || [];
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0]?.code, 'APP_CONFIG_DATA_FIELD_TYPE_INVALID');
      assert.equal(
        diagnostics[0]?.path,
        'data.resources[0].fields[0].type'
      );
      assert.doesNotMatch(diagnostics[0]?.path || '', /schema\.fields/);
      return true;
    }
  );
});

test('builds the only current-user row rule shape', () => {
  assert.deepEqual(
    currentUserDataPolicy({
      code: 'record-owner',
      name: 'Record owner',
      resourceCode: 'instruments',
      field: 'created_by',
      roleCodes: ['instrument_admin'],
      unrestrictedRoleCodes: ['school_admin'],
    }),
    {
      code: 'record-owner',
      name: 'Record owner',
      resourceCode: 'instruments',
      unrestrictedRoleCodes: ['school_admin'],
      matchMode: 'AND',
      rules: [
        {
          subject: 'current_user',
          field: 'created_by',
          roleCodes: ['instrument_admin'],
        },
      ],
    }
  );
});

test('compiles a bounded database-time resource read policy expression', () => {
  const declaration = structuredClone(sourceDeclaration);
  declaration.data!.resources[0]!.fields.push(
    {
      code: 'status',
      type: 'option.single',
      label: 'Status',
      required: true,
      options: [{ value: 'PUBLISHED', label: 'Published' }],
    },
    {
      code: 'publishAt',
      type: 'datetime',
      label: 'Publish at',
      required: true,
    },
    {
      code: 'expireAt',
      type: 'datetime',
      label: 'Expire at',
    }
  );
  declaration.authz!.dataPolicies![0] = resourceReadPolicy({
    code: 'instrument_access',
    name: 'Published instrument access',
    resourceCode: 'instruments',
    writeBoundary: 'capability_only',
    expression: dataPolicyExpression.allOf(
      dataPolicyExpression.constant({
        field: 'status',
        operator: 'eq',
        value: 'PUBLISHED',
      }),
      dataPolicyExpression.databaseNow({
        field: 'publishAt',
        operator: 'lte',
      }),
      dataPolicyExpression.anyOf(
        dataPolicyExpression.null({
          field: 'expireAt',
          operator: 'is_null',
        }),
        dataPolicyExpression.databaseNow({
          field: 'expireAt',
          operator: 'gt',
        })
      )
    ),
  }) as any;

  const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration));
  assert.deepEqual(compiled.config.value.authz.dataPolicies[0], {
    code: 'instrument_access',
    name: 'Published instrument access',
    resourceCode: 'instruments',
    matchMode: 'AND',
    rules: [],
    writeBoundary: 'capability_only',
    readExpression: {
      allOf: [
        { field: 'status', operator: 'eq', value: 'PUBLISHED' },
        { field: 'publishAt', operator: 'lte', operand: 'db_now' },
        {
          anyOf: [
            { field: 'expireAt', operator: 'is_null' },
            { field: 'expireAt', operator: 'gt', operand: 'db_now' },
          ],
        },
      ],
    },
  });
  assert.deepEqual(
    dataPolicyExpression.anyOf(
      dataPolicyExpression.currentUser({ field: 'created_by' }),
      dataPolicyExpression.dimension({
        dimensionCode: 'college',
        field: 'college_id',
      }),
      dataPolicyExpression.relation({
        relationCode: 'instrument_manager',
        resourceCode: 'instruments',
        field: 'id',
      })
    ),
    {
      anyOf: [
        { subject: 'current_user', field: 'created_by' },
        { dimensionCode: 'college', field: 'college_id' },
        {
          relationCode: 'instrument_manager',
          resourceCode: 'instruments',
          field: 'id',
        },
      ],
    }
  );

  const wrongType = structuredClone(declaration);
  wrongType.data!.resources[0]!.fields.find(
    field => field.code === 'publishAt'
  )!.type = 'text.short';
  assert.ok(
    validateAppConfig(wrongType).some(
      item => item.code === 'APP_CONFIG_AUTHZ_POLICY_DB_NOW_FIELD_INVALID'
    )
  );

  const mixed = structuredClone(declaration) as any;
  mixed.authz.dataPolicies[0].writeBoundary = undefined;
  assert.ok(
    validateAppConfig(mixed).some(
      item => item.code === 'APP_CONFIG_AUTHZ_POLICY_INVALID'
    )
  );

  const expansion = structuredClone(declaration) as any;
  expansion.authz.dataPolicies[0].readExpression = {
    anyOf: Array.from({ length: 7 }, () => ({
      allOf: [
        { field: 'status', operator: 'eq', value: 'PUBLISHED' },
        { field: 'status', operator: 'eq', value: 'PUBLISHED' },
      ],
    })),
  };
  assert.ok(
    validateAppConfig(expansion).some(
      item =>
        item.code ===
        'APP_CONFIG_AUTHZ_POLICY_EXPRESSION_EXPANSION_EXCEEDED'
    )
  );

  const unknownLeafKey = structuredClone(declaration) as any;
  unknownLeafKey.authz.dataPolicies[0].readExpression.allOf[0].sql =
    "status = 'PUBLISHED'";
  assert.ok(
    validateAppConfig(unknownLeafKey).some(
      item => item.code === 'APP_CONFIG_AUTHZ_POLICY_RULE_KEYS_INVALID'
    )
  );
});

test('simple visitor, meeting, and course resources receive generated CRUD definitions', () => {
  const resources = [
    ['visitor-reservations', '访客预约', 'visitorName'],
    ['meeting-rooms', '会议室', 'roomName'],
    ['course-selections', '选课记录', 'courseName'],
  ].map(([code, name, field]) => ({
    schemaVersion: SCHEMA_VERSIONS.dataResource,
    appCode: 'reference-app',
    code,
    name,
    schema: { fields: [{ code: field, type: 'text.short', nullable: false }] },
    surface: {
      fields: { [field]: { label: name, widget: 'text', list: true, searchable: true, sortable: true } },
      list: { searchableFields: [field], filterFields: [field], defaultSort: { field, order: 'asc' as const } },
      form: { layout: 'flat' as const },
      detail: { layout: 'flat' as const },
      mobile: { enabled: true },
    },
    capabilities: {
      read: `app:reference-app:data:${code}:read`,
      create: `app:reference-app:data:${code}:create`,
      update: `app:reference-app:data:${code}:update`,
      delete: `app:reference-app:data:${code}:delete`,
    },
    fieldPolicies: {},
  }));
  const generated = compileApplicationSources({ ...source, data: { resources } });
  for (const code of ['visitor-reservations', 'meeting-rooms', 'course-selections']) {
    assert.match(generated.contracts.typescript, new RegExp(code));
  }
  assert.match(generated.contracts.typescript, /resourceDefinitions/);
  assert.match(generated.contracts.typescript, /移动|访客预约|会议室|选课记录/);
});

test('derives a default surface, canonical references, and deny-by-default updates', () => {
  const courses = {
    schemaVersion: SCHEMA_VERSIONS.dataResource,
    appCode: 'reference-app',
    code: 'courses',
    name: 'Courses',
    schema: { fields: [{ code: 'title', type: 'text.short', nullable: false }] },
    capabilities: {
      read: 'app:reference-app:data:courses:read',
      create: 'app:reference-app:data:courses:create',
      update: 'app:reference-app:data:courses:update',
      delete: 'app:reference-app:data:courses:delete',
    },
    fieldPolicies: {},
  } as const;
  const selections = {
    schemaVersion: SCHEMA_VERSIONS.dataResource,
    appCode: 'reference-app',
    code: 'course-selections',
    name: 'Course selections',
    schema: {
      fields: [
        {
          code: 'courseId',
          type: 'resource-ref.single',
          source: { kind: 'resource', resourceCode: 'courses', labelField: 'title' },
        },
        { code: 'studentId', type: 'user.single' },
      ],
    },
    capabilities: {
      read: 'app:reference-app:data:course-selections:read',
      create: 'app:reference-app:data:course-selections:create',
      update: 'app:reference-app:data:course-selections:update',
      delete: 'app:reference-app:data:course-selections:delete',
    },
    fieldPolicies: {},
  } as const;
  const compiled = compileApplicationSources({
    ...source,
    data: { resources: [courses, selections] },
    authz: { capabilities: [], roles: [], scopeDimensions: [], scopeSources: [], dataPolicies: [] },
  });
  const selection = compiled.config.value.data.resources.find(item => item.code === 'course-selections')!;
  assert.deepEqual(selection.fieldPolicies.courseId, { update: [] });
  assert.deepEqual(selection.fieldPolicies.studentId, { update: [] });
  assert.match(compiled.contracts.typescript, /"course-selections"/);
  assert.match(compiled.contracts.typescript, /"widget": "select"/);
  assert.match(compiled.contracts.typescript, /"widget": "directory-user"/);
  assert.ok(
    compiled.config.value.runtime.protocolCapabilities.includes('directory-v2'),
    'directory-v2 must derive from a directory reference even before roles are assigned',
  );
});

test('rejects a serial-number resource label before platform deployment', () => {
  const declaration = structuredClone(sourceDeclaration);
  Object.assign(
    declaration.data!.resources[1]!.fields.find(
      field => field.code === 'name'
    )!,
    {
      type: 'serial-number' as const,
      serial: { prefix: 'COL-', digits: 6, start: 1 },
    }
  );

  assert.throws(
    () => defineOpenXiangdaApp(declaration),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_DATA_RESOURCE_SOURCE_LABEL_INVALID' &&
          item.path ===
            'data.resources[0].schema.fields[2].source.labelField'
      )
  );
});

test('allows a serial number beside a text resource label', () => {
  const declaration = structuredClone(sourceDeclaration);
  declaration.data!.resources[1]!.fields.push({
    code: 'college_no',
    type: 'serial-number',
    label: 'College number',
    serial: { prefix: 'COL-', digits: 6, start: 1 },
  });
  const source = declaration.data!.resources[0]!.fields.find(
    field => field.code === 'college_id'
  )!.source!;
  source.searchFields = ['name', 'college_no'];
  source.descriptionFields = ['college_no'];
  source.snapshotFields = ['college_no'];

  assert.doesNotThrow(() => defineOpenXiangdaApp(declaration));
});

test('default surface maps every native field type to the standard control kit', () => {
  const fields = [
    { code: 'title', type: 'text.short' as const },
    { code: 'notes', type: 'text.long' as const },
    { code: 'count', type: 'number.integer' as const },
    { code: 'ratio', type: 'number.decimal' as const },
    { code: 'enabled', type: 'boolean' as const },
    { code: 'startsOn', type: 'date' as const },
    { code: 'startsAt', type: 'datetime' as const },
    { code: 'attachment', type: 'file' as const, file: { maxCount: 3, accept: ['image/*'] } },
    { code: 'metadata', type: 'json' as const },
    { code: 'ownerId', type: 'user.single' as const },
  ];
  const resource = {
    schemaVersion: SCHEMA_VERSIONS.dataResource,
    appCode: 'reference-app',
    code: 'surface-mapping',
    name: 'Surface mapping',
    schema: { fields },
    capabilities: {
      read: 'app:reference-app:data:surface-mapping:read',
      create: 'app:reference-app:data:surface-mapping:create',
      update: 'app:reference-app:data:surface-mapping:update',
      delete: 'app:reference-app:data:surface-mapping:delete',
    },
    fieldPolicies: {},
  } as const;
  const compiled = compileApplicationSources({
    ...source,
    data: { resources: [resource] },
    authz: { capabilities: [], roles: [], scopeDimensions: [], scopeSources: [], dataPolicies: [] },
  });
  const surfaces = compiled.contracts.typescript.slice(
    compiled.contracts.typescript.indexOf('export const resourceSurfaces'),
    compiled.contracts.typescript.indexOf('export const resourceDefinitions'),
  );
  for (const [field, widget] of [
    ['title', 'text'],
    ['notes', 'textarea'],
    ['count', 'number'],
    ['ratio', 'number'],
    ['enabled', 'switch'],
    ['startsOn', 'date'],
    ['startsAt', 'datetime'],
    ['attachment', 'attachment'],
    ['metadata', 'json'],
    ['ownerId', 'directory-user'],
  ]) {
    assert.match(surfaces, new RegExp(`"${field}"[\\s\\S]*?"widget": "${widget}"`));
  }
  assert.match(surfaces, /"attachment"[\s\S]*?"maxCount": 3/);
});

test('authored resource fields resolve every standard widget before rendering', () => {
  const fields = [
    { code: 'title', type: 'text.short' as const, label: 'Title' },
    { code: 'notes', type: 'text.long' as const, label: 'Notes' },
    { code: 'count', type: 'number.integer' as const, label: 'Count' },
    { code: 'ratio', type: 'number.decimal' as const, label: 'Ratio' },
    {
      code: 'amount',
      type: 'number.decimal' as const,
      label: 'Amount',
      widget: 'money' as const,
    },
    { code: 'enabled', type: 'boolean' as const, label: 'Enabled' },
    { code: 'startsOn', type: 'date' as const, label: 'Starts on' },
    { code: 'startsAt', type: 'datetime' as const, label: 'Starts at' },
    {
      code: 'attachment',
      type: 'file' as const,
      label: 'Attachment',
      file: { maxCount: 3, accept: ['image/*'] },
    },
    { code: 'metadata', type: 'json' as const, label: 'Metadata' },
    { code: 'externalId', type: 'uuid' as const, label: 'External ID' },
    {
      code: 'ownerId',
      type: 'user.single' as const,
      label: 'Owner',
    },
  ];
  const application = defineOpenXiangdaApp({
    ...sourceDeclaration,
    data: {
      resources: [
        ...sourceDeclaration.data!.resources,
        {
          code: 'authored-surface-mapping',
          name: 'Authored surface mapping',
          fields,
        },
      ],
    },
  });
  const compiled = compileApplicationSources(application);
  const surfaces = JSON.parse(
    compiled.contracts.typescript.match(
      /export const resourceSurfaces = ([\s\S]*?) as const;/
    )![1]!
  );
  const surface = surfaces['authored-surface-mapping'];
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(surface.fields).map(([code, field]: [string, any]) => [
        code,
        field.widget,
      ])
    ),
    {
      amount: 'money',
      attachment: 'attachment',
      count: 'number',
      enabled: 'switch',
      externalId: 'readonly',
      metadata: 'json',
      notes: 'textarea',
      ownerId: 'directory-user',
      ratio: 'number',
      startsAt: 'datetime',
      startsOn: 'date',
      title: 'text',
    }
  );
  assert.ok(
    Object.values(surface.fields).every(
      (field: any) => typeof field.widget === 'string'
    ),
    'resolved Surface fields must never delegate widget inference to the renderer'
  );
});

test('validates native-resource scope value sources against the same bundle', () => {
  const invalidDimensions = [
    [
      {
        ...source.authz!.scopeDimensions![0]!,
        valueType: 'string',
      },
      'APP_CONFIG_AUTHZ_DIMENSION_VALUE_SOURCE_INVALID',
    ],
    [
      {
        ...source.authz!.scopeDimensions![0]!,
        valueSource: {
          ...source.authz!.scopeDimensions![0]!.valueSource!,
          resourceCode: 'missing-colleges',
        },
      },
      'APP_CONFIG_AUTHZ_DIMENSION_VALUE_SOURCE_RESOURCE_INVALID',
    ],
    [
      {
        ...source.authz!.scopeDimensions![0]!,
        valueSource: {
          ...source.authz!.scopeDimensions![0]!.valueSource!,
          labelField: 'enabled',
        },
      },
      'APP_CONFIG_AUTHZ_DIMENSION_VALUE_SOURCE_FIELD_INVALID',
    ],
    [
      {
        ...source.authz!.scopeDimensions![0]!,
        valueSource: {
          ...source.authz!.scopeDimensions![0]!.valueSource!,
          enabledField: 'name',
        },
      },
      'APP_CONFIG_AUTHZ_DIMENSION_VALUE_SOURCE_FIELD_INVALID',
    ],
    [
      {
        ...source.authz!.scopeDimensions![0]!,
        valueSource: {
          ...source.authz!.scopeDimensions![0]!.valueSource!,
          hiddenFallback: 'college-demo',
        },
      },
      'APP_CONFIG_AUTHZ_DIMENSION_VALUE_SOURCE_INVALID',
    ],
  ] as const;

  for (const [dimension, expectedCode] of invalidDimensions) {
    assert.throws(
      () =>
        defineOpenXiangdaApp({
          ...sourceDeclaration,
          authz: {
            ...source.authz!,
            scopeDimensions: [dimension],
          },
        } as any),
      (error: any) =>
        error?.diagnostics?.some(
          (item: any) => item.code === expectedCode
        )
    );
  }
});

test('closes current-user policies over member semantic fields', () => {
  const multipleOwner = structuredClone(sourceDeclaration);
  const owner = multipleOwner.data!.resources[0]!.fields.find(
    field => field.code === 'owner'
  )!;
  owner.type = 'user.multiple';
  assert.doesNotThrow(() => defineOpenXiangdaApp(multipleOwner));

  const invalidOwner = structuredClone(sourceDeclaration);
  invalidOwner.data!.resources[0]!.fields.find(
    field => field.code === 'owner'
  )!.type = 'text.short';
  assert.throws(
    () => defineOpenXiangdaApp(invalidOwner),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_AUTHZ_POLICY_CURRENT_USER_FIELD_INVALID'
      )
  );
});

test('requires one bidirectional data-policy resource binding', () => {
  const wrongTarget = structuredClone(sourceDeclaration);
  wrongTarget.authz!.dataPolicies![0]!.resourceCode = 'colleges';
  assert.throws(
    () => defineOpenXiangdaApp(wrongTarget),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_AUTHZ_POLICY_RESOURCE_BINDING_INVALID'
      )
  );

  const unbound = structuredClone(sourceDeclaration);
  delete unbound.data!.resources[0]!.dataPolicyCode;
  assert.throws(
    () => defineOpenXiangdaApp(unbound),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_AUTHZ_POLICY_RESOURCE_BINDING_INVALID'
      )
  );
});

test('validates dimension value and declared resource snapshot paths', () => {
  const missingValuePath = structuredClone(sourceDeclaration);
  const dimensionRule = missingValuePath.authz!.dataPolicies![0]!.rules[1] as any;
  delete dimensionRule.valuePath;
  assert.throws(
    () => defineOpenXiangdaApp(missingValuePath),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_AUTHZ_POLICY_FIELD_PATH_INVALID'
      )
  );

  const declaredSnapshot = structuredClone(sourceDeclaration);
  declaredSnapshot.data!.resources[1]!.fields.push({
    code: 'college_code',
    type: 'text.short',
    label: 'College code',
    required: true,
  });
  const collegeField = declaredSnapshot.data!.resources[0]!.fields.find(
    field => field.code === 'college_id'
  )!;
  collegeField.source = {
    ...collegeField.source!,
    snapshotFields: ['college_code'],
  };
  declaredSnapshot.authz!.scopeDimensions!.push({
    code: 'college_code',
    name: 'College code',
    valueType: 'string',
    hierarchyMode: 'flat',
  });
  const snapshotRule = declaredSnapshot.authz!.dataPolicies![0]!.rules[1] as any;
  snapshotRule.dimensionCode = 'college_code';
  snapshotRule.valuePath = 'snapshot.college_code';
  assert.doesNotThrow(() => defineOpenXiangdaApp(declaredSnapshot));

  const undeclaredSnapshot = structuredClone(declaredSnapshot);
  delete undeclaredSnapshot.data!.resources[0]!.fields.find(
    field => field.code === 'college_id'
  )!.source!.snapshotFields;
  assert.throws(
    () => defineOpenXiangdaApp(undeclaredSnapshot),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_AUTHZ_POLICY_FIELD_PATH_INVALID'
      )
  );
});

test('compiles exact, descendant, and unrestricted college role declarations', () => {
  const declaration = structuredClone(sourceDeclaration);
  declaration.authz!.roles.push({
    code: 'school_admin',
    name: 'School administrator',
    capabilities: [
      'app:reference-app:data:instruments:read',
      'app:reference-app:data:instruments:update',
    ],
  });
  declaration.authz!.scopeDimensions![0]!.hierarchyMode = 'self_parent';
  declaration.data!.resources[2]!.fields.push({
    code: 'parent_college_id',
    type: 'resource-ref.single',
    label: 'Parent college',
    source: {
      kind: 'resource',
      resourceCode: 'colleges',
      labelField: 'name',
    },
  });
  declaration.authz!.scopeSources![0]!.grants[0]!.parentValueField =
    'parent_college_id.value';
  declaration.authz!.dataPolicies![0]!.unrestrictedRoleCodes = ['school_admin'];

  const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration));
  assert.equal(
    compiled.config.value.authz.scopeDimensions[0]?.hierarchyMode,
    'self_parent'
  );
  assert.equal(
    compiled.config.value.authz.scopeSources[0]?.grants[0]?.parentValueField,
    'parent_college_id.value'
  );
  assert.deepEqual(
    compiled.config.value.authz.dataPolicies[0]?.unrestrictedRoleCodes,
    ['school_admin']
  );
  assert.equal(
    compiled.config.value.authz.dataPolicies[0]?.rules[1]?.valuePath,
    'value'
  );
});

test('compiles standard authorization projections and rejects unsafe mappings', () => {
  const compiled = compileApplicationSources(source);
  assert.deepEqual(compiled.config.value.authz.roleMembershipSources, [
    sourceDeclaration.authz!.roleMembershipSources![0],
  ]);
  assert.deepEqual(compiled.config.value.authz.relationshipGrantSources, [
    sourceDeclaration.authz!.relationshipGrantSources![0],
  ]);

  for (const [mutate, code] of [
    [
      (value: OpenXiangdaAppDeclaration) => {
        value.authz!.roleMembershipSources![0]!.roleCode = 'missing-role';
      },
      'APP_CONFIG_AUTHZ_ROLE_MEMBERSHIP_SOURCE_INVALID',
    ],
    [
      (value: OpenXiangdaAppDeclaration) => {
        value.authz!.relationshipGrantSources![0]!.targetResourceCode =
          'instruments';
      },
      'APP_CONFIG_AUTHZ_RELATIONSHIP_GRANT_SOURCE_INVALID',
    ],
    [
      (value: OpenXiangdaAppDeclaration) => {
        value.authz!.relationshipGrantSources![0]!.code =
          value.authz!.roleMembershipSources![0]!.code;
      },
      'APP_CONFIG_AUTHZ_RELATIONSHIP_GRANT_SOURCE_INVALID',
    ],
    [
      (value: OpenXiangdaAppDeclaration) => {
        value.authz!.relationshipGrantSources![0]!.operations = [];
      },
      'APP_CONFIG_AUTHZ_RELATIONSHIP_GRANT_SOURCE_INVALID',
    ],
    [
      (value: OpenXiangdaAppDeclaration) => {
        value.authz!.relationshipGrantSources![0]!.resourceIdField = 'id';
      },
      'APP_CONFIG_AUTHZ_RELATIONSHIP_GRANT_SOURCE_INVALID',
    ],
  ] as const) {
    const invalid = structuredClone(sourceDeclaration);
    mutate(invalid);
    assert.throws(
      () => defineOpenXiangdaApp(invalid),
      (error: any) =>
        error?.diagnostics?.some((item: any) => item.code === code)
    );
  }

  const unknownKey = structuredClone(sourceDeclaration) as any;
  unknownKey.authz.roleMembershipSources[0].sql = 'SELECT *';
  assert.throws(
    () => defineOpenXiangdaApp(unknownKey),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) => item.code === 'APP_CONFIG_SCHEMA_INVALID'
      )
  );
});

test('compiles one authenticated-user role and rejects invalid ownership', () => {
  const declaration = structuredClone(sourceDeclaration);
  declaration.authz!.authenticatedUserRoleCode = 'instrument_admin';
  declaration.authz!.roleMembershipSources = [];

  const compiled = compileApplicationSources(
    defineOpenXiangdaApp(declaration)
  );
  assert.equal(
    compiled.config.value.authz.authenticatedUserRoleCode,
    'instrument_admin'
  );

  const missingRole = structuredClone(declaration);
  missingRole.authz!.authenticatedUserRoleCode = 'missing-role';
  assert.throws(
    () => defineOpenXiangdaApp(missingRole),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_AUTHENTICATED_USER_ROLE_INVALID',
        'authz.authenticatedUserRoleCode'
      )
  );

  const projectedRole = structuredClone(sourceDeclaration);
  projectedRole.authz!.authenticatedUserRoleCode = 'instrument_admin';
  assert.throws(
    () => defineOpenXiangdaApp(projectedRole),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_AUTHENTICATED_USER_ROLE_SOURCE_CONFLICT',
        'authz.roleMembershipSources[0].roleCode'
      )
  );
});

test('automatically requires the indivisible Native golden CRUD capability', () => {
  const compile = () =>
    compileAppPackage({
      config: source,
      version: '2.0.0-test.1',
      createdAt: '2026-08-21T00:00:00.000Z',
      source: {
        repository: 'https://example.invalid/reference-app.git',
        commit: '0123456789abcdef',
        dirty: false,
      },
      toolchainVersion: '2.0.0-test',
      artifacts: [],
      manifests: {},
      minimumPlatformVersion: '2.0.0-alpha.1',
    });
  const first = compile();
  const second = compile();
  assert.equal(first.digest, second.digest);
  assert.equal(
    first.manifest.compatibility.requiredPlatformCapabilities.some(
      item => item.code === NATIVE_GOLDEN_CRUD_CAPABILITY
    ),
    true
  );

  const withoutNativeData = defineOpenXiangdaApp({
    ...sourceDeclaration,
    authz: {
      capabilities: [],
      roles: [],
      scopeDimensions: [],
      scopeSources: [],
      dataPolicies: [],
    },
    data: { resources: [] },
  });
  assert.equal(
    requiredPlatformCapabilities(withoutNativeData).some(
      item => item.code === NATIVE_GOLDEN_CRUD_CAPABILITY
    ),
    false
  );
});

test('rejects application-authored platform capability requirements', () => {
  const malformed = structuredClone(sourceDeclaration) as any;
  malformed.platform.requiredCapabilities = ['data.batch-query'];
  assert.throws(
    () => defineOpenXiangdaApp(malformed),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_PLATFORM_PROPERTY_UNSUPPORTED' &&
          item.path === 'platform.requiredCapabilities'
      )
  );
});

test('keeps secret descriptors out of platform capability usage digests', () => {
  const withoutSecret = defineOpenXiangdaApp({
    ...sourceDeclaration,
    backend: {
      ...sourceDeclaration.backend,
      enabled: true,
      isolation: 'shared',
      resourceProfile: 'light',
    },
  });
  const withSecret = defineOpenXiangdaApp({
    ...sourceDeclaration,
    backend: {
      ...sourceDeclaration.backend,
      enabled: true,
      isolation: 'shared',
      resourceProfile: 'light',
      secrets: [
        {
          name: 'provider-credential',
          env: 'PROVIDER_CREDENTIAL',
          required: true,
        },
      ],
    },
  });

  assert.deepEqual(
    requiredPlatformCapabilities(withSecret),
    requiredPlatformCapabilities(withoutSecret)
  );
  assert.equal(
    JSON.stringify(requiredPlatformCapabilities(withSecret)).includes(
      'PROVIDER_CREDENTIAL'
    ),
    false
  );
});

test('binds resource schema digests to normalized config artifact bytes', () => {
  const withFileAcceptOrder = defineOpenXiangdaApp({
    ...sourceDeclaration,
    data: {
      resources: [
        {
          ...sourceDeclaration.data!.resources[0]!,
          fields: [
            ...sourceDeclaration.data!.resources[0]!.fields,
            {
              code: 'attachments',
              type: 'file',
              label: 'Attachments',
              file: { accept: ['image/*', '.pdf', '.doc'] },
            },
          ],
        },
        ...sourceDeclaration.data!.resources.slice(1),
      ],
    },
  });
  const compiled = compileApplicationSources(withFileAcceptOrder);
  const compiledInstrument = compiled.config.value.data.resources.find(
    item => item.code === 'instruments'
  )!;
  const compiledInstrumentContract = compiled.contracts.value.resources.find(
    item => item.code === 'instruments'
  )!;
  assert.deepEqual(
    compiledInstrument.schema.fields.find(field => field.code === 'attachments')
      ?.file?.accept,
    ['.doc', '.pdf', 'image/*']
  );
  assert.equal(
    compiledInstrumentContract.schemaDigest,
    sha256Digest(compiledInstrument.schema)
  );
});

test('projects one canonical resource source into schema and Surface', () => {
  const declaration = structuredClone(sourceDeclaration);
  declaration.data!.resources[1]!.fields.push(
    { code: 'priority', type: 'text.short', label: 'Priority' },
    { code: 'status', type: 'text.short', label: 'Status' }
  );
  const sourceField = declaration.data!.resources[0]!.fields.find(
    field => field.code === 'college_id'
  )!;
  sourceField.source = {
    ...sourceField.source!,
    searchFields: ['status', 'name'],
    descriptionFields: ['status', 'priority'],
    snapshotFields: ['name', 'status', 'priority'],
    pageSize: 20,
    loadMode: 'search',
  };

  const compiled = compileApplicationSources(
    defineOpenXiangdaApp(declaration)
  );
  const instrument = compiled.config.value.data.resources.find(
    item => item.code === 'instruments'
  )!;
  const schemaSource = instrument.schema.fields.find(
    field => field.code === 'college_id'
  )!.source;
  const surfaceSource = instrument.surface!.fields.college_id!.source;

  assert.deepEqual(schemaSource, surfaceSource);
  assert.deepEqual(schemaSource?.descriptionFields, ['status', 'priority']);
  assert.deepEqual(schemaSource?.snapshotFields, [
    'name',
    'status',
    'priority',
  ]);
});

test('canonicalizes operation-aware field policies and unrestricted roles', () => {
  const capabilityA = 'app:reference-app:field:name:create-a';
  const capabilityB = 'app:reference-app:field:name:create-b';
  const updateCapability = 'app:reference-app:field:name:update';
  const compile = (createCapabilities: string[]) =>
    compileApplicationSources(
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        authz: {
          ...source.authz!,
          dataPolicies: source.authz!.dataPolicies!.map(policy => ({
            ...policy,
            unrestrictedRoleCodes: ['instrument_admin'],
          })),
        },
        data: {
          resources: [
            {
              ...sourceDeclaration.data!.resources[0]!,
              fields: sourceDeclaration.data!.resources[0]!.fields.map(field =>
                field.code === 'name'
                  ? {
                      ...field,
                      access: {
                        create: createCapabilities,
                        update: [updateCapability],
                      },
                    }
                  : field
              ),
            },
            ...sourceDeclaration.data!.resources.slice(1),
          ],
        },
      })
    );
  const first = compile([capabilityB, capabilityA]);
  const second = compile([capabilityA, capabilityB]);
  assert.equal(first.config.digest, second.config.digest);
  assert.deepEqual(
    first.config.value.data.resources.find(item => item.code === 'instruments')
      ?.fieldPolicies.name,
    {
      read: ['app:reference-app:data:instruments:read'],
      create: [capabilityA, capabilityB],
      update: [updateCapability],
    }
  );
  assert.deepEqual(
    first.config.value.authz.dataPolicies[0]?.unrestrictedRoleCodes,
    ['instrument_admin']
  );
  assert.equal(
    first.contracts.value.capabilities.some(item => item.code === capabilityA),
    true
  );
});

test('uses a canonical field owner across declaration order and config reparsing', () => {
  const first = compileApplicationSources(
    sharedFieldApplication(['instrumentCode', 'assetCode'])
  );
  const second = compileApplicationSources(
    sharedFieldApplication(['assetCode', 'instrumentCode'])
  );
  const expected = {
    code: sharedFieldCapability,
    kind: 'data' as const,
    name: 'Instruments.assetCode.update',
    source: 'data' as const,
  };
  assert.deepEqual(
    first.contracts.value.capabilities.find(
      item => item.code === sharedFieldCapability
    ),
    expected
  );
  assert.deepEqual(
    second.contracts.value.capabilities.find(
      item => item.code === sharedFieldCapability
    ),
    expected
  );
  assert.deepEqual(
    first.contracts.value.capabilities,
    second.contracts.value.capabilities
  );

  const firstSurface = first.config.value.data.resources.find(
    item => item.code === 'instruments'
  )?.surface;
  const secondSurface = second.config.value.data.resources.find(
    item => item.code === 'instruments'
  )?.surface;
  assert.deepEqual(firstSurface?.form?.fieldOrder?.slice(0, 2), [
    'instrumentCode',
    'assetCode',
  ]);
  assert.deepEqual(secondSurface?.form?.fieldOrder?.slice(0, 2), [
    'assetCode',
    'instrumentCode',
  ]);
  assert.deepEqual(firstSurface?.detail?.fieldOrder, firstSurface?.form?.fieldOrder);
  assert.deepEqual(
    secondSurface?.detail?.fieldOrder,
    secondSurface?.form?.fieldOrder
  );

  assert.deepEqual(
    rebuildDataCapabilityFromConfigArtifact(
      canonicalJson(JSON.parse(canonicalJson(first.config.value))),
      sharedFieldCapability
    ),
    expected,
    'canonical serialize/parse must preserve the platform capability entry'
  );
  assert.deepEqual(
    rebuildDataCapabilityFromConfigArtifact(
      first.config.content,
      sharedFieldCapability
    ),
    expected,
    'platform-style recompilation of the client config artifact must close'
  );
});

test('uses the verifier operation order when one field reuses a code', () => {
  const sharedOperationCapability =
    'app:reference-app:instrument:shared-operation';
  const application = defineOpenXiangdaApp({
    ...sourceDeclaration,
    data: {
      resources: [
        {
          ...sourceDeclaration.data!.resources[0]!,
          fields: [
            {
              code: 'name',
              type: 'text.short',
              label: 'Name',
              access: {
                read: [sharedOperationCapability],
                update: [sharedOperationCapability],
              },
            },
            ...sourceDeclaration.data!.resources[0]!.fields.filter(field =>
              ['owner', 'college_id'].includes(field.code)
            ),
          ],
        },
        ...sourceDeclaration.data!.resources.slice(1),
      ],
    },
  });
  const compiled = compileApplicationSources(application);
  const expected = {
    code: sharedOperationCapability,
    kind: 'data' as const,
    name: 'Instruments.name.read',
    source: 'data' as const,
  };
  assert.deepEqual(
    compiled.contracts.value.capabilities.find(
      item => item.code === sharedOperationCapability
    ),
    expected
  );
  assert.deepEqual(
    rebuildDataCapabilityFromConfigArtifact(
      compiled.config.content,
      sharedOperationCapability
    ),
    expected
  );
});

test('rejects undeclared unrestricted data-policy roles', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        authz: {
          ...source.authz!,
          dataPolicies: source.authz!.dataPolicies!.map(policy => ({
            ...policy,
            unrestrictedRoleCodes: ['school_admin'],
          })),
        },
      }),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_AUTHZ_POLICY_UNRESTRICTED_ROLE_INVALID'
      )
  );
});

test('compiles backend Secret declarations without values', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp({
      ...sourceDeclaration,
      backend: {
        ...source.backend,
        enabled: true,
        secrets: [
          {
            name: 'dingtalk-client-secret',
            env: 'DINGTALK_CLIENT_SECRET',
            description: '钉钉应用密钥',
            required: true,
          },
        ],
      },
    })
  );
  assert.deepEqual(compiled.config.value.backend.secrets, [
    {
      name: 'dingtalk-client-secret',
      env: 'DINGTALK_CLIENT_SECRET',
      description: '钉钉应用密钥',
      required: true,
      exposure: 'active_only',
    },
  ]);
  assert.equal(compiled.config.content.includes('secret-value'), false);
});

test('rejects duplicate and platform-reserved backend Secret env names', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        backend: {
          ...source.backend,
          secrets: [
            { name: 'first-secret', env: 'OPENXIANGDA_APP_CODE' },
            { name: 'first-secret', env: 'OPENXIANGDA_APP_CODE' },
          ],
        },
      }),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) => item.code === 'APP_CONFIG_BACKEND_SECRET_ENV_INVALID'
      ) &&
      error?.diagnostics?.some(
        (item: any) => item.code === 'APP_CONFIG_BACKEND_SECRET_DUPLICATE'
      )
  );
});

test('compiles explicit operation and route contracts into one closed catalog', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp({
      ...sourceDeclaration,
      authz: {
        ...source.authz!,
        capabilities: [
          {
            code: 'app:reference-app:reservation:create',
            kind: 'backend',
            name: 'Create reservation',
          },
          {
            code: 'app:reference-app:operations:read',
            kind: 'ui',
            name: 'Read operations',
          },
        ],
      },
      backend: {
        ...source.backend,
        enabled: true,
        operations: [
          {
            code: 'reservation.create',
            method: 'POST',
            path: '/api/reservations',
            capability: 'app:reference-app:reservation:create',
            requestSchema: { type: 'object', required: ['instrumentId'] },
            responseSchema: { type: 'object' },
            platformAccess: {
              directory: {
                mode: 'current-initiator',
                fields: ['primaryDepartment', 'displayName'],
              },
            },
          },
        ],
      },
      frontend: {
        ...source.frontend,
        routes: [
          {
            code: 'operations',
            path: '/admin/operations',
            label: 'Operations',
            surface: 'admin',
            capability: 'app:reference-app:operations:read',
          },
          {
            code: 'audit',
            path: '/admin/audit',
            label: 'Audit',
            surface: 'admin',
            access: {
              anyOf: [
                'app:role:read',
                'app:reference-app:operations:read',
              ],
            },
          },
        ],
      },
    })
  );
  assert.equal(compiled.config.value.schemaVersion, 'openxiangda.config-bundle/v3');
  assert.equal(compiled.contracts.value.schemaVersion, 'openxiangda.contract-bundle/v3');
  assert.equal(compiled.contracts.value.configDigest, compiled.config.digest);
  assert.equal(
    compiled.contracts.value.operations[0]?.requiredCapability,
    'app:reference-app:reservation:create'
  );
  assert.deepEqual(
    compiled.contracts.value.operations[0]?.platformAccess?.directory,
    {
      mode: 'current-initiator',
      fields: ['displayName', 'primaryDepartment'],
    }
  );
  assert.equal(
    compiled.contracts.value.routes.find(route => route.code === 'operations')
      ?.capability,
    'app:reference-app:operations:read'
  );
  assert.match(
    compiled.contracts.typescript,
    /export type AppRouteCode = AppRoute\["code"\];/
  );
  assert.deepEqual(
    compiled.contracts.value.routes.map(route => [
      route.code,
      route.tabPersistence,
      route.keepAlive,
    ]),
    [
      ['audit', 'session', 'none'],
      ['operations', 'session', 'none'],
    ]
  );
  assert.deepEqual(
    compiled.contracts.value.routes.find(route => route.code === 'audit')?.access,
    {
      anyOf: [
        'app:reference-app:operations:read',
        'app:role:read',
      ],
    }
  );
  assert.match(compiled.contracts.typescript, /appOperations/);
  assert.match(compiled.contracts.typescript, /appRoutes/);
});

test('rejects unbounded or undeclared operation platform dependencies', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        backend: {
          ...source.backend,
          operations: [
            {
              code: 'reservation.create',
              method: 'POST',
              path: '/api/reservations',
              capability: 'app:reference-app:reservation:create',
              requestSchema: { type: 'object' },
              responseSchema: { type: 'object' },
              platformAccess: {
                directory: {
                  mode: 'current-initiator',
                  fields: ['mobile'],
                },
                managedFiles: [
                  {
                    resourceCode: 'missing-resource',
                    fieldCodes: ['privateAttachment'],
                    intents: ['create', 'delete'],
                  },
                ],
              },
            },
          ],
        },
      } as any),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code ===
          'APP_CONFIG_BACKEND_OPERATION_PLATFORM_ACCESS_INVALID'
      )
  );
});

test('compiles authentication surfaces outside protected application routes', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp({
      ...sourceDeclaration,
      frontend: {
        ...source.frontend,
        routes: [
          {
            code: 'home',
            path: '/home',
            label: 'Home',
            surface: 'user',
          },
          {
            code: 'mobile-home',
            path: '/m/home',
            label: 'Mobile home',
            surface: 'user',
          },
        ],
        authentication: {
          accountMode: 'existing-platform-users-only',
          registration: { mode: 'reject' },
          methods: [
            {
              code: 'campus-sso',
              type: 'sso',
              label: 'Campus SSO',
              presentation: 'primary',
              required: true,
              provider: 'tenant-default',
            },
            {
              code: 'account-password',
              type: 'password',
              label: 'Account password',
              presentation: 'secondary',
              required: true,
            },
            {
              code: 'dingtalk-auto',
              type: 'dingtalk',
              label: 'DingTalk',
              presentation: 'secondary',
              required: false,
              flow: 'auto',
            },
          ],
          surfaces: {
            desktop: {
              routeCode: 'application-login',
              path: '/login',
              defaultRouteCode: 'home',
            },
            mobile: {
              routeCode: 'application-mobile-login',
              path: '/m/login',
              defaultRouteCode: 'mobile-home',
            },
          },
        },
      },
    })
  );
  assert.equal(compiled.contracts.value.routes.length, 2);
  assert.equal(compiled.contracts.value.authentication?.methods.length, 3);
  assert.equal(
    compiled.contracts.value.authentication?.surfaces.mobile.path,
    '/m/login'
  );
  assert.match(compiled.contracts.typescript, /authenticationSurfaces/);
  assert.match(compiled.contracts.typescript, /applicationAuthentication/);
  assert.match(
    compiled.contracts.typescript,
    /platformAuthManifest = \{[\s\S]*openxiangda\.platform-auth-manifest\/v2[\s\S]*protectedUserRouteCount": 2/
  );
  assert.doesNotMatch(
    compiled.contracts.typescript,
    /appRoutes[^;]+application-login/
  );
});

test('compiles bounded anonymous public access with own-record history', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp({
      ...sourceDeclaration,
      frontend: {
        ...sourceDeclaration.frontend,
        routes: [
          {
            code: 'instrument-apply',
            path: '/instrument/apply',
            label: 'Instrument application',
            surface: 'user',
          },
        ],
        publicAccess: {
          policies: [
            {
              code: 'instrument-apply-public',
              routeCode: 'instrument-apply',
              mode: 'anonymous',
              resourceCode: 'instruments',
              operations: [
                'own.read',
                'create',
                'draft.update',
                'own.list',
                'draft.read',
                'validate',
              ],
              fields: ['owner', 'name', 'college_id'],
              requiredFields: ['owner', 'name', 'college_id'],
              ownRecordFields: ['name', 'college_id'],
              draft: { enabled: true },
              validations: [
                {
                  code: 'name-unused',
                  kind: 'duplicate',
                  fields: ['name'],
                  result: 'availability',
                },
              ],
            },
          ],
        },
      },
    })
  );
  assert.deepEqual(compiled.config.value.frontend.publicAccess, {
    policies: [
      {
        code: 'instrument-apply-public',
        routeCode: 'instrument-apply',
        mode: 'anonymous',
        resourceCode: 'instruments',
        operations: [
          'create',
          'draft.read',
          'draft.update',
          'own.list',
          'own.read',
          'validate',
        ],
        fields: ['college_id', 'name', 'owner'],
        requiredFields: ['college_id', 'name', 'owner'],
        ownRecordFields: ['college_id', 'name'],
        draft: {
          enabled: true,
          inactivityTtlSeconds: 2_592_000,
          maxBytes: 262_144,
        },
        validations: [
          {
            code: 'name-unused',
            kind: 'duplicate',
            fields: ['name'],
            result: 'availability',
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    compiled.contracts.value.publicAccess,
    compiled.config.value.frontend.publicAccess
  );
  assert.match(compiled.contracts.typescript, /anonymousPublicAccess/);
});

test('compiles explicit anonymous public record reads with a separate field projection', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp({
      ...sourceDeclaration,
      frontend: {
        ...sourceDeclaration.frontend,
        routes: [
          {
            code: 'instrument-catalog',
            path: '/instrument/catalog',
            label: 'Instrument catalog',
            surface: 'user',
          },
        ],
        publicAccess: {
          policies: [
            {
              code: 'instrument-catalog-public',
              routeCode: 'instrument-catalog',
              mode: 'anonymous',
              resourceCode: 'instruments',
              operations: ['public.list', 'public.read'],
              fields: ['name', 'college_id'],
              publicRecordFields: ['name'],
            },
          ],
        },
      },
    })
  );
  assert.deepEqual(
    compiled.config.value.frontend.publicAccess?.policies[0],
    {
      code: 'instrument-catalog-public',
      routeCode: 'instrument-catalog',
      mode: 'anonymous',
      resourceCode: 'instruments',
      operations: ['public.list', 'public.read'],
      fields: ['college_id', 'name'],
      publicRecordFields: ['name'],
    }
  );
  assert.match(compiled.contracts.typescript, /publicRecordFields/);
});

test('compiles server-generated anonymous fields without granting caller writes', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp({
      ...sourceDeclaration,
      data: {
        ...sourceDeclaration.data!,
        resources: [
          ...sourceDeclaration.data!.resources,
          {
            code: 'token-records',
            name: 'Token records',
            fields: [
              { code: 'name', type: 'text.short', label: 'Name', required: true },
              { code: 'qrToken', type: 'text.short', label: 'Token' },
            ],
          },
        ],
      },
      frontend: {
        ...sourceDeclaration.frontend,
        routes: [{ code: 'token-submit', path: '/token-submit', label: 'Token submit', surface: 'user' }],
        publicAccess: {
          policies: [{
            code: 'token-submit-public',
            routeCode: 'token-submit',
            mode: 'anonymous',
            resourceCode: 'token-records',
            operations: ['create', 'draft.read', 'draft.update'],
            fields: ['name'],
            requiredFields: ['name'],
            serverGeneratedFields: [{ field: 'qrToken', kind: 'random-token' }],
            draft: { enabled: true },
          }],
        },
      },
    })
  );
  assert.deepEqual(
    compiled.config.value.frontend.publicAccess?.policies[0]?.serverGeneratedFields,
    [{ field: 'qrToken', kind: 'random-token' }]
  );
  assert.deepEqual(
    compiled.config.value.frontend.publicAccess?.policies[0]?.fields,
    ['name']
  );
});

test('allows managed files, images, rich text, and bounded subtable projections', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp({
      ...sourceDeclaration,
      frontend: {
        ...sourceDeclaration.frontend,
        routes: [
          {
            code: 'catalog',
            path: '/catalog',
            label: 'Catalog',
            surface: 'user',
          },
        ],
        publicAccess: {
          policies: [
            {
              code: 'catalog-public',
              routeCode: 'catalog',
              mode: 'anonymous',
              resourceCode: 'catalog-items',
              operations: ['public.list', 'public.read'],
              fields: ['name', 'attachment', 'cover', 'description', 'items'],
              publicRecordFields: ['name', 'attachment', 'cover', 'description', 'items'],
              publicSubtableFields: { items: ['sku', 'quantity'] },
            },
          ],
        },
      },
      data: {
        resources: [
          ...sourceDeclaration.data!.resources,
          {
            code: 'catalog-items',
            name: 'Catalog items',
            fields: [
              { code: 'name', type: 'text.short', label: 'Name' },
              { code: 'attachment', type: 'file', label: 'Attachment' },
              { code: 'cover', type: 'image', label: 'Cover' },
              { code: 'description', type: 'text.rich', label: 'Description' },
              {
                code: 'items',
                type: 'subtable',
                label: 'Items',
                subtable: {
                  resourceCode: 'catalog-lines',
                  foreignKey: 'parent_id',
                  orderField: 'line_order',
                },
              },
            ],
          },
          {
            code: 'catalog-lines',
            name: 'Catalog lines',
            fields: [
              { code: 'parent_id', type: 'uuid', label: 'Parent', required: true },
              { code: 'line_order', type: 'number.integer', label: 'Order', required: true },
              { code: 'sku', type: 'text.short', label: 'SKU' },
              { code: 'quantity', type: 'number.integer', label: 'Quantity' },
            ],
          },
        ],
      },
    })
  );
  const policy = compiled.config.value.frontend.publicAccess?.policies[0];
  assert.deepEqual(policy?.publicSubtableFields, { items: ['quantity', 'sku'] });
  assert.deepEqual(policy?.publicRecordFields, [
    'attachment',
    'cover',
    'description',
    'items',
    'name',
  ]);
});

test('rejects public signatures and nested public subtables', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        frontend: {
          ...sourceDeclaration.frontend,
          routes: [{ code: 'catalog', path: '/catalog', label: 'Catalog', surface: 'user' }],
          publicAccess: {
            policies: [{
              code: 'catalog-public',
              routeCode: 'catalog',
              mode: 'anonymous',
              resourceCode: 'instruments',
              operations: ['public.read'],
              fields: ['name', 'signed'],
              publicRecordFields: ['signed'],
            }],
          },
        },
        data: {
          resources: [{
            ...sourceDeclaration.data!.resources[0]!,
            fields: [
              ...sourceDeclaration.data!.resources[0]!.fields,
              { code: 'signed', type: 'signature', label: 'Signature' },
            ],
          }, ...sourceDeclaration.data!.resources.slice(1)],
        },
      }),
    error => diagnosticOf(error, 'APP_CONFIG_ANONYMOUS_PUBLIC_POLICY_INVALID', 'frontend.publicAccess.policies[0]')
  );
});

test('rejects public reads without explicit scalar public fields', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        frontend: {
          ...sourceDeclaration.frontend,
          routes: [
            {
              code: 'instrument-catalog',
              path: '/instrument/catalog',
              label: 'Instrument catalog',
              surface: 'user',
            },
          ],
          publicAccess: {
            policies: [
              {
                code: 'instrument-catalog-public',
                routeCode: 'instrument-catalog',
                mode: 'anonymous',
                resourceCode: 'instruments',
                operations: ['public.list'],
                fields: ['name'],
              },
            ],
          },
        },
      }),
    error => diagnosticOf(error, 'APP_CONFIG_ANONYMOUS_PUBLIC_POLICY_INVALID', 'frontend.publicAccess.policies[0]')
  );
});

test('rejects anonymous public access that widens route, field, or validation scope', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        frontend: {
          ...sourceDeclaration.frontend,
          routes: [
            {
              code: 'dynamic-public',
              path: '/apply/:id',
              label: 'Dynamic public',
              surface: 'user',
            },
          ],
          publicAccess: {
            policies: [
              {
                code: 'invalid-public',
                routeCode: 'dynamic-public',
                mode: 'anonymous',
                resourceCode: 'instruments',
                operations: ['create', 'own.list'],
                fields: ['missing'],
                validations: [
                  {
                    code: 'probe',
                    kind: 'duplicate',
                    fields: ['owner'],
                    result: 'availability',
                  },
                ],
              },
            ],
          },
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_ANONYMOUS_PUBLIC_POLICY_INVALID',
        'frontend.publicAccess.policies[0]'
      )
  );
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        frontend: {
          ...sourceDeclaration.frontend,
          routes: [
            {
              code: 'protected-public',
              path: '/apply',
              label: 'Protected public',
              surface: 'user',
              capability: 'app:reference:data:instruments:read',
            },
          ],
          publicAccess: {
            policies: [
              {
                code: 'protected-public-policy',
                routeCode: 'protected-public',
                mode: 'anonymous',
                resourceCode: 'instruments',
                operations: ['create'],
                fields: ['name'],
              },
            ],
          },
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_ANONYMOUS_PUBLIC_POLICY_INVALID',
        'frontend.publicAccess.policies[0]'
      )
  );
});

test('rejects duplicate authentication method types and noncanonical login paths', () => {
  const declaration = {
    ...sourceDeclaration,
    frontend: {
      ...source.frontend,
      routes: [
        { code: 'home', path: '/home', label: 'Home', surface: 'user' },
        {
          code: 'mobile-home',
          path: '/m/home',
          label: 'Mobile home',
          surface: 'user',
        },
      ],
      authentication: {
        accountMode: 'existing-platform-users-only',
        registration: { mode: 'reject' },
        methods: [
          {
            code: 'password',
            type: 'password',
            label: 'Password',
            presentation: 'primary',
            required: true,
          },
          {
            code: 'password-again',
            type: 'password',
            label: 'Password again',
            presentation: 'secondary',
            required: false,
          },
        ],
        surfaces: {
          desktop: {
            routeCode: 'application-login',
            path: '/sign-in',
            defaultRouteCode: 'home',
          },
          mobile: {
            routeCode: 'application-mobile-login',
            path: '/m/login',
            defaultRouteCode: 'mobile-home',
          },
        },
      },
    },
  } as const;
  assert.throws(
    () => defineOpenXiangdaApp(declaration),
    (error: any) => {
      const codes = new Set(
        error?.diagnostics?.map((item: any) => item.code) || []
      );
      return (
        codes.has('APP_CONFIG_AUTHENTICATION_METHOD_INVALID') &&
        codes.has('APP_CONFIG_AUTHENTICATION_SURFACE_INVALID')
      );
    }
  );
});

test('fails closed for authentication route collisions and invalid device defaults', () => {
  const declaration = {
    ...sourceDeclaration,
    frontend: {
      ...source.frontend,
      routes: [
        {
          code: 'home',
          path: '/login',
          label: 'Conflicting home',
          surface: 'user',
        },
        {
          code: 'mobile-home',
          path: '/m/home',
          label: 'Mobile home',
          surface: 'user',
        },
      ],
      authentication: {
        accountMode: 'existing-platform-users-only',
        registration: { mode: 'reject' },
        methods: [
          {
            code: 'password',
            type: 'password',
            label: 'Password',
            presentation: 'primary',
            required: true,
          },
        ],
        surfaces: {
          desktop: {
            routeCode: 'application-login',
            path: '/login',
            defaultRouteCode: 'mobile-home',
          },
          mobile: {
            routeCode: 'application-mobile-login',
            path: '/m/login',
            defaultRouteCode: 'home',
          },
        },
      },
    },
  } as const;
  assert.throws(
    () => defineOpenXiangdaApp(declaration),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_AUTHENTICATION_DEFAULT_ROUTE_INVALID' ||
          item.code === 'APP_CONFIG_FRONTEND_ROUTE_PATH_CONFLICT'
      )
  );
});

test('compiles the manifest device policy with the 900px default and validates overrides', () => {
  const defaultCompiled = compileApplicationSources(
    defineOpenXiangdaApp(sourceDeclaration),
  );
  assert.deepEqual(defaultCompiled.config.value.frontend.devicePolicy, {
    kind: 'viewport-family',
    mobileMaxWidthPx: 900,
    desktopMinWidthPx: 901,
  });
  assert.deepEqual(defaultCompiled.contracts.value.routeManifest.devicePolicy, {
    kind: 'viewport-family',
    mobileMaxWidthPx: 900,
    desktopMinWidthPx: 901,
  });

  const custom = compileApplicationSources(
    defineOpenXiangdaApp({
      ...sourceDeclaration,
      frontend: {
        ...sourceDeclaration.frontend,
        devicePolicy: {
          kind: 'viewport-family',
          mobileMaxWidthPx: 767,
          desktopMinWidthPx: 768,
        },
      },
    }),
  );
  assert.equal(custom.contracts.value.routeManifest.devicePolicy.mobileMaxWidthPx, 767);
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        frontend: {
          ...sourceDeclaration.frontend,
          devicePolicy: {
            kind: 'viewport-family',
            mobileMaxWidthPx: 900,
            desktopMinWidthPx: 902,
          },
        },
      }),
    error => diagnosticOf(
      error,
      'APP_CONFIG_FRONTEND_DEVICE_POLICY_INVALID',
      'frontend.devicePolicy',
    ),
  );
});

test('rejects capability references that are missing, cross-app, or platform-reserved declarations', () => {
  for (const config of [
    {
      ...sourceDeclaration,
      frontend: {
        ...source.frontend,
        routes: [
          {
            code: 'missing',
            path: '/missing',
            label: 'Missing',
            surface: 'admin',
            capability: 'app:reference-app:missing:read',
          },
        ],
      },
    },
    {
      ...sourceDeclaration,
      backend: {
        ...source.backend,
        operations: [
          {
            code: 'foreign.read',
            method: 'GET',
            path: '/api/foreign',
            capability: 'app:another-app:data:foreign:read',
            requestSchema: {},
            responseSchema: {},
          },
        ],
      },
    },
  ]) {
    assert.throws(
      () => defineOpenXiangdaApp(config as any),
      (error: any) =>
        error?.diagnostics?.some(
          (item: any) => item.code === 'APP_CONFIG_CAPABILITY_CLOSURE_FAILED'
        )
    );
  }
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        authz: {
          ...source.authz!,
          capabilities: [
            {
              code: 'app:reference-app:directory:read',
              kind: 'backend',
              name: 'Reserved',
            },
          ],
        },
      }),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_AUTHZ_PLATFORM_CAPABILITY_RESERVED'
      )
  );
});

test('rejects ambiguous, empty, duplicate, or unclosed route access expressions', () => {
  const invalidRoutes = [
    {
      code: 'ambiguous',
      path: '/ambiguous',
      label: 'Ambiguous',
      surface: 'admin',
      capability: 'app:role:read',
      access: { allOf: ['app:role:read'] },
    },
    {
      code: 'empty',
      path: '/empty',
      label: 'Empty',
      surface: 'admin',
      access: { anyOf: [] },
    },
    {
      code: 'duplicate',
      path: '/duplicate',
      label: 'Duplicate',
      surface: 'admin',
      access: { allOf: ['app:role:read', 'app:role:read'] },
    },
  ];
  for (const route of invalidRoutes) {
    assert.throws(
      () =>
        defineOpenXiangdaApp({
          ...sourceDeclaration,
          frontend: { ...source.frontend, routes: [route] },
        } as any),
      (error: any) =>
        error?.diagnostics?.some(
          (item: any) => item.code === 'APP_CONFIG_FRONTEND_ROUTE_INVALID'
        )
    );
  }

  for (const route of [
    {
      code: 'dynamic-persisted',
      path: '/items/:id',
      label: 'Dynamic persisted',
      surface: 'admin',
      tabPersistence: 'session',
    },
    {
      code: 'dynamic-cached',
      path: '/items/:id',
      label: 'Dynamic cached',
      surface: 'admin',
      keepAlive: 'memory',
    },
    {
      code: 'legacy-cache',
      path: '/legacy-cache',
      label: 'Legacy cache',
      surface: 'admin',
      cache: false,
    },
  ]) {
    assert.throws(
      () =>
        defineOpenXiangdaApp({
          ...sourceDeclaration,
          frontend: { ...source.frontend, routes: [route] },
        } as any),
      (error: any) =>
        error?.diagnostics?.some(
          (item: any) => item.code === 'APP_CONFIG_FRONTEND_ROUTE_INVALID'
        )
    );
  }

  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        frontend: {
          ...source.frontend,
          routes: [
            {
              code: 'missing',
              path: '/missing',
              label: 'Missing',
              surface: 'admin',
              access: { anyOf: ['app:reference-app:missing:read'] },
            },
          ],
        },
      }),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) => item.code === 'APP_CONFIG_CAPABILITY_CLOSURE_FAILED'
      )
  );
});

test('rejects explicit route shapes owned by generated desktop or mobile surfaces', () => {
  for (const [route, pointer] of [
    [
      {
        code: 'instrument-generated-detail',
        path: '/admin/resources/instruments/:recordId',
        label: 'Instrument detail override',
        surface: 'admin',
      },
      'frontend.routes[0].path',
    ],
    [
      {
        code: 'instrument-generated-mobile-detail',
        path: '/m/admin/resources/instruments/:recordId',
        label: 'Instrument mobile detail override',
        surface: 'user',
      },
      'frontend.routes[0].path',
    ],
  ] as const) {
    assert.throws(
      () =>
        defineOpenXiangdaApp({
          ...sourceDeclaration,
          frontend: { ...source.frontend, routes: [route] },
        }),
      error =>
        diagnosticOf(
          error,
          'APP_CONFIG_FRONTEND_ROUTE_PATH_CONFLICT',
          pointer
        )
    );
  }

  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        frontend: {
          ...source.frontend,
          routes: [
            {
              code: 'first-user-detail',
              path: '/activities/:id',
              label: 'First activity detail',
              surface: 'user',
            },
            {
              code: 'second-user-detail',
              path: '/activities/:activityId',
              label: 'Second activity detail',
              surface: 'user',
            },
          ],
        },
      }),
    error =>
      diagnosticOf(
        error,
        'APP_CONFIG_FRONTEND_ROUTE_PATH_CONFLICT',
        'frontend.routes[1].path'
      )
  );
});

test('rejects capability codes owned by both explicit and generated data catalogs', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        authz: {
          ...source.authz!,
          capabilities: [
            {
              code: 'app:reference-app:data:instruments:read',
              kind: 'backend',
              name: 'Conflicting data capability',
            },
          ],
        },
      }),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) => item.code === 'APP_CONFIG_CAPABILITY_OWNER_CONFLICT'
      )
  );
});

test('keeps one stable data capability definition when a field policy reuses it', () => {
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp({
      ...sourceDeclaration,
      data: {
        resources: [
          {
            ...sourceDeclaration.data!.resources[0]!,
            fields: sourceDeclaration.data!.resources[0]!.fields.map(field =>
              field.code === 'name'
                ? {
                    ...field,
                    access: {
                      read: ['app:reference-app:data:instruments:read'],
                    },
                  }
                : field
            ),
          },
          ...sourceDeclaration.data!.resources.slice(1),
        ],
      },
    })
  );
  assert.deepEqual(
    compiled.contracts.value.capabilities.find(
      item => item.code === 'app:reference-app:data:instruments:read'
    ),
    {
      code: 'app:reference-app:data:instruments:read',
      kind: 'data',
      name: '读取Instruments',
      source: 'data',
    }
  );
});

test('rejects native environment state and legacy super-admin roles', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        backend: {
          ...source.backend,
          environmentId: 'environment-1',
        },
        authz: {
          ...source.authz!,
          roles: [
            {
              code: 'app_super_admin',
              name: 'Legacy super admin',
              capabilities: [],
              isAppSuperAdmin: true,
            },
          ],
        },
      } as any),
    (error: any) => {
      const codes = new Set(
        error?.diagnostics?.map((item: any) => item.code) || []
      );
      return (
        codes.has('APP_CONFIG_NATIVE_RUNTIME_FIELD_FORBIDDEN') &&
        codes.has('APP_CONFIG_AUTHZ_ROLE_INVALID')
      );
    }
  );
});

test('accepts only named backend isolation and resource profiles', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        backend: {
          ...source.backend,
          runMode: 'shared',
          resources: { requests: { cpu: '1' } },
          replicas: 3,
        },
      } as any),
    (error: any) => {
      const paths = new Set(
        error?.diagnostics?.map((item: any) => item.path) || []
      );
      return (
        paths.has('backend.runMode') &&
        paths.has('backend.resources') &&
        paths.has('backend.replicas')
      );
    }
  );
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        backend: {
          ...source.backend,
          isolation: 'shared',
          resourceProfile: 'large',
        },
      } as any),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_BACKEND_RESOURCE_PROFILE_UNSUPPORTED'
      )
  );
});

test('normalizes through an allowlist so undeclared properties cannot enter bundle bytes', () => {
  const raw = {
    ...sourceDeclaration,
    backend: {
      ...source.backend,
      secrets: [
        {
          name: 'mail-key',
          env: 'MAIL_KEY',
          required: true,
          ignoredRuntimeState: 'must-not-leak',
        },
      ],
    },
    data: {
      resources: [
        {
          ...source.data!.resources[0]!,
          ignoredRuntimeState: 'must-not-leak',
        },
      ],
    },
  } as any;
  const diagnostics = validateAppConfig(raw).filter(
    item => item.code === 'APP_CONFIG_NATIVE_RUNTIME_FIELD_FORBIDDEN'
  );
  assert.equal(diagnostics.length, 0);
  const compiled = compileApplicationSources(raw);
  assert.equal(compiled.config.content.includes('ignoredRuntimeState'), false);
  assert.equal(compiled.config.content.includes('must-not-leak'), false);
});

test('rejects non-canonical authorization transitions before materialization', () => {
  const canonical = {
    fromAuthzDigest: 'a'.repeat(64),
    removeRoleCodes: ['retired-role'],
    removeCapabilityCodes: ['app:reference-app:retired-action'],
    reason: ' retired authorization facts ',
  };
  const configured = {
    ...source,
    authz: {
      ...source.authz!,
      authorizationTransitions: [canonical],
    },
  };
  assert.equal(validateAppConfig(configured).length, 0);
  assert.deepEqual(
    compileApplicationSources(configured).config.value.authz
      .authorizationTransitions,
    [
      {
        ...canonical,
        reason: canonical.reason.trim(),
      },
    ]
  );

  for (const [invalid, expectedPath] of [
    [
      { ...canonical, legacyRoleAliases: ['retired-role'] },
      'authz.authorizationTransitions[0].legacyRoleAliases',
    ],
    [
      { ...canonical, removeRoleCodes: 'retired-role' },
      'authz.authorizationTransitions[0]',
    ],
    [
      { ...canonical, removeRoleCodes: ['retired-role', 'retired-role'] },
      'authz.authorizationTransitions[0]',
    ],
    [
      { ...canonical, removeRoleCodes: [`r${'x'.repeat(128)}`] },
      'authz.authorizationTransitions[0]',
    ],
    [
      { ...canonical, removeCapabilityCodes: [42] },
      'authz.authorizationTransitions[0]',
    ],
    [null, 'authz.authorizationTransitions[0]'],
  ] as const) {
    const raw = {
      ...source,
      authz: {
        ...source.authz!,
        authorizationTransitions: [invalid],
      },
    } as any;
    assert.equal(
      validateAppConfig(raw).some(
        item =>
          item.code === 'APP_CONFIG_AUTHZ_TRANSITION_INVALID' &&
          item.path === expectedPath
      ),
      true
    );
    assert.throws(
      () => compileApplicationSources(raw),
      (error: unknown) =>
        diagnosticOf(
          error,
          'APP_CONFIG_AUTHZ_TRANSITION_INVALID',
          'authz.authorizationTransitions[0]'
        )
    );
  }
});

test('rejects policy role conditions that reference an undeclared role', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        authz: {
          ...source.authz!,
          dataPolicies: [
            {
              code: 'invalid_role',
              name: 'Invalid role',
              matchMode: 'AND',
              rules: [
                {
                  subject: 'current_user',
                  field: 'created_by',
                  roleCodes: ['missing_role'],
                },
              ],
            },
          ],
        },
      }),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_AUTHZ_POLICY_ROLE_CODE_INVALID'
      )
  );
});

test('rejects policies that reference an undeclared scope dimension', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        authz: {
          ...source.authz!,
          dataPolicies: [
            {
              code: 'invalid_scope',
              name: 'Invalid scope',
              matchMode: 'AND',
              rules: [{ dimensionCode: 'missing', field: 'college_id' }],
            },
          ],
        },
      }),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) => item.code === 'APP_CONFIG_AUTHZ_POLICY_RULE_INVALID'
      )
  );
});

test('rejects environment overrides inside immutable configuration declarations', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        events: {
          subscriptions: [
            {
              code: 'environment-bound-event',
              eventTypes: ['openxiangda.data.record.created.v2'],
              environmentKey: 'production',
            } as any,
          ],
          timers: [
            {
              code: 'environment-bound-timer',
              eventType: 'reference.timer.v1',
              cronExpression: '0 0 8 * * *',
              timezone: 'Asia/Shanghai',
              environmentKey: 'production',
            } as any,
          ],
        },
      }),
    (error: any) =>
      error?.diagnostics?.filter(
        (item: any) =>
          item.code === 'APP_CONFIG_ENVIRONMENT_OVERRIDE_FORBIDDEN'
      ).length === 2
  );
});

test('rejects source event endpoints because subscription code owns the canonical path', () => {
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...sourceDeclaration,
        events: {
          subscriptions: [
            {
              code: 'instrument-events',
              eventTypes: ['openxiangda.data.record.created.v2'],
              endpointPath: '/events/instruments',
            } as any,
          ],
        },
      }),
    (error: any) =>
      error?.diagnostics?.some(
        (item: any) =>
          item.code === 'APP_CONFIG_EVENT_ENDPOINT_DECLARATION_FORBIDDEN'
      )
  );
});

test('rejects ambiguous, invalid, or over-frequent timer schedules', () => {
  const timerConfig = (cronExpression: string, timezone = 'Asia/Shanghai') => ({
    ...sourceDeclaration,
    events: {
      schemas: [
        {
          eventType: 'reference.timer.v1',
          dataSchemaVersion: '1.0.0',
          jsonSchema: { type: 'object' },
        },
      ],
      subscriptions: [],
      timers: [
        {
          code: 'durable-timer',
          eventType: 'reference.timer.v1',
          cronExpression,
          timezone,
          payload: {},
        },
      ],
    },
  });
  for (const [config, expected] of [
    [timerConfig('* * * * * *'), 'APP_CONFIG_TIMER_FREQUENCY_TOO_HIGH'],
    [timerConfig('0 0 * * *'), 'APP_CONFIG_TIMER_CRON_INVALID'],
    [timerConfig('0 0 8 * * *', 'Not/A-Timezone'), 'APP_CONFIG_TIMER_CRON_INVALID'],
  ] as const) {
    assert.throws(
      () => defineOpenXiangdaApp(config as any),
      (error: any) =>
        error?.diagnostics?.some((item: any) => item.code === expected)
    );
  }
});

test('compiles canonical event v2 filters, projections, producers and handler manifest', () => {
  const configured = defineOpenXiangdaApp({
    ...sourceDeclaration,
    data: {
      resources: sourceDeclaration.data!.resources.map(resource =>
        resource.code === 'instruments'
          ? {
              ...resource,
              fields: [
                ...resource.fields,
                {
                  code: 'maintenance_at',
                  type: 'datetime' as const,
                  label: 'Maintenance at',
                },
              ],
            }
          : resource
      ),
    },
    events: {
      schemas: [
        {
          eventType: 'reference-app.instrument.maintenance-due.v1',
          dataSchemaVersion: '1.0.0',
          jsonSchema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'triggerCode',
              'resourceCode',
              'recordId',
              'recordRevision',
              'field',
              'dueAt',
            ],
            properties: {
              triggerCode: { type: 'string' },
              resourceCode: { type: 'string' },
              recordId: { type: 'string' },
              recordRevision: { type: 'integer', minimum: 1 },
              field: { type: 'string' },
              dueAt: { type: 'string' },
            },
          },
          sensitiveFields: ['dueAt'],
        },
      ],
      subscriptions: [
        {
          code: 'instrument-name-changed',
          eventTypes: ['openxiangda.data.record.updated.v2'],
          filter: {
            resourceCodes: ['instruments'],
            changedFields: { anyOf: ['name'] },
            changes: [{ field: 'name', after: { ne: '' } }],
          },
          payload: { includeChanges: true, fields: ['college_id', 'name'] },
          delivery: { ordering: 'record', concurrency: 4 },
        },
      ],
      timers: [],
      dateTriggers: [
        {
          code: 'maintenance-reminder',
          resourceCode: 'instruments',
          field: 'maintenance_at',
          offset: '-PT1H',
          eventType: 'reference-app.instrument.maintenance-due.v1',
          payload: {},
        },
      ],
    },
  });
  const compiled = compileApplicationSources(configured, 'test-generator');
  assert.deepEqual(compiled.config.value.events.subscriptions[0]?.delivery, {
    timeoutMs: 10_000,
    maxAttempts: 8,
    initialBackoffMs: 1_000,
    maxBackoffMs: 300_000,
    ordering: 'record',
    concurrency: 4,
  });
  assert.equal(
    compiled.contracts.value.eventProducers.some(
      producer =>
        producer.source === 'date' &&
        producer.eventType === 'reference-app.instrument.maintenance-due.v1'
    ),
    true
  );
  assert.deepEqual(compiled.contracts.value.eventHandlerManifest.handlers, [
    {
      code: 'instrument-name-changed',
      endpointPath: '/__platform/events/instrument-name-changed',
      eventTypes: ['openxiangda.data.record.updated.v2'],
      dataSchemaVersions: ['2.0.0'],
      maxBodyBytes: 65_536,
      receiptProtocolVersion: 2,
    },
  ]);
  assert.equal(
    compiled.contracts.value.eventSchemas[0]?.schemaDigest,
    sha256Digest(
      configured.events!.schemas![0]!.jsonSchema
    )
  );
  assert.equal(compiled.contracts.value.eventSchemas[0]?.owner, 'application');
  assert.deepEqual(compiled.contracts.value.eventSchemas[0]?.sensitiveFields, [
    'dueAt',
  ]);
  assert.match(compiled.contracts.typescript, /EventHandlerInput/);
  assert.doesNotMatch(
    compiled.contracts.content,
    /subjectFilters|openxiangda\.data\.record\.(created|updated|deleted)\.v1/
  );
});

test('rejects unregistered event types, unknown capture fields and reserved schemas', () => {
  const invalid = {
    ...sourceDeclaration,
    events: {
      schemas: [
        {
          eventType: 'openxiangda.data.shadow.v2',
          dataSchemaVersion: '2.0.0',
          jsonSchema: { type: 'object' },
        },
      ],
      subscriptions: [
        {
          code: 'invalid-capture',
          eventTypes: ['reference-app.missing.v1'],
          filter: {
            resourceCodes: ['instruments'],
            changedFields: { anyOf: ['missing_field'] },
          },
          payload: { fields: ['missing_field'] },
        },
      ],
    },
  };
  const diagnostics = validateAppConfig(invalid);
  assert.ok(diagnostics.some(item => item.code === 'APP_CONFIG_EVENT_SCHEMA_INVALID'));
  assert.ok(diagnostics.some(item => item.code === 'APP_CONFIG_EVENT_TYPES_INVALID'));
  assert.ok(diagnostics.some(item => item.code === 'APP_CONFIG_EVENT_PROJECTION_INVALID'));
});

test('compiles workflow-instance event delivery ordering without an alias', () => {
  const configured = defineOpenXiangdaApp({
    ...sourceDeclaration,
    events: {
      subscriptions: [
        {
          code: 'workflow-task-events',
          eventTypes: ['openxiangda.workflow.task.approved.v2'],
          delivery: { ordering: 'workflow-instance' },
        },
      ],
    },
  });
  const compiled = compileApplicationSources(configured);
  assert.equal(
    compiled.config.value.events.subscriptions[0]?.delivery.ordering,
    'workflow-instance'
  );
  const withLegacyAlias = structuredClone(configured) as any;
  withLegacyAlias.events.subscriptions[0].delivery.ordering =
    'workflow_instance';
  assert.ok(
    validateAppConfig(withLegacyAlias).some(
      item => item.code === 'APP_CONFIG_EVENT_DELIVERY_POLICY_INVALID'
    )
  );
});

test('closes event-handler notification access in the platform capability contract', () => {
  const configured = defineOpenXiangdaApp({
    ...sourceDeclaration,
    events: {
      subscriptions: [
        {
          code: 'workflow-notification',
          eventTypes: ['openxiangda.workflow.instance.completed.v2'],
          platformAccess: {
            notification: { mode: 'business-standard' },
          },
          delivery: { ordering: 'workflow-instance' },
        },
      ],
    },
  });
  const compiled = compileApplicationSources(configured);
  assert.deepEqual(
    compiled.config.value.events.subscriptions[0]?.platformAccess,
    { notification: { mode: 'business-standard' } }
  );
  assert.deepEqual(
    compiled.contracts.value.eventConsumers[0]?.platformAccess,
    { notification: { mode: 'business-standard' } }
  );
  assert.ok(
    compiled.config.value.runtime.protocolCapabilities.includes(
      'notification-hub-v2'
    )
  );
  assert.ok(
    requiredPlatformCapabilities(configured).some(
      capability => capability.code === 'notification-hub-v2'
    )
  );
});

test('rejects undeclared event-handler platform access', () => {
  const invalid = {
    ...sourceDeclaration,
    events: {
      subscriptions: [
        {
          code: 'workflow-notification',
          eventTypes: ['openxiangda.workflow.instance.completed.v2'],
          platformAccess: {
            notification: { mode: 'custom-template' },
            workflow: { codes: ['instrument-approval'] },
          },
        },
      ],
    },
  };
  assert.ok(
    validateAppConfig(invalid as any).some(
      item => item.code === 'APP_CONFIG_EVENT_PLATFORM_ACCESS_INVALID'
    )
  );
});

test('rejects the removed native date_due event type', () => {
  const invalid = {
    ...sourceDeclaration,
    events: {
      subscriptions: [
        {
          code: 'removed-native-date-due',
          eventTypes: ['openxiangda.data.record.date_due.v2'],
        },
      ],
    },
  };

  const diagnostics = validateAppConfig(invalid);
  assert.ok(
    diagnostics.some(item => item.code === 'APP_CONFIG_EVENT_TYPES_INVALID')
  );
});

test('enforces event filter, capture-plan, schema, timer and date-trigger bounds', () => {
  const eventSchema = {
    eventType: 'reference-app.reminder.due.v1',
    dataSchemaVersion: '1.0.0',
    jsonSchema: { type: 'object' },
  };
  const eventError = (declaration: unknown, code: string) => {
    assert.throws(
      () => defineOpenXiangdaApp(declaration as any),
      (error: any) =>
        error?.diagnostics?.some((item: any) => item.code === code)
    );
  };

  eventError(
    {
      ...sourceDeclaration,
      events: {
        schemas: [eventSchema],
        subscriptions: [
          {
            code: 'too-complex',
            eventTypes: ['openxiangda.data.record.updated.v2'],
            filter: {
              resourceCodes: ['instruments'],
              changes: Array.from({ length: 15 }, () => ({
                field: 'name',
                after: { ne: '' },
              })),
              where: {
                all: [
                  { change: { field: 'name', after: { ne: 'a' } } },
                  { change: { field: 'name', after: { ne: 'b' } } },
                ],
              },
            },
            payload: { fields: [] },
          },
        ],
      },
    },
    'APP_CONFIG_EVENT_FILTER_ATOMS_EXCEEDED'
  );

  eventError(
    {
      ...sourceDeclaration,
      events: {
        schemas: [eventSchema],
        subscriptions: [
          {
            code: 'large-predicate',
            eventTypes: ['openxiangda.data.record.updated.v2'],
            filter: {
              resourceCodes: ['instruments'],
              changes: [
                { field: 'name', after: { in: ['x'.repeat(4096)] } },
              ],
            },
            payload: { fields: [] },
          },
        ],
      },
    },
    'APP_CONFIG_EVENT_CHANGE_FILTER_INVALID'
  );

  const captureFields = Array.from({ length: 65 }, (_, index) => ({
    code: `capture_${index}`,
    type: 'text.short' as const,
    label: `Capture ${index}`,
  }));
  const captureResources = sourceDeclaration.data!.resources.map(resource =>
    resource.code === 'instruments'
      ? { ...resource, fields: [...resource.fields, ...captureFields] }
      : resource
  );
  eventError(
    {
      ...sourceDeclaration,
      data: { resources: captureResources },
      events: {
        schemas: [eventSchema],
        subscriptions: [
          ...[0, 1].map(group => ({
            code: `capture-${group}`,
            eventTypes: ['openxiangda.data.record.updated.v2'],
            filter: { resourceCodes: ['instruments'] },
            payload: {
              fields: captureFields
                .slice(group * 32, group * 32 + 32)
                .map(field => field.code),
            },
          })),
          {
            code: 'capture-2',
            eventTypes: ['openxiangda.data.record.updated.v2'],
            filter: { resourceCodes: ['instruments'] },
            payload: { fields: [captureFields[64]!.code] },
          },
        ],
      },
    },
    'APP_CONFIG_EVENT_CAPTURE_PLAN_EXCEEDED'
  );

  eventError(
    {
      ...sourceDeclaration,
      events: {
        schemas: [eventSchema, { ...eventSchema, dataSchemaVersion: '1.1.0' }],
        subscriptions: [],
      },
    },
    'APP_CONFIG_EVENT_SCHEMA_INVALID'
  );

  eventError(
    {
      ...sourceDeclaration,
      events: {
        schemas: [
          {
            ...eventSchema,
            jsonSchema: {
              type: 'object',
              properties: { visible: { type: 'string' } },
            },
            sensitiveFields: ['missing.secret'],
          },
        ],
        subscriptions: [],
      },
    },
    'APP_CONFIG_EVENT_SCHEMA_INVALID'
  );

  eventError(
    {
      ...sourceDeclaration,
      events: {
        schemas: [eventSchema],
        subscriptions: [],
        timers: [0, 1].map(() => ({
          code: 'duplicate-timer',
          eventType: eventSchema.eventType,
          cronExpression: '0 0 8 * * *',
          timezone: 'Asia/Shanghai',
          payload: {},
        })),
      },
    },
    'APP_CONFIG_TIMER_CODE_INVALID'
  );

  const withDueField = sourceDeclaration.data!.resources.map(resource =>
    resource.code === 'instruments'
      ? {
          ...resource,
          fields: [
            ...resource.fields,
            { code: 'due_at', type: 'datetime' as const, label: 'Due at' },
          ],
        }
      : resource
  );
  eventError(
    {
      ...sourceDeclaration,
      data: { resources: withDueField },
      events: {
        schemas: [eventSchema],
        subscriptions: [],
        dateTriggers: [
          {
            code: 'oversized-date-trigger',
            resourceCode: 'instruments',
            field: 'due_at',
            offset: '-PT1H',
            eventType: eventSchema.eventType,
            payload: { value: 'x'.repeat(65_537) },
          },
        ],
      },
    },
    'APP_CONFIG_DATE_TRIGGER_INVALID'
  );
});
