import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStandardRouteManifestIndex,
  negotiateStandardRoute,
  standardRouteManifestDeviceForViewport,
} from '../src/browser/route-manifest';
import type { AppRouteManifestEntryV3 } from 'openxiangda-contracts/browser';

const manifestEntryPoints = {
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
} as const;

const task = {
  code: 'workflow:task',
  kind: 'workflow-task',
  desktop: {
    routeCode: 'workflow.task.desktop',
    path: '/tasks/:taskId',
    surface: 'user',
    pathParams: ['taskId'],
    requiresAuthentication: true,
  },
  mobile: {
    routeCode: 'workflow.task.mobile',
    path: '/m/tasks/:taskId',
    surface: 'user',
    pathParams: ['taskId'],
    requiresAuthentication: true,
  },
} as const;

const todoCenter = {
  code: 'application:todo-center',
  kind: 'application-todo-center',
  desktop: {
    routeCode: 'application.todo-center.desktop',
    path: '/todos',
    surface: 'user',
    pathParams: [],
    requiresAuthentication: true,
  },
  mobile: {
    routeCode: 'application.todo-center.mobile',
    path: '/m/todos',
    surface: 'user',
    pathParams: [],
    requiresAuthentication: true,
  },
} as const;

const workCenter = {
  code: 'workflow:work-center',
  kind: 'workflow-work-center',
  desktop: {
    routeCode: 'workflow.work.center.desktop',
    path: '/work-center',
    surface: 'user',
    pathParams: [],
    requiresAuthentication: true,
  },
  mobile: {
    routeCode: 'workflow.work.center.mobile',
    path: '/m/work-center',
    surface: 'user',
    pathParams: [],
    requiresAuthentication: true,
  },
} as const;

const instance = {
  code: 'workflow:instance',
  kind: 'workflow-instance',
  desktop: {
    routeCode: 'workflow.instance.desktop',
    path: '/workflows/:instanceId',
    surface: 'user',
    pathParams: ['instanceId'],
    requiresAuthentication: true,
  },
  mobile: {
    routeCode: 'workflow.instance.mobile',
    path: '/m/workflows/:instanceId',
    surface: 'user',
    pathParams: ['instanceId'],
    requiresAuthentication: true,
  },
} as const;

const launch = {
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
} as const;

function launchEntry(workflowCode: string): AppRouteManifestEntryV3 {
  return {
    code: `workflow:${workflowCode}:launch`,
    kind: 'workflow-launch',
    workflowCode,
    desktop: {
      routeCode: `workflow.${workflowCode}.launch.desktop`,
      path: '/workflows/:workflowCode/start',
      surface: 'user',
      pathParams: ['workflowCode'],
      requiresAuthentication: true,
    },
    mobile: {
      routeCode: `workflow.${workflowCode}.launch.mobile`,
      path: '/m/workflows/:workflowCode/start',
      surface: 'user',
      pathParams: ['workflowCode'],
      requiresAuthentication: true,
    },
  };
}

const additionalLaunchEntries = [
  'activity-publication-approval',
  'club-excellent-selection',
  'benefit-redemption',
  'member-profile-review',
  'family-qualification-review',
  'travel-blacklist-review',
  'leave-approval',
  'equipment-loan-approval',
  'opinion-review',
].map(launchEntry);

const launchEntries: readonly AppRouteManifestEntryV3[] = [
  launch,
  ...additionalLaunchEntries,
];

const index = createStandardRouteManifestIndex(
  {
    schemaVersion: 'openxiangda.application-route-manifest/v3',
    appCode: 'route-test-app',
    ...manifestEntryPoints,
    routes: [todoCenter, workCenter, task, ...launchEntries, instance],
    digest: 'a'.repeat(64),
  },
  'route-test-app',
);

test('uses the manifest device policy boundary for standard route devices', () => {
  assert.equal(standardRouteManifestDeviceForViewport(manifestEntryPoints.devicePolicy, 320), 'mobile');
  assert.equal(standardRouteManifestDeviceForViewport(manifestEntryPoints.devicePolicy, 899), 'mobile');
  assert.equal(standardRouteManifestDeviceForViewport(manifestEntryPoints.devicePolicy, 900), 'mobile');
  assert.equal(standardRouteManifestDeviceForViewport(manifestEntryPoints.devicePolicy, 901), 'desktop');
  assert.equal(standardRouteManifestDeviceForViewport(manifestEntryPoints.devicePolicy, 1440), 'desktop');
  assert.equal(standardRouteManifestDeviceForViewport(manifestEntryPoints.devicePolicy, Number.NaN), 'desktop');
});

test('negotiates manifest root and authentication pairs without URL inference', () => {
  assert.equal(
    negotiateStandardRoute(
      index,
      { pathname: '/', search: '?returnTo=%2Fadmin', hash: '#root' },
      'mobile',
    )?.pathname,
    '/m/',
  );
  assert.deepEqual(
    negotiateStandardRoute(
      index,
      { pathname: '/', search: '?returnTo=%2Fadmin', hash: '#root' },
      'mobile',
    ),
    {
      entryCode: 'application-root',
      from: 'desktop',
      to: 'mobile',
      pathname: '/m/',
      search: '?returnTo=%2Fadmin',
      hash: '#root',
    },
  );
  assert.equal(
    negotiateStandardRoute(index, { pathname: '/m/' }, 'desktop')?.pathname,
    '/',
  );
  assert.equal(
    negotiateStandardRoute(index, { pathname: '/login' }, 'mobile')?.pathname,
    '/m/login',
  );
  assert.equal(
    negotiateStandardRoute(index, { pathname: '/m/login' }, 'desktop')?.pathname,
    '/login',
  );
});

test('projects task parameters and retains query/hash when switching devices', () => {
  const mobile = negotiateStandardRoute(
    index,
    {
      pathname: '/tasks/task%2Fone',
      search: '?from=todo&view=compact',
      hash: '#approval',
    },
    'mobile',
  );
  assert.deepEqual(mobile, {
    entryCode: 'workflow:task',
    from: 'desktop',
    to: 'mobile',
    pathname: '/m/tasks/task%2Fone',
    search: '?from=todo&view=compact',
    hash: '#approval',
  });

  const desktop = negotiateStandardRoute(index, mobile!, 'desktop');
  assert.deepEqual(desktop, {
    entryCode: 'workflow:task',
    from: 'mobile',
    to: 'desktop',
    pathname: '/tasks/task%2Fone',
    search: '?from=todo&view=compact',
    hash: '#approval',
  });
});

test('negotiates every standard Todo and Workflow pair from the manifest', () => {
  const cases = [
    ['/todos', '/m/todos'],
    ['/work-center', '/m/work-center'],
    ['/tasks/task-1', '/m/tasks/task-1'],
    ['/workflows/instance-1', '/m/workflows/instance-1'],
  ] as const;
  for (const [desktopPath, mobilePath] of cases) {
    assert.equal(
      negotiateStandardRoute(
        index,
        { pathname: desktopPath, search: '', hash: '' },
        'mobile',
      )?.pathname,
      mobilePath,
    );
  }
});

test('carries the workflow launch parameter between user surfaces', () => {
  const mobile = negotiateStandardRoute(
    index,
    {
      pathname: '/workflows/purchase-approval/start',
      search: '',
      hash: '',
    },
    'mobile',
  );
  assert.equal(mobile?.pathname, '/m/workflows/purchase-approval/start');
});

test('disambiguates every shared mobile launch pattern by workflow metadata', () => {
  for (const workflowCode of ['purchase-approval', ...additionalLaunchEntries.map(entry => entry.workflowCode!)]) {
    const mobile = negotiateStandardRoute(
      index,
      {
        pathname: `/m/workflows/${workflowCode}/start`,
        search: '?from=todo',
        hash: '#subject',
      },
      'desktop',
    );
    assert.deepEqual(mobile, {
      entryCode: `workflow:${workflowCode}:launch`,
      from: 'mobile',
      to: 'desktop',
      pathname: `/workflows/${workflowCode}/start`,
      search: '?from=todo',
      hash: '#subject',
    });

    const desktop = negotiateStandardRoute(
      index,
      {
      pathname: `/workflows/${workflowCode}/start`,
        search: '?from=mobile',
        hash: '#subject',
      },
      'mobile',
    );
    assert.deepEqual(desktop, {
      entryCode: `workflow:${workflowCode}:launch`,
      from: 'desktop',
      to: 'mobile',
      pathname: `/m/workflows/${workflowCode}/start`,
      search: '?from=mobile',
      hash: '#subject',
    });
  }
});

test('normalizes an encoded semantic capture and rejects an unknown workflow', () => {
  assert.equal(
    negotiateStandardRoute(
      index,
      { pathname: '/m/workflows/purchase%2Dapproval/start' },
      'desktop',
    )?.pathname,
    '/workflows/purchase-approval/start',
  );
  assert.equal(
    negotiateStandardRoute(
      index,
      { pathname: '/m/workflows/not-declared/start' },
      'desktop',
    ),
    undefined,
  );
});

test('fails closed when paired dynamic parameters do not share a name', () => {
  const mismatched = createStandardRouteManifestIndex(
    {
      schemaVersion: 'openxiangda.application-route-manifest/v3',
      appCode: 'mismatch-app',
      ...manifestEntryPoints,
      routes: [
        {
          ...task,
          mobile: {
            ...task.mobile,
            path: '/m/tasks/:recordId',
            pathParams: ['recordId'],
          },
        },
      ],
      digest: 'b'.repeat(64),
    },
    'mismatch-app',
  );
  assert.equal(
    negotiateStandardRoute(
      mismatched,
      { pathname: '/tasks/task-1' },
      'mobile',
    ),
    undefined,
  );
  assert.equal(
    negotiateStandardRoute(
      mismatched,
      { pathname: '/m/tasks/task-1' },
      'desktop',
    ),
    undefined,
  );
});

test('expects router-relative paths so a BrowserRouter basename is not duplicated', () => {
  assert.equal(
    negotiateStandardRoute(
      index,
      { pathname: '/runtime/union-example/m/workflows/purchase-approval/start' },
      'desktop',
    ),
    undefined,
  );
});

test('does not redirect an already negotiated route or an unknown path', () => {
  assert.equal(
    negotiateStandardRoute(
      index,
      { pathname: '/m/tasks/task-1', search: '', hash: '' },
      'mobile',
    ),
    undefined,
  );
  assert.equal(
    negotiateStandardRoute(
      index,
      { pathname: '/admin/not-a-standard-route', search: '', hash: '' },
      'mobile',
    ),
    undefined,
  );
});

test('resource user-surface entries validate with stable codes and device paths', () => {
  const index = createStandardRouteManifestIndex(
    {
    schemaVersion: 'openxiangda.application-route-manifest/v3',
    appCode: 'route-test-app',
    ...manifestEntryPoints,
    routes: [
      {
        code: 'user.requests.records',
        kind: 'resource-records',
        resourceCode: 'requests',
        desktop: {
          routeCode: 'user.requests.records.desktop',
          path: '/my/requests',
          surface: 'user',
          requiresAuthentication: true,
          pathParams: [],
          capability: 'app:x:data:requests:read',
        },
        mobile: {
          routeCode: 'user.requests.records.mobile',
          path: '/m/my/requests',
          surface: 'user',
          requiresAuthentication: true,
          pathParams: [],
          capability: 'app:x:data:requests:read',
        },
      },
    ],
    digest: 'a'.repeat(64),
    } as never,
    'route-test-app',
  );
  assert.equal(index.entries.get('user.requests.records')?.resourceCode, 'requests');
});

test('resource user-surface entries reject mismatched entry codes', () => {
  assert.throws(
    () =>
      createStandardRouteManifestIndex(
        {
        schemaVersion: 'openxiangda.application-route-manifest/v3',
        appCode: 'route-test-app',
        ...manifestEntryPoints,
        routes: [
          {
            code: 'user.requests.wrong',
            kind: 'resource-records',
            resourceCode: 'requests',
            desktop: {
              routeCode: 'user.requests.records.desktop',
              path: '/my/requests',
              surface: 'user',
              requiresAuthentication: true,
              pathParams: [],
            },
            mobile: {
              routeCode: 'user.requests.records.mobile',
              path: '/m/my/requests',
              surface: 'user',
              requiresAuthentication: true,
              pathParams: [],
            },
          },
        ],
        digest: 'a'.repeat(64),
        } as never,
        'route-test-app',
      ),
    /OPENXIANGDA_ROUTE_MANIFEST_INVALID/,
  );
});

// The user-surface landing: rootEntry aliases the records entry itself, so the
// post-login destination is a real manifest route with identical paths.
const aliasedRecordsEntry = {
  code: 'user.requests.records',
  kind: 'resource-records',
  resourceCode: 'requests',
  desktop: {
    routeCode: 'user.requests.records.desktop',
    path: '/my/requests',
    surface: 'user',
    requiresAuthentication: true,
    pathParams: [],
    capability: 'app:x:data:requests:read',
  },
  mobile: {
    routeCode: 'user.requests.records.mobile',
    path: '/m/my/requests',
    surface: 'user',
    requiresAuthentication: true,
    pathParams: [],
    capability: 'app:x:data:requests:read',
  },
} as const;

const aliasedRootManifest = {
  schemaVersion: 'openxiangda.application-route-manifest/v3',
  appCode: 'route-test-app',
  devicePolicy: manifestEntryPoints.devicePolicy,
  rootEntry: {
    code: 'user.requests.records',
    desktop: '/my/requests',
    mobile: '/m/my/requests',
  },
  authentication: manifestEntryPoints.authentication,
  routes: [aliasedRecordsEntry],
  digest: 'c'.repeat(64),
} as never;

test('root entry may alias the resource records landing route', () => {
  const index = createStandardRouteManifestIndex(
    aliasedRootManifest,
    'route-test-app',
  );
  assert.equal(
    index.entries.get('user.requests.records')?.desktop.path,
    '/my/requests',
  );
});

test('aliased landing still negotiates devices through the route pair', () => {
  const index = createStandardRouteManifestIndex(
    aliasedRootManifest,
    'route-test-app',
  );
  assert.deepEqual(
    negotiateStandardRoute(
      index,
      { pathname: '/my/requests', search: '?tab=mine', hash: '' },
      'mobile',
    ),
    {
      entryCode: 'user.requests.records',
      from: 'desktop',
      to: 'mobile',
      pathname: '/m/my/requests',
      search: '?tab=mine',
      hash: '',
    },
  );
  assert.equal(
    negotiateStandardRoute(
      index,
      { pathname: '/m/my/requests', search: '', hash: '' },
      'desktop',
    )?.pathname,
    '/my/requests',
  );
});

test('a non-root route colliding with the aliased landing path stays invalid', () => {
  assert.throws(
    () =>
      createStandardRouteManifestIndex(
        {
          ...aliasedRootManifest,
          rootEntry: {
            code: 'user.requests.records',
            desktop: '/other-landing',
            mobile: '/m/other-landing',
          },
          routes: [
            aliasedRecordsEntry,
            {
              ...todoCenter,
              desktop: { ...todoCenter.desktop, path: '/other-landing' },
            },
          ],
        } as never,
        'route-test-app',
      ),
    /OPENXIANGDA_ROUTE_MANIFEST_INVALID/,
  );
  assert.throws(
    () =>
      createStandardRouteManifestIndex(
        {
          ...aliasedRootManifest,
          routes: [
            aliasedRecordsEntry,
            {
              ...todoCenter,
              desktop: { ...todoCenter.desktop, path: '/login' },
            },
          ],
        } as never,
        'route-test-app',
      ),
    /OPENXIANGDA_ROUTE_MANIFEST_INVALID/,
  );
});
