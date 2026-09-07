import { defineAdminNavigation, defineOpenXiangdaApp } from 'openxiangda/config';

/** Start with business modules; select standard CRUD only for the models that need it. */
export default defineOpenXiangdaApp({
  app: { code: 'openxiangda-application', name: 'OpenXiangda 应用' },
  frontend: {
    root: 'apps/web',
    devicePolicy: {
      kind: 'viewport-family',
      mobileMaxWidthPx: 900,
      desktopMinWidthPx: 901,
    },
    routes: [
      {
        code: 'application-home',
        path: '/home',
        label: '应用首页',
        surface: 'user',
      },
      {
        code: 'application-home-mobile',
        path: '/m/home',
        label: '移动首页',
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
          label: '账号密码登录',
          presentation: 'primary',
          required: true,
        },
      ],
      surfaces: {
        desktop: {
          routeCode: 'application-login',
          path: '/login',
          defaultRouteCode: 'application-home',
        },
        mobile: {
          routeCode: 'application-login-mobile',
          path: '/m/login',
          defaultRouteCode: 'application-home-mobile',
        },
      },
    },
    admin: { navigation: defineAdminNavigation([]) },
  },
  modules: [],
});
