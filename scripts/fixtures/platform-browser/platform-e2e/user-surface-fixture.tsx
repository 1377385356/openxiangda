import React from 'react';
import { createRoot } from 'react-dom/client';
import { OpenXiangdaApplication } from 'openxiangda/react';
import type { DataFieldSurface, DataResourceSurface } from 'openxiangda/core';
import 'openxiangda/react/styles.css';

const field = (
  label: string,
  type: DataFieldSurface['type'] = 'text.short',
  widget: DataFieldSurface['widget'] = 'text',
  extra: Partial<DataFieldSurface> = {}
): DataFieldSurface => ({
  label,
  type,
  widget,
  readCapabilities: [],
  createCapabilities: [],
  updateCapabilities: [],
  ...extra,
});

// 生成式用户标准面的最小事实：一个启用 user surface 的资源，
// rootEntry 直接别名 records 路由（登录落地即“我的记录”）。
const surface: DataResourceSurface = {
  mutationOwner: 'native',
  generated: { list: true, detail: true, create: true, update: true, delete: false },
  fields: {
    name: field('物资名称', 'text.short', 'text', { list: true, required: true, section: '领用信息' }),
    quantity: field('领用数量', 'number.integer', 'number', { list: true, section: '领用信息' }),
    reason: field('领用事由', 'text.long', 'textarea', { section: '领用信息' }),
  },
  list: { defaultPageSize: 20, searchableFields: ['name'], defaultSort: { field: 'name', order: 'asc' } },
  form: { layout: 'sections', fieldOrder: ['name', 'quantity', 'reason'] },
  mobile: { enabled: true },
};

const resourceDefinitions = {
  'resource-01': {
    code: 'resource-01',
    name: '物资领用',
    capabilities: {
      read: 'app:openxiangda-application:data:resource-01:read',
      create: 'app:openxiangda-application:data:resource-01:create',
      update: 'app:openxiangda-application:data:resource-01:update',
      delete: 'app:openxiangda-application:data:resource-01:delete',
    },
    surface,
  },
};

const routeManifest = {
  schemaVersion: 'openxiangda.application-route-manifest/v3',
  appCode: 'openxiangda-application',
  devicePolicy: { kind: 'viewport-family', mobileMaxWidthPx: 900, desktopMinWidthPx: 901 },
  rootEntry: { code: 'user.resource-01.records', desktop: '/my/resource-01', mobile: '/m/my/resource-01' },
  authentication: {
    desktop: { routeCode: 'application-login', path: '/login' },
    mobile: { routeCode: 'application-login-mobile', path: '/m/login' },
  },
  routes: [
    {
      code: 'user.resource-01.records',
      kind: 'resource-records',
      resourceCode: 'resource-01',
      desktop: {
        routeCode: 'user.resource-01.records.desktop',
        path: '/my/resource-01',
        surface: 'user',
        pathParams: [],
        capability: 'app:openxiangda-application:data:resource-01:read',
        requiresAuthentication: true,
      },
      mobile: {
        routeCode: 'user.resource-01.records.mobile',
        path: '/m/my/resource-01',
        surface: 'user',
        pathParams: [],
        capability: 'app:openxiangda-application:data:resource-01:read',
        requiresAuthentication: true,
      },
    },
    {
      code: 'user.resource-01.submit',
      kind: 'resource-submit',
      resourceCode: 'resource-01',
      desktop: {
        routeCode: 'user.resource-01.submit.desktop',
        path: '/my/resource-01/submit',
        surface: 'user',
        pathParams: [],
        capability: 'app:openxiangda-application:data:resource-01:create',
        requiresAuthentication: true,
      },
      mobile: {
        routeCode: 'user.resource-01.submit.mobile',
        path: '/m/my/resource-01/submit',
        surface: 'user',
        pathParams: [],
        capability: 'app:openxiangda-application:data:resource-01:create',
        requiresAuthentication: true,
      },
    },
  ],
  digest: 'a'.repeat(64),
} as const;

// 从 html 入口进入时先落到应用根，让根路由把登录用户重定向到 rootEntry。
if (location.pathname.endsWith('.html')) {
  history.replaceState({}, '', '/');
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OpenXiangdaApplication
      appCode="openxiangda-application"
      appName="用户标准面验收"
      resourceDefinitions={resourceDefinitions}
      adminPages={[]}
      adminNavigation={[]}
      routeManifest={routeManifest}
    />
  </React.StrictMode>
);
