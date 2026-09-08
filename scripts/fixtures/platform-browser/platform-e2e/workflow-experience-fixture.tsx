import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  defineApplicationContributions,
  OpenXiangdaApplication,
  type AdminNavigationInput,
  type AdminPagesInput,
  type StandardApplicationTodoCenterProps,
  type StandardUserPageFrameProps,
  type StandardUserSurfaceContributions,
} from 'openxiangda/react';
import { useParams, useSearchParams } from 'react-router-dom';
import { appCode } from '../../../packages/contracts/src/generated.js';
import 'openxiangda/react/styles.css';

const fixtureParams = new URLSearchParams(window.location.search);
const standardSurfaceMode = fixtureParams.get('surfaces');

const workflowDefinitions = [
  {
    code: 'purchase-approval',
    title: '采购审批',
    launch: { mode: 'standalone' },
    subject: {
      resourceCode: 'purchase-orders',
      factProjection: { amount: 'amount' },
      summaryFields: ['amount'],
    },
    processOperationCode: 'openxiangda.workflow.purchase-approval.submit',
  },
] as const;

const resourceDefinitions = {
  'purchase-orders': {
    code: 'purchase-orders',
    name: '采购申请',
    capabilities: {
      read: `app:${appCode}:data:purchase-orders:read`,
      create: `app:${appCode}:data:purchase-orders:create`,
      update: `app:${appCode}:data:purchase-orders:update`,
      delete: `app:${appCode}:data:purchase-orders:delete`,
    },
    surface: {
      mutationOwner: fixtureParams.has('transfers') ? 'workflow' : 'native',
      generated: { list: true, detail: true, create: !fixtureParams.has('transfers'), update: !fixtureParams.has('transfers'), delete: !fixtureParams.has('transfers') },
      list: { actions: { import: fixtureParams.get('transfers') !== 'hidden', export: fixtureParams.get('transfers') !== 'hidden' } },
      fields: {
        amount: {
          label: '申请金额',
          type: 'number.decimal',
          widget: 'money',
          requiredHint: true,
          readCapabilities: [`app:${appCode}:data:purchase-orders:read`],
          createCapabilities: [`app:${appCode}:data:purchase-orders:create`],
          updateCapabilities: [`app:${appCode}:data:purchase-orders:update`],
        },
      },
      form: { layout: 'flat', fieldOrder: ['amount'] },
      mobile: { enabled: true },
    },
  },
} as const;

const detailRoutes = {
  desktop: {
    code: 'purchase-detail',
    path: '/admin/operations/purchases/:instanceId',
    label: '采购审批详情',
    surface: 'admin',
    tabPersistence: 'none',
    keepAlive: 'none',
  },
  mobile: {
    code: 'purchase-detail-mobile',
    path: '/m/purchases/:instanceId',
    label: '移动采购审批详情',
    surface: 'user',
    tabPersistence: 'none',
    keepAlive: 'none',
  },
} as const;

function CustomWorkflowDetail() {
  const { instanceId } = useParams();
  const [search] = useSearchParams();
  return (
    <div data-testid="custom-workflow-detail">
      自定义流程详情 {instanceId} / {search.get('taskId') || 'instance'}
    </div>
  );
}

function StandardFrame({
  back,
  canGoBack,
  children,
  device,
  pageKind,
  route,
}: StandardUserPageFrameProps) {
  return (
    <section
      data-can-go-back={String(canGoBack)}
      data-page-kind={pageKind}
      data-route-code={route.routeCode}
      data-route-params={JSON.stringify(route.params)}
      data-testid={`standard-frame-${device}`}
    >
      <button onClick={back} type="button">返回</button>
      {children}
    </section>
  );
}

function CustomTodo({
  device,
  error,
  hasMore,
  items,
  loadMore,
  loading,
  loadingMore,
  openItem,
  query,
  refresh,
  setQuery,
}: StandardApplicationTodoCenterProps) {
  return (
    <main data-testid={`custom-todo-${device}`}>
      <h1>{device === 'mobile' ? '移动应用待办' : '桌面应用待办'}</h1>
      <output data-testid="custom-todo-query">
        {query.view}/{String(query.unread)}/{query.keyword || 'all'}
      </output>
      {error ? <div role="alert">{error}</div> : null}
      <button onClick={() => void refresh()} type="button">刷新待办</button>
      <button
        onClick={() => setQuery({ unread: !query.unread })}
        type="button"
      >
        切换未读
      </button>
      <ul aria-busy={loading || loadingMore}>
        {items.map(item => (
          <li key={item.messageId}>
            <button onClick={() => void openItem(item)} type="button">
              {item.title}
            </button>
          </li>
        ))}
      </ul>
      <button
        disabled={!hasMore || loadingMore}
        onClick={() => void loadMore()}
        type="button"
      >
        加载更多
      </button>
    </main>
  );
}

function BrokenTodo(_props: StandardApplicationTodoCenterProps) {
  throw new Error('fixture standard user renderer failure');
}

const standardUserSurfaces: StandardUserSurfaceContributions | undefined =
  standardSurfaceMode
    ? {
        frame: { desktop: StandardFrame, mobile: StandardFrame },
        applicationTodoCenter: {
          desktop:
            standardSurfaceMode === 'error' ? BrokenTodo : CustomTodo,
          mobile: standardSurfaceMode === 'error' ? BrokenTodo : CustomTodo,
        },
      }
    : undefined;

const applicationContributions = defineApplicationContributions(detailRoutes, {
  pages: {
    desktop: CustomWorkflowDetail,
    mobile: CustomWorkflowDetail,
  },
  ...(standardUserSurfaces ? { standardUserSurfaces } : {}),
});

const adminPages = (fixtureParams.has('transfers') ? [{
  code: 'resource:purchase-orders:list',
  kind: 'resource-list',
  path: '/admin/resources/purchase-orders',
  label: '采购申请',
  navigationEligible: true,
  capability: resourceDefinitions['purchase-orders'].capabilities.read,
  resourceCode: 'purchase-orders',
}, {
  code: 'resource:purchase-orders:detail',
  kind: 'resource-detail',
  path: '/admin/resources/purchase-orders/:id',
  label: '采购申请详情',
  navigationEligible: false,
  capability: resourceDefinitions['purchase-orders'].capabilities.read,
  resourceCode: 'purchase-orders',
}] : []) satisfies AdminPagesInput;

const routeManifest = {
  schemaVersion: 'openxiangda.application-route-manifest/v3',
  appCode,
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
  ],
  digest: '34cc08a02cd187a07d9e2d2f99c1080b5b86f3a4512f9e0f43ff4cb05b7195fa',
} as const;

const adminNavigation = [] as const satisfies AdminNavigationInput;

const initialPath = fixtureParams.get('initial') || '/work-center';
const runtimeBase = fixtureParams.get('base')?.trim();
if (runtimeBase) {
  for (const [name, content] of [
    ['openxiangda-runtime-base', runtimeBase],
    ['openxiangda-app-code', appCode],
    ['openxiangda-environment', 'preproduction'],
  ] as const) {
    const meta =
      document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`) ||
      document.createElement('meta');
    meta.name = name;
    meta.content = content;
    if (!meta.parentElement) document.head.appendChild(meta);
  }
}
if (location.pathname.endsWith('/workflow-experience.e2e.html')) {
  const stateToken = fixtureParams.get('state');
  history.replaceState(
    stateToken
      ? { usr: { routeNegotiationState: stateToken }, key: 'fixture-state' }
      : {},
    '',
    initialPath,
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OpenXiangdaApplication
      appCode={appCode}
      appName="流程体验验收"
      timeZone={fixtureParams.get('timeZone') || undefined}
      adminNavigation={adminNavigation}
      adminPages={adminPages}
      routeManifest={routeManifest}
      contributions={applicationContributions}
      resourceDefinitions={resourceDefinitions}
      workflows={workflowDefinitions}
    />
  </React.StrictMode>
);
