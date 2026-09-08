import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { OPENXIANGDA_VERSION_LINE } from '../src/index';
import {
  applicationCode,
  applicationName,
  batchAggregateNativeResources,
  batchQueryNativeData,
  batchListNativeResources,
  configureApplicationIdentity,
  createRoleManagementGrant,
  createRoleMembership,
  listRoleManagementGrants,
  listRoleMemberships,
  loadBusinessProcessReceipt,
  listBusinessProcessCommands,
  loadAuthorizationMutationReceipt,
  loadRoleManagementCatalog,
  pollBusinessProcessCommand,
  resolveApplicationBasename,
  revokeRoleManagementGrant,
  revokeRoleMembership,
  searchRoleManagementUsers,
  updateRoleManagementGrant,
  updateRoleMembership,
} from '../src/core';
import type {
  DataAggregateMeasureType,
  DataAggregatePage,
  DataAggregateQuery,
} from '../src/core';
import {
  adminApplicationTodoCenterPage,
  composeAppOperationSchemas,
  composeJsonSchema,
  dataPolicyExpression,
  resourceReadPolicy,
  resourceRecordSchema,
  schemaRef,
} from '../src/config';
import {
  ApplicationLoginController,
  ApplicationTodoCenterPage,
  classifyRuntimeAuthorizationFailure,
  createApplicationProvider,
  OpenXiangdaUiProvider,
  DefaultDesktopApplicationLoginSurface,
  DefaultMobileApplicationLoginSurface,
  defineApplicationContributions,
  defineAdminContributions,
  isAdminContributionAllowed,
  OpenXiangdaAdminPage,
  WorkflowInstancePage,
  WorkflowInstanceOperationsPanel,
  WorkflowSubmissionPage,
  WorkflowTaskPage,
  WorkflowTaskOperationsPanel,
  WorkflowWorkCenterPage,
  createStandardRouteManifestIndex,
  isAdminAccessAllowed,
  standardRouteManifestPath,
  StandardUserSurfaceErrorBoundary,
} from '../src/react';
import { OpenXiangdaPlatformRequestError } from '../src/browser/platform-client';
import * as nest from '../src/nest';
test('exposes the unified version line and browser-safe entrypoints', () => {
  assert.equal(OPENXIANGDA_VERSION_LINE, 2);
  assert.equal(
    resolveApplicationBasename({
      runtimeBase: '/runtime/example/',
      appCode: 'example',
      environmentKey: 'preproduction',
    }),
    '/runtime/example',
  );
  assert.equal(typeof createApplicationProvider, 'function');
  assert.equal(typeof defineAdminContributions, 'function');
  assert.equal(typeof defineApplicationContributions, 'function');
  assert.equal(typeof isAdminContributionAllowed, 'function');
  assert.equal(typeof WorkflowSubmissionPage, 'function');
  assert.equal(typeof WorkflowWorkCenterPage, 'function');
  assert.equal(typeof WorkflowTaskPage, 'function');
  assert.equal(typeof WorkflowTaskOperationsPanel, 'function');
  assert.equal(typeof WorkflowInstancePage, 'function');
  assert.equal(typeof WorkflowInstanceOperationsPanel, 'function');
  assert.equal(typeof ApplicationTodoCenterPage, 'function');
  assert.equal(typeof StandardUserSurfaceErrorBoundary, 'function');
  assert.equal(typeof ApplicationLoginController, 'function');
  assert.equal(typeof OpenXiangdaUiProvider, 'function');
  assert.equal(typeof OpenXiangdaAdminPage, 'function');
  assert.equal(typeof DefaultDesktopApplicationLoginSurface, 'function');
  assert.equal(typeof DefaultMobileApplicationLoginSurface, 'function');
  assert.equal(typeof classifyRuntimeAuthorizationFailure, 'function');
  assert.equal(typeof isAdminAccessAllowed, 'function');
  assert.equal(typeof adminApplicationTodoCenterPage, 'function');
  assert.equal(typeof batchListNativeResources, 'function');
  assert.equal(typeof batchQueryNativeData, 'function');
  assert.equal(typeof batchAggregateNativeResources, 'function');
  assert.equal(typeof loadRoleManagementCatalog, 'function');
  assert.equal(typeof listRoleMemberships, 'function');
  assert.equal(typeof searchRoleManagementUsers, 'function');
  assert.equal(typeof createRoleMembership, 'function');
  assert.equal(typeof updateRoleMembership, 'function');
  assert.equal(typeof revokeRoleMembership, 'function');
  assert.equal(typeof listRoleManagementGrants, 'function');
  assert.equal(typeof createRoleManagementGrant, 'function');
  assert.equal(typeof updateRoleManagementGrant, 'function');
  assert.equal(typeof revokeRoleManagementGrant, 'function');
  assert.equal(typeof loadAuthorizationMutationReceipt, 'function');
  assert.equal(typeof nest.databaseNowAssertion, 'function');
});

test('exports aggregate query and page contracts from the public core entrypoint', () => {
  const measure: DataAggregateMeasureType = 'count';
  const query: DataAggregateQuery = {
    schemaVersion: 'openxiangda.data-aggregate-query/v2',
    measures: [{ type: measure, as: 'total' }],
  };
  const page: DataAggregatePage = {
    schemaVersion: 'openxiangda.data-aggregate-page/v2',
    resourceCode: 'records',
    items: [{ total: 1 }],
    total: 1,
    limit: 100,
    offset: 0,
  };
  assert.equal(query.measures[0]?.type, measure);
  assert.equal(page.schemaVersion, 'openxiangda.data-aggregate-page/v2');
});

test('separates unauthenticated, authorized-forbidden, and transport failures', () => {
  assert.equal(
    classifyRuntimeAuthorizationFailure(
      new OpenXiangdaPlatformRequestError({
        code: 'APPLICATION_AUTH_UNAUTHENTICATED',
        status: 401,
        message: 'session invalid',
      }),
    ),
    'unauthenticated',
  );
  assert.equal(
    classifyRuntimeAuthorizationFailure(
      new OpenXiangdaPlatformRequestError({
        code: 'OPENXIANGDA_CAPABILITY_FORBIDDEN',
        status: 403,
        message: 'capability denied',
      }),
    ),
    'forbidden',
  );
  assert.equal(
    classifyRuntimeAuthorizationFailure(new TypeError('network unavailable')),
    'temporarily-unavailable',
  );
});

test('owns one router/runtime/shell composition for generated admin and user routes', () => {
  const source = readFileSync(
    new URL('../src/browser/application.tsx', import.meta.url),
    'utf8',
  );
  assert.equal((source.match(/<ApplicationRouter\b/g) || []).length, 1);
  assert.equal((source.match(/<RuntimeBoundary\b/g) || []).length, 1);
  assert.equal((source.match(/<Refine\b/g) || []).length, 1);
  assert.match(source, /contribution\.route\.surface === 'admin'/);
  assert.match(
    source,
    /variant === 'desktop' && props\.mode === 'list' \? <Shell>\{content\}<\/Shell> : content/,
  );
  assert.match(source, /const mobilePath = `\/m\$\{page\.path\}`/);
  assert.match(source, /createStandardRouteManifestIndex/);
  assert.match(source, /routeManifestIndex\.manifest\.routes\.flatMap/);
  assert.match(source, /path=\{entry\.mobile\.path\}/);
  assert.match(source, /<StandardRouteDeviceNegotiator index=\{routeManifestIndex\} \/>/);
  assert.match(source, /<ApplicationRouter basename=\{applicationBasename\(\)\}>/);
  assert.match(source, /navigate\(targetUrl, \{ replace: true, state: location\.state \}\)/);
  assert.match(source, /redirectKey\.current && redirectKey\.current !== key/);
  assert.match(source, /function StandardRouteDeviceNegotiator[\s\S]*?useEffect\(\(\) => \{/);
  assert.doesNotMatch(
    source,
    /function StandardRouteDeviceNegotiator[\s\S]*?useLayoutEffect/,
  );
  assert.doesNotMatch(source, /authentication.*<Route\b/);

  const runtimeSource = readFileSync(
    new URL('../src/browser/runtime.tsx', import.meta.url),
    'utf8',
  );
  assert.match(runtimeSource, /isApplicationUnauthenticatedError/);
  assert.match(runtimeSource, /APPLICATION_AUTH_UNAUTHENTICATED/);
  assert.match(runtimeSource, /当前账号无权访问此应用/);
  assert.match(runtimeSource, /当前会话不会因此被清除/);
  assert.match(runtimeSource, /resolveRuntimeManifestNavigation/);
  assert.match(runtimeSource, /routeManifest\?\.rootEntry\[requestedDevice\]/);
  assert.match(runtimeSource, /deviceLoginContribution\.surface\.path/);

  const resourcePagesSource = readFileSync(
    new URL('../src/browser/components/resource/StandardResourcePages.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(resourcePagesSource, /<Shell\b/);
});

test('indexes paired user Surface standard routes and evaluates admin access', () => {
  const manifest = {
    schemaVersion: 'openxiangda.application-route-manifest/v3',
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
    routes: [
      {
        code: 'workflow:task',
        kind: 'workflow-task',
        desktop: {
          routeCode: 'workflow.task.desktop',
          path: '/tasks/:taskId',
          surface: 'user',
          pathParams: ['taskId'],
          capability: 'workflow.task.read',
          requiresAuthentication: true,
        },
        mobile: {
          routeCode: 'workflow.task.mobile',
          path: '/m/tasks/:taskId',
          surface: 'user',
          pathParams: ['taskId'],
          capability: 'workflow.task.read',
          requiresAuthentication: true,
        },
      },
    ],
    digest: 'a'.repeat(64),
  } as const;
  const index = createStandardRouteManifestIndex(manifest, 'reference-app');
  assert.deepEqual(index.routes.map(route => route.routeCode), [
    'workflow.task.desktop',
    'workflow.task.mobile',
  ]);
  assert.equal(
    standardRouteManifestPath(index, 'workflow:task', 'mobile'),
    '/m/tasks/:taskId',
  );
  assert.equal(
    isAdminAccessAllowed(
      { anyOf: ['app:reference-app:admin:view'] },
      capability => capability === 'app:reference-app:admin:view',
    ),
    true,
  );
  assert.equal(
    isAdminAccessAllowed(
      { allOf: ['app:reference-app:admin:view', 'missing'] },
      capability => capability === 'app:reference-app:admin:view',
    ),
    false,
  );
  assert.throws(
    () =>
      createStandardRouteManifestIndex(
        {
          ...manifest,
          routes: [
            {
              ...manifest.routes[0],
              mobile: { ...manifest.routes[0].mobile, pathParams: [] },
            },
          ],
        },
        'reference-app',
      ),
    /OPENXIANGDA_ROUTE_MANIFEST_INVALID/,
  );
  assert.throws(
    () =>
      createStandardRouteManifestIndex(
        {
          ...manifest,
          routes: [
            {
              ...manifest.routes[0],
              mobile: {
                ...manifest.routes[0].mobile,
                capability: 'workflow.task.write',
              },
            },
          ],
        },
        'reference-app',
      ),
    /OPENXIANGDA_ROUTE_MANIFEST_INVALID/,
  );
});

test('binds the generated application identity once without a template fallback', () => {
  configureApplicationIdentity({
    appCode: 'root-package-test',
    appName: 'Root Package Test',
  });
  assert.equal(applicationCode(), 'root-package-test');
  assert.equal(applicationName(), 'Root Package Test');
  assert.throws(
    () =>
      configureApplicationIdentity({
        appCode: 'another-application',
        appName: 'Another Application',
      }),
    /OPENXIANGDA_APPLICATION_IDENTITY_ALREADY_CONFIGURED/,
  );
});

test('sends one bounded Native batch query and skips an empty batch', async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const metadata: Record<string, string> = {
    'openxiangda-runtime-base': '/dev/root-package-test',
    'openxiangda-app-code': 'root-package-test',
    'openxiangda-environment': 'preproduction',
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector(selector: string) {
        const name = /meta\[name="([^"]+)"\]/.exec(selector)?.[1];
        return name && metadata[name] ? { content: metadata[name] } : null;
      },
    },
  });
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        code: 200,
        data: {
          schemaVersion: 'openxiangda.data-batch-query-result/v2',
          results: [
            {
              key: 'news',
              resourceCode: 'news',
              ok: true,
              data: {
                schemaVersion: 'openxiangda.data-page/v2',
                resourceCode: 'news',
                items: [{ id: 'one' }],
                total: 1,
                limit: 8,
                offset: 0,
              },
            },
          ],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    const result = await batchListNativeResources([
      {
        key: 'news',
        resourceCode: 'news',
        surface: {
          fields: { publishedAt: {} },
          list: { defaultSort: { field: 'publishedAt', order: 'desc' } },
        } as any,
        query: { page: 1, pageSize: 8 },
      },
    ]);
    assert.deepEqual(result[0], {
      key: 'news',
      resourceCode: 'news',
      ok: true,
      page: { rows: [{ id: 'one' }], total: 1 },
    });
    assert.equal(
      requests[0]?.url,
      '/service/openxiangda-api/v2/applications/root-package-test/native/data/batch-query',
    );
    const body = JSON.parse(String(requests[0]?.init?.body));
    assert.equal(body.schemaVersion, 'openxiangda.data-batch-query/v2');
    assert.equal(body.environmentKey, 'preproduction');
    assert.equal(body.operations.length, 1);
    assert.deepEqual(await batchListNativeResources([]), []);
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) {
      delete (globalThis as { document?: Document }).document;
    } else {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      });
    }
  }
});

test('rejects an empty generic Native batch query before issuing a request', async () => {
  await assert.rejects(
    () => batchQueryNativeData([]),
    /OPENXIANGDA_NATIVE_DATA_BATCH_QUERY_OPERATIONS_REQUIRED/,
  );
});

test('rejects an ambiguous Native batch operation discriminator before transport', async () => {
  let requests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response('{}', { status: 200 });
  };
  try {
    await assert.rejects(
      () =>
        batchQueryNativeData([
          {
            key: 'records',
            resourceCode: 'records',
            query: { schemaVersion: 'openxiangda.data-query/v2' },
            aggregate: {
              schemaVersion: 'openxiangda.data-aggregate-query/v2',
              measures: [{ type: 'count', as: 'total' }],
            },
          } as any,
        ]),
      /OPENXIANGDA_NATIVE_DATA_BATCH_QUERY_OPERATION_KIND_INVALID/,
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sends aggregate batch operations and preserves aggregate envelopes', async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const metadata: Record<string, string> = {
    'openxiangda-runtime-base': '/dev/root-package-test',
    'openxiangda-app-code': 'root-package-test',
    'openxiangda-environment': 'preproduction',
  };
  const aggregatePage = {
    schemaVersion: 'openxiangda.data-aggregate-page/v2',
    resourceCode: 'records',
    items: [{ total: 3 }],
    total: 1,
    limit: 20,
    offset: 0,
  };
  let page: unknown = aggregatePage;
  const requests: Array<{ url: string; body: unknown }> = [];
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector(selector: string) {
        const name = /meta\[name="([^"]+)"\]/.exec(selector)?.[1];
        return name && metadata[name] ? { content: metadata[name] } : null;
      },
    },
  });
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(
      JSON.stringify({
        code: 200,
        data: {
          schemaVersion: 'openxiangda.data-batch-query-result/v2',
          results: [
            {
              key: 'summary',
              resourceCode: 'records',
              ok: true,
              data: page,
            },
          ],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const aggregate = {
    schemaVersion: 'openxiangda.data-aggregate-query/v2' as const,
    dimensions: [{ field: 'status', as: 'status' }],
    measures: [{ type: 'count' as const, as: 'total' }],
    limit: 20,
    offset: 0,
  };
  try {
    const result = await batchAggregateNativeResources([
      { key: 'summary', resourceCode: 'records', aggregate },
    ]);
    assert.deepEqual(result, [
      {
        key: 'summary',
        resourceCode: 'records',
        ok: true,
        aggregate: aggregatePage,
      },
    ]);
    assert.deepEqual(requests[0]?.body, {
      schemaVersion: 'openxiangda.data-batch-query/v2',
      environmentKey: 'preproduction',
      operations: [{ key: 'summary', resourceCode: 'records', aggregate }],
    });

    page = {
      schemaVersion: 'openxiangda.data-page/v2',
      resourceCode: 'records',
      items: [{ id: 'wrong-envelope' }],
      total: 1,
      limit: 20,
      offset: 0,
    };
    await assert.rejects(
      () =>
        batchAggregateNativeResources([
          { key: 'summary', resourceCode: 'records', aggregate },
        ]),
      /OPENXIANGDA_NATIVE_DATA_BATCH_AGGREGATE_RESPONSE_KIND_INVALID/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) {
      delete (globalThis as { document?: Document }).document;
    } else {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      });
    }
  }
});

test('uses typed durable process receipt and revision poll endpoints', async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const metadata: Record<string, string> = {
    'openxiangda-runtime-base': '/dev/root-package-test',
    'openxiangda-app-code': 'root-package-test',
    'openxiangda-environment': 'preproduction',
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector(selector: string) {
        const name = /meta\[name="([^"]+)"\]/.exec(selector)?.[1];
        return name && metadata[name] ? { content: metadata[name] } : null;
      },
    },
  });
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const isReceipt = String(url).endsWith('/receipt');
    return new Response(
      JSON.stringify({
        code: 200,
        data: isReceipt
          ? { schemaVersion: 'openxiangda.business-process-receipt/v2' }
          : { schemaVersion: 'openxiangda.business-process-poll/v2' },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    await loadBusinessProcessReceipt('command/1');
    await pollBusinessProcessCommand('command/1', 4);
    await listBusinessProcessCommands({ resourceCode: 'records', recordId: 'record/1',
      workflowCode: 'review', operationCode: 'submit', pageSize: 2, beforeCommandId: 'command/1' });
    assert.deepEqual(requests, [
      '/service/openxiangda-api/v2/applications/root-package-test/business-process/commands/command%2F1/receipt',
      '/service/openxiangda-api/v2/applications/root-package-test/business-process/commands/command%2F1/poll?afterRevision=4',
      '/service/openxiangda-api/v2/applications/root-package-test/business-process/commands?environmentKey=preproduction&resourceCode=records&recordId=record%2F1&workflowCode=review&operationCode=submit&pageSize=2&beforeCommandId=command%2F1',
    ]);
    await assert.rejects(
      () => pollBusinessProcessCommand('command/1', -1),
      /OPENXIANGDA_BUSINESS_PROCESS_POLL_CURSOR_INVALID/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) {
      delete (globalThis as { document?: Document }).document;
    } else {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      });
    }
  }
});

test('exports the current-user authorization and Perspective Nest facade', () => {
  assert.equal(typeof nest.OpenXiangdaAuthzGuard, 'function');
  assert.equal(typeof nest.CurrentPerspective, 'function');
});

test('exports business notification schema constants from openxiangda/nest', () => {
  assert.equal(
    nest.OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2,
    'openxiangda.notification.business-send/v2',
  );
  assert.equal(
    nest.OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2,
    'openxiangda.notification.event-send/v2',
  );
});

test('keeps the physical contracts capsule private and the Skill on public entries', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.ok(manifest.exports['./nest']);
  assert.equal(manifest.exports['./contracts'], undefined);

  const backend = readFileSync(
    new URL('../../../skills/openxiangda-v2/references/backend.md', import.meta.url),
    'utf8',
  );
  assert.match(backend, /OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2/);
  assert.match(backend, /OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2/);
  assert.doesNotMatch(backend, /openxiangda\/contracts/);
  const publicAccess = readFileSync(
    new URL(
      '../../../skills/openxiangda-v2/references/public-access.md',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(publicAccess, /frontend\.publicAccess/);
  assert.match(publicAccess, /createAnonymousPublicClient/);
  assert.match(publicAccess, /own\.list/);
  assert.match(publicAccess, /own\.read/);
});

test('exports resource and App Operation schema helpers from openxiangda/config', () => {
  assert.equal(typeof resourceRecordSchema, 'function');
  assert.equal(typeof schemaRef, 'function');
  assert.equal(typeof composeJsonSchema, 'function');
  assert.equal(typeof composeAppOperationSchemas, 'function');
});

test('exports the native read-policy expression SDK helpers', () => {
  assert.equal(typeof dataPolicyExpression.allOf, 'function');
  assert.equal(typeof dataPolicyExpression.databaseNow, 'function');
  assert.equal(typeof resourceReadPolicy, 'function');
});
