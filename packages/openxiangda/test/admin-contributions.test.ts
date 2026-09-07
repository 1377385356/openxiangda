import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defineApplicationContributions,
  defineAdminContributions,
  isApplicationRouteAllowed,
  isAdminContributionAllowed,
  isAdminRouteAllowed,
  type AdminOperationPageProps,
  type StandardApplicationTodoCenterProps,
  type StandardUserPageFrameProps,
} from '../src/react';

function Page(_props: AdminOperationPageProps) {
  return null;
}

function StandardFrame(_props: StandardUserPageFrameProps) {
  return null;
}

function StandardTodo(_props: StandardApplicationTodoCenterProps) {
  return null;
}

const routes = {
  operations: {
    code: 'operations',
    path: '/admin/operations',
    label: '业务操作',
    surface: 'admin',
    capability: 'operations.read',
    tabPersistence: 'session',
    keepAlive: 'none',
  },
  calibration: {
    code: 'calibration',
    path: '/admin/operations/calibration/:id',
    label: '校准仪器',
    surface: 'admin',
    parentCode: 'operations',
    access: { allOf: ['instruments.read'], anyOf: ['calibration.run'] },
    tabPersistence: 'none',
    keepAlive: 'none',
  },
} as const;

test('binds generated routes exactly and orders bounded resource action slots', () => {
  const contributions = defineAdminContributions(routes, {
    pages: { operations: Page, calibration: Page },
    resources: {
      instruments: {
        toolbar: [
          {
            code: 'second',
            label: '第二项',
            order: 20,
            render: () => null,
          },
          {
            code: 'first',
            label: '第一项',
            order: 10,
            capability: 'instruments.update',
            render: () => null,
          },
        ],
        row: [
          {
            code: 'calibrate',
            label: '校准',
            access: { allOf: ['instruments.read', 'calibration.run'] },
            render: ({ record }) => String(record.id),
          },
        ],
        detail: [
          {
            code: 'history',
            label: '校准记录',
            render: ({ refresh }) => String(typeof refresh),
          },
        ],
      },
    },
  });

  assert.deepEqual(
    contributions.routes.map((item) => item.route.code),
    ['operations', 'calibration'],
  );
  assert.deepEqual(
    contributions.resources.instruments?.toolbar?.map((item) => item.code),
    ['first', 'second'],
  );
});

test('uses the same capability expression for slots and ancestor route access', () => {
  const contributions = defineAdminContributions(routes, {
    pages: { operations: Page, calibration: Page },
  });
  const capabilities = new Set([
    'operations.read',
    'instruments.read',
    'calibration.run',
  ]);
  const allowed = (capability: string) => capabilities.has(capability);
  const calibration = contributions.routes[1]!;

  assert.equal(isAdminRouteAllowed(calibration, contributions.routes, allowed), true);
  capabilities.delete('operations.read');
  assert.equal(isAdminRouteAllowed(calibration, contributions.routes, allowed), false);
  assert.equal(
    isAdminContributionAllowed(
      { access: { allOf: ['instruments.read'], anyOf: ['calibration.run'] } },
      allowed,
    ),
    true,
  );
  capabilities.delete('calibration.run');
  assert.equal(
    isAdminContributionAllowed(
      { access: { allOf: ['instruments.read'], anyOf: ['calibration.run'] } },
      allowed,
    ),
    false,
  );
});

test('binds independent user routes without wrapping them in the admin-only contract', () => {
  const applicationRoutes = {
    desktop: {
      code: 'purchase-detail',
      path: '/admin/purchases/:instanceId',
      label: '采购详情',
      surface: 'admin',
      capability: 'purchases.read',
      tabPersistence: 'none',
      keepAlive: 'none',
    },
    mobile: {
      code: 'purchase-detail-mobile',
      path: '/m/purchases/:instanceId',
      label: '移动采购详情',
      surface: 'user',
      capability: 'purchases.read',
      tabPersistence: 'none',
      keepAlive: 'none',
    },
  } as const;
  const contributions = defineApplicationContributions(applicationRoutes, {
    pages: { desktop: Page, mobile: Page },
  });
  const mobile = contributions.routes[1]!;
  assert.equal(
    contributions.routes[0]?.route.path,
    '/admin/purchases/:instanceId',
  );
  assert.equal(mobile.route.surface, 'user');
  assert.equal(
    isApplicationRouteAllowed(
      mobile,
      contributions.routes,
      capability => capability === 'purchases.read'
    ),
    true
  );
  assert.throws(
    () =>
      defineAdminContributions(applicationRoutes, {
        pages: { desktop: Page, mobile: Page },
      }),
    /OPENXIANGDA_ADMIN_CONTRIBUTIONS_INVALID:route:desktop/
  );
});

test('binds one exact desktop/mobile standard user renderer family', () => {
  const contributions = defineApplicationContributions({}, {
    pages: {},
    standardUserSurfaces: {
      frame: { desktop: StandardFrame, mobile: StandardFrame },
      applicationTodoCenter: {
        desktop: StandardTodo,
        mobile: StandardTodo,
      },
    },
  });
  assert.equal(
    contributions.standardUserSurfaces?.frame.desktop,
    StandardFrame,
  );
  assert.equal(
    contributions.standardUserSurfaces?.applicationTodoCenter.mobile,
    StandardTodo,
  );
  assert.equal(Object.isFrozen(contributions.standardUserSurfaces), true);
  assert.equal(
    Object.isFrozen(contributions.standardUserSurfaces?.frame),
    true,
  );
});

test('fails closed when a standard user renderer pair or group drifts', () => {
  assert.throws(
    () =>
      defineApplicationContributions({}, {
        pages: {},
        standardUserSurfaces: {
          frame: { desktop: StandardFrame } as never,
          applicationTodoCenter: {
            desktop: StandardTodo,
            mobile: StandardTodo,
          },
        },
      }),
    /standard-user-surfaces:frame:pair/,
  );
  assert.throws(
    () =>
      defineApplicationContributions({}, {
        pages: {},
        standardUserSurfaces: {
          frame: { desktop: StandardFrame, mobile: StandardFrame },
        } as never,
      }),
    /standard-user-surfaces:groups/,
  );
});

test('binds generated authentication surfaces independently from protected routes', () => {
  const applicationRoutes = {
    home: {
      code: 'home',
      path: '/home',
      label: 'Home',
      surface: 'user',
      tabPersistence: 'session',
      keepAlive: 'none',
    },
    mobileHome: {
      code: 'mobile-home',
      path: '/m/home',
      label: 'Mobile home',
      surface: 'user',
      tabPersistence: 'session',
      keepAlive: 'none',
    },
  } as const;
  const authenticationSurfaces = {
    applicationLogin: {
      device: 'desktop',
      routeCode: 'application-login',
      path: '/login',
      defaultRouteCode: 'home',
    },
    applicationMobileLogin: {
      device: 'mobile',
      routeCode: 'application-mobile-login',
      path: '/m/login',
      defaultRouteCode: 'mobile-home',
    },
  } as const;
  const LoginPage = () => null;
  const contributions = defineApplicationContributions(
    { routes: applicationRoutes, authenticationSurfaces },
    {
      pages: { home: Page, mobileHome: Page },
      authentication: {
        applicationLogin: LoginPage,
        applicationMobileLogin: LoginPage,
      },
    }
  );
  assert.equal(contributions.routes.length, 2);
  assert.equal(contributions.authentication.length, 2);
  assert.deepEqual(
    contributions.authentication.map(item => item.surface.path),
    ['/login', '/m/login']
  );
  assert.throws(
    () =>
      defineApplicationContributions(
        { routes: applicationRoutes, authenticationSurfaces },
        {
          pages: { home: Page, mobileHome: Page },
          authentication: { applicationLogin: LoginPage } as never,
        }
      ),
    /authentication-must-match-generated-surfaces/
  );
});

test('fails closed for route/page drift and invalid admin manifests', () => {
  assert.throws(
    () =>
      defineAdminContributions(routes, {
        pages: { operations: Page } as never,
      }),
    /OPENXIANGDA_ADMIN_CONTRIBUTIONS_INVALID:pages-must-match-generated-routes/,
  );
  assert.throws(
    () =>
      defineAdminContributions(
        {
          publicPage: {
            ...routes.operations,
            code: 'public-page',
            surface: 'user',
          },
        },
        { pages: { publicPage: Page } },
      ),
    /OPENXIANGDA_ADMIN_CONTRIBUTIONS_INVALID:route:publicPage/,
  );
  assert.throws(
    () =>
      defineAdminContributions(
        {
          left: { ...routes.operations, code: 'left', parentCode: 'right' },
          right: {
            ...routes.operations,
            code: 'right',
            path: '/admin/operations/right',
            parentCode: 'left',
          },
        },
        { pages: { left: Page, right: Page } },
      ),
    /OPENXIANGDA_ADMIN_CONTRIBUTIONS_INVALID:route:left:parent-cycle/,
  );
  assert.throws(
    () =>
      defineAdminContributions({}, {
        pages: {},
        resources: {
          instruments: {
            row: Array.from({ length: 51 }, (_, index) => ({
              code: `action-${index}`,
              label: `Action ${index}`,
              render: () => null,
            })),
          },
        },
      }),
    /OPENXIANGDA_ADMIN_CONTRIBUTIONS_INVALID:instruments:row:too-many-actions/,
  );
});
