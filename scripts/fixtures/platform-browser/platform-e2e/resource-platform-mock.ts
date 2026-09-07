import type { Page, BrowserContext } from '@playwright/test';
import { appCode, capabilities } from '../../../packages/contracts/src/generated.js';
const runtimeBase = `/view/${appCode}`;
const allCapabilities = [...capabilities] as string[];

export function runtimeAuthorization(authorized: boolean, superAdmin = false) {
  return {
    schemaVersion: 'openxiangda.runtime-authorization/v2',
    state: 'active',
    environment: {
      id: 'preproduction-id',
      key: 'preproduction',
      activeAppVersionId: 'app-version-1',
      headRevision: 1,
      authzRevisionId: 'authz-1',
      authzVersion: 1,
      scopeDataVersion: 'scope-1',
    },
    subjectProfile: {
      schemaVersion: 'openxiangda.subject-profile/v2',
      userId: 'acceptance-user',
      displayName: '王老师',
      avatarUrl: null,
      jobNumber: 'T001',
      affiliatedDepartment: { id: 'department-1', name: '理学院' },
    },
    roles: [
      { code: 'college_admin', name: '学院管理员', source: 'package' },
      { code: 'instrument_admin', name: '仪器管理员', source: 'package' },
    ],
    principal: {
      type: 'user_union',
      userId: 'acceptance-user',
      roleCodes: ['college_admin', 'instrument_admin'],
      capabilityCodes: authorized
        ? [
            ...allCapabilities,
            'app:openxiangda-application:operations:read',
          ]
        : [],
      isAppSuperAdmin: superAdmin,
      identityScope: 'user-union:preproduction-id:acceptance-user:authz-1',
    },
  };
}

export async function mockPlatform(
  page: Page | BrowserContext,
  authorized = true,
  targetRuntimeBase = runtimeBase,
  superAdmin = false,
  queryItemsByResource: Record<string, Array<Record<string, unknown>>> = {},
) {
  let contextReads = 0;
  let avatarCompletes = 0;
  const observed: Array<{ path: string; perspectiveCode: string }> = [];
  await page.route('https://upload.example.test/avatar-upload', route =>
    route.fulfill({ status: 200, body: '' })
  );
  await page.route(`**${targetRuntimeBase}/**`, async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '<head>',
      `<head><meta name="openxiangda-runtime-base" content="${targetRuntimeBase}/" />` +
        `<meta name="openxiangda-app-code" content="${appCode}" />` +
        '<meta name="openxiangda-environment" content="preproduction" />'
    );
    await route.fulfill({ response, body });
  });
  await page.route('**/service/**', async route => {
    const url = new URL(route.request().url());
    const request = route.request();
    const perspectiveCode = request.headers()['x-openxiangda-perspective'] || '';
    if (url.pathname.endsWith('/native/authz/current')) {
      contextReads += 1;
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: runtimeAuthorization(authorized, superAdmin),
        }),
      });
    }
    if (url.pathname.endsWith('/native/authz/profile/avatar/initiate')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            uploadUrl: 'https://upload.example.test/avatar-upload',
            uploadMethod: 'put',
            headers: { 'content-type': 'image/png' },
            objectName: 'images/tenant/app/user/avatar.png',
          },
        }),
      });
    }
    if (url.pathname.endsWith('/native/authz/profile/avatar/complete')) {
      avatarCompletes += 1;
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            schemaVersion: 'openxiangda.subject-profile/v2',
            userId: 'acceptance-user',
            displayName: '王老师',
            avatarUrl: 'https://cdn.example.test/avatar/new.png',
            jobNumber: 'T001',
            affiliatedDepartment: { id: 'department-1', name: '理学院' },
          },
        }),
      });
    }
    const sourceQuery = url.pathname.match(
      /\/native\/data-resources\/([^/]+)\/fields\/([^/]+)\/source\/query$/
    );
    if (sourceQuery) {
      observed.push({ path: url.pathname, perspectiveCode });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            schemaVersion: 'openxiangda.data-field-source-page/v2',
            resourceCode: decodeURIComponent(sourceQuery[1]),
            fieldCode: decodeURIComponent(sourceQuery[2]),
            items: [],
            nextCursor: null,
          },
        }),
      });
    }
    const exportRequest = url.pathname.match(
      /\/native\/data\/([^/]+)\/export$/
    );
    if (exportRequest) {
      observed.push({ path: url.pathname, perspectiveCode });
      return route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        headers: {
          'content-disposition': `attachment; filename="${decodeURIComponent(
            exportRequest[1]
          )}.csv"`,
        },
        body: 'id,name\nacceptance-1,OpenXiangda\n',
      });
    }
    const query = url.pathname.match(/\/native\/data\/([^/]+)\/query$/);
    if (query) {
      const resourceCode = decodeURIComponent(query[1]);
      const items = queryItemsByResource[resourceCode] || [];
      observed.push({ path: url.pathname, perspectiveCode });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            schemaVersion: 'openxiangda.data-page/v2',
            resourceCode,
            appVersionId: 'app-version-1',
            environmentHeadRevision: 1,
            items,
            total: items.length,
            limit: 500,
            offset: 0,
          },
        }),
      });
    }
    if (url.pathname.includes('/directory/')) {
      observed.push({ path: url.pathname, perspectiveCode });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { items: [], nextCursor: null } }),
      });
    }
    if (url.pathname.includes('/openxiangda-app-api/v2/')) {
      observed.push({ path: url.pathname, perspectiveCode });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { status: 'ok' } }),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 404, message: 'not mocked' }),
    });
  });
  return {
    observed,
    get contextReads() {
      return contextReads;
    },
    get avatarCompletes() {
      return avatarCompletes;
    },
  };
}
