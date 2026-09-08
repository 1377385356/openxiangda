import { projectDataResourceView, type DataResourceSurface } from 'openxiangda-contracts/browser';
import { Refine } from '@refinedev/core';
import { Button, Result } from 'antd';
import {
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { OpenXiangdaUiProvider } from './ui-provider';
import { ApplicationRouter } from './navigation-guard';
import { createApplicationProvider } from './data-provider';
import { RuntimeBoundary, useRuntime } from './runtime';
import {
  applicationBasename,
  configureApplicationIdentity,
} from './runtime-meta';
import { EmptyApplicationPage, Shell } from './Shell';
import {
  AdminContributionsProvider,
  isApplicationRouteAllowed,
  useAdminContributions,
  type ApplicationRoutePageContribution,
  type OpenXiangdaApplicationContributions,
} from './admin-contributions';
import {
  AdminInformationArchitectureProvider,
  firstAllowedAdminPath,
  useAdminInformationArchitecture,
  type AdminNavigationInput,
  type AdminPagesInput,
} from './admin-information-architecture';
import type {
  GeneratedResourceDefinitions,
  GeneratedResourceDefinitionsInput,
} from './components/resource/generated-resource-definition';
import type { GeneratedResourceRoutePaths } from './components/resource/GeneratedResourceCrud';
import type { RuntimePerspective } from './runtime';
import {
  createStandardRouteManifestIndex,
  negotiateStandardRoute,
  standardRouteManifestDeviceForViewport,
  type StandardRouteManifestDevice,
  type StandardRouteManifestIndex,
} from './route-manifest';
import type {
  AnonymousPublicAccessContractV2,
  AppFrontendRouteAccess,
  AppRouteManifestEntryV3,
  AppRouteManifestV3,
} from 'openxiangda-contracts/browser';
import { isAdminAccessAllowed } from './admin-access';
import { OpenXiangdaResourceDefinitionsProvider } from './resource-definitions';
import { useGlobalRequestLoading } from './platform-client';
import {
  OpenXiangdaWorkflowDefinitionsProvider,
  type StandardWorkflowDefinitionsInput,
} from './workflow-definitions';
import {
  StandardUserSurfaceErrorBoundary,
  type StandardUserSurfaceDevice,
} from './standard-user-surfaces';

const REFINE_OPTIONS = Object.freeze({
  disableTelemetry: true,
});

const workflowPages = () =>
  import('./components/workflow/StandardWorkflowPages');
const FilePreviewPage = lazy(() =>
  import('./FilePreviewPage').then(module => ({ default: module.FilePreviewPage }))
);
const GeneratedResourcePage = lazy(() =>
  import('./components/resource/GeneratedResourceCrud').then(module => ({
    default: module.GeneratedResourcePage,
  }))
);
const WorkflowInstancePage = lazy(() =>
  workflowPages().then((module) => ({ default: module.WorkflowInstancePage })),
);
const WorkflowSubmissionPage = lazy(() =>
  workflowPages().then((module) => ({
    default: module.WorkflowSubmissionPage,
  })),
);
const WorkflowTaskPage = lazy(() =>
  workflowPages().then((module) => ({ default: module.WorkflowTaskPage })),
);
const WorkflowWorkCenterPage = lazy(() =>
  workflowPages().then((module) => ({
    default: module.WorkflowWorkCenterPage,
  })),
);
const ApplicationTodoCenterPage = lazy(() =>
  import('./components/todo/ApplicationTodoCenterPage').then((module) => ({
    default: module.ApplicationTodoCenterPage,
  })),
);

function WorkflowRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={<div className="oxa-page-loading">正在加载审批页面…</div>}
    >
      {children}
    </Suspense>
  );
}

function ApplicationRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={<div className="oxa-page-loading">正在加载应用页面…</div>}
    >
      {children}
    </Suspense>
  );
}

function StandardUserPageSurface({
  children,
  device,
  entry,
  portalRoot,
}: {
  children: ReactNode;
  device: StandardUserSurfaceDevice;
  entry: Readonly<AppRouteManifestEntryV3>;
  portalRoot: AppRouteManifestV3['rootEntry'];
}) {
  const contributions = useAdminContributions();
  const location = useLocation();
  const navigate = useNavigate();
  const routeParams = useParams();
  const Frame = contributions.standardUserSurfaces?.frame[device];
  const canGoBack =
    typeof window !== 'undefined' &&
    Number(window.history.state?.idx || 0) > 0;
  const back = useCallback(() => {
    if (
      typeof window !== 'undefined' &&
      Number(window.history.state?.idx || 0) > 0
    ) {
      navigate(-1);
      return;
    }
    navigate(portalRoot[device], { replace: true });
  }, [device, navigate, portalRoot]);
  const route = useMemo(
    () =>
      Object.freeze({
        entryCode: entry.code,
        routeCode: entry[device].routeCode,
        pattern: entry[device].path,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        params: Object.freeze(
          Object.fromEntries(
            Object.entries(routeParams).filter(
              (item): item is [string, string] =>
                typeof item[1] === 'string',
            ),
          ),
        ),
      }),
    [device, entry, location.hash, location.pathname, location.search, routeParams],
  );
  const content = Frame ? (
    <Frame
      back={back}
      canGoBack={canGoBack}
      device={device}
      mobile={device === 'mobile'}
      pageKind={entry.kind}
      route={route}
    >
      {children}
    </Frame>
  ) : (
    children
  );
  return (
    <StandardUserSurfaceErrorBoundary
      resetKey={`${device}:${entry.code}:${location.pathname}:${location.search}`}
    >
      {content}
    </StandardUserSurfaceErrorBoundary>
  );
}

function StandardUserRoute({
  children,
  device,
  entry,
  portalRoot,
  workflow = false,
}: {
  children: ReactNode;
  device: StandardUserSurfaceDevice;
  entry: Readonly<AppRouteManifestEntryV3>;
  portalRoot: AppRouteManifestV3['rootEntry'];
  workflow?: boolean;
}) {
  const content = (
    <StandardUserPageSurface
      device={device}
      entry={entry}
      portalRoot={portalRoot}
    >
      {children}
    </StandardUserPageSurface>
  );
  return workflow ? (
    <WorkflowRoute>{content}</WorkflowRoute>
  ) : (
    <ApplicationRoute>{content}</ApplicationRoute>
  );
}

function GeneratedResourceRoute(props: {
  adminAccess?: Readonly<AppFrontendRouteAccess>;
  portalRoot: AppRouteManifestV3['rootEntry'];
  resourceCode: string;
  viewCode?: string;
  mode?: 'list' | 'create' | 'edit' | 'detail';
  variant?: 'desktop' | 'mobile';
  paths: GeneratedResourceRoutePaths;
  devicePolicy: AppRouteManifestV3['devicePolicy'];
  mobileEnabled: boolean;
}) {
  const device = useViewportDevice(props.devicePolicy);
  const variant = props.variant === 'mobile' || (props.mode !== 'list' && props.mobileEnabled && device === 'mobile') ? 'mobile' : 'desktop';
  const content = (
    <ApplicationRoute>
      <GeneratedResourcePage {...props} variant={variant} />
    </ApplicationRoute>
  );
  return (
    <AdminAccessBoundary access={props.adminAccess} portalRoot={props.portalRoot}>
      {variant === 'desktop' && props.mode === 'list' ? <Shell>{content}</Shell> : content}
    </AdminAccessBoundary>
  );
}

function resourceRoutePaths(
  pages: AdminPagesInput,
  resourceCode: string,
  variant: 'desktop' | 'mobile',
  viewCode?: string
): GeneratedResourceRoutePaths {
  const project = (path: string) =>
    variant === 'mobile' ? `/m${path}` : path;
  const byKind = new Map(
    pages
      .filter(page => page.resourceCode === resourceCode && page.viewCode === viewCode)
      .map(page => [page.kind, project(page.path)] as const)
  );
  return Object.freeze({
    fallback: variant === 'mobile' ? '/' : '/admin',
    ...(byKind.get('resource-list')
      ? { list: byKind.get('resource-list') }
      : {}),
    ...(byKind.get('resource-detail')
      ? { detail: byKind.get('resource-detail') }
      : {}),
    ...(byKind.get('resource-create')
      ? { create: byKind.get('resource-create') }
      : {}),
    ...(byKind.get('resource-update')
      ? { edit: byKind.get('resource-update') }
      : {}),
  });
}

export interface OpenXiangdaApplicationProps {
  appCode: string;
  appName: string;
  /** Presentation only; canonical datetime values remain UTC instants. */
  timeZone?: string;
  adminAccess?: Readonly<AppFrontendRouteAccess>;
  resourceDefinitions: GeneratedResourceDefinitionsInput;
  adminPages: AdminPagesInput;
  adminNavigation: AdminNavigationInput;
  routeManifest: AppRouteManifestV3;
  perspectives?: readonly RuntimePerspective[];
  workflows?: StandardWorkflowDefinitionsInput;
  contributions?: OpenXiangdaApplicationContributions;
  publicAccess?: AnonymousPublicAccessContractV2 | null;
}

function AdminAccessBoundary({
  access,
  children,
  portalRoot,
}: {
  access?: Readonly<AppFrontendRouteAccess>;
  children: ReactNode;
  portalRoot: AppRouteManifestV3['rootEntry'];
}) {
  const { hasCapability } = useRuntime();
  const location = useLocation();
  const navigate = useNavigate();
  if (isAdminAccessAllowed(access, hasCapability)) return children;
  const portalPath = location.pathname.startsWith('/m/')
    ? portalRoot.mobile
    : portalRoot.desktop;
  return (
    <Result
      extra={
        <Button type="primary" onClick={() => navigate(portalPath, { replace: true })}>
          返回门户
        </Button>
      }
      status="403"
      subTitle="当前账号不能进入管理后台，请返回门户办理业务。"
      title="无管理后台访问权限"
    />
  );
}

function ApplicationAdminEntry({
  adminAccess,
  portalRoot,
}: {
  adminAccess?: Readonly<AppFrontendRouteAccess>;
  portalRoot: AppRouteManifestV3['rootEntry'];
}) {
  const { hasCapability, hasReadCapability } = useRuntime();
  const architecture = useAdminInformationArchitecture();
  const contributions = useAdminContributions();
  if (!isAdminAccessAllowed(adminAccess, hasCapability)) {
    return (
      <AdminAccessBoundary access={adminAccess} portalRoot={portalRoot}>
        <EmptyApplicationPage />
      </AdminAccessBoundary>
    );
  }
  const target = firstAllowedAdminPath(
    architecture,
    hasCapability,
    hasReadCapability,
    routeCode => {
      const route = contributions.routes.find(
        contribution => contribution.route.code === routeCode,
      );
      return Boolean(
        route &&
          route.route.surface === 'admin' &&
          isApplicationRouteAllowed(
            route,
            contributions.routes,
            hasCapability,
          ),
      );
    },
  );
  return target ? <Navigate replace to={target} /> : <EmptyApplicationPage />;
}

function ApplicationRootEntry({
  adminAccess,
  index,
}: {
  adminAccess?: Readonly<AppFrontendRouteAccess>;
  index: StandardRouteManifestIndex;
}) {
  const location = useLocation();
  const device = useViewportDevice(index.manifest.devicePolicy);
  const target = device ? index.manifest.rootEntry[device] : undefined;
  if (target && target !== location.pathname) {
    return (
      <Navigate
        replace
        to={{
          pathname: target,
          search: location.search,
          hash: location.hash,
        }}
        state={location.state}
      />
    );
  }
  return (
    <ApplicationAdminEntry
      adminAccess={adminAccess}
      portalRoot={index.manifest.rootEntry}
    />
  );
}

function ApplicationContributionRoute({
  contribution,
  allRoutes,
  adminAccess,
  portalRoot,
}: {
  contribution: ApplicationRoutePageContribution;
  allRoutes: readonly ApplicationRoutePageContribution[];
  adminAccess?: Readonly<AppFrontendRouteAccess>;
  portalRoot: AppRouteManifestV3['rootEntry'];
}) {
  const { hasCapability } = useRuntime();
  const Component = contribution.component;
  const content = !isApplicationRouteAllowed(
    contribution,
    allRoutes,
    hasCapability,
  ) ? (
    <Result status="403" title="当前平台用户无此页面权限" />
  ) : (
    <ApplicationRoute>
      <Component route={contribution.route} />
    </ApplicationRoute>
  );
  return contribution.route.surface === 'admin' ? (
    <AdminAccessBoundary access={adminAccess} portalRoot={portalRoot}>
      <Shell>{content}</Shell>
    </AdminAccessBoundary>
  ) : (
    content
  );
}

function GlobalRequestLoading() {
  const loading = useGlobalRequestLoading();
  return loading ? (
    <div
      aria-label="页面请求进行中"
      aria-valuetext="正在加载"
      className="oxa-global-request-loading"
      role="progressbar"
    >
      <span />
    </div>
  ) : null;
}

function readViewportDevice(
  policy: AppRouteManifestV3['devicePolicy'],
): StandardRouteManifestDevice | null {
  if (typeof window === 'undefined') return null;
  return standardRouteManifestDeviceForViewport(policy, window.innerWidth);
}

function useViewportDevice(policy: AppRouteManifestV3['devicePolicy']) {
  const [device, setDevice] = useState<StandardRouteManifestDevice | null>(
    () => readViewportDevice(policy),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = (next: StandardRouteManifestDevice) =>
      setDevice(current => (current === next ? current : next));
    const onResize = () =>
      update(standardRouteManifestDeviceForViewport(policy, window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [policy]);

  return device;
}

/**
 * Negotiate only compiler-owned standard route pairs.  This component is
 * deliberately independent of authorization and application pages so the
 * policy can be rolled back with the runtime package alone.  A replace
 * navigation retains the current history boundary while the explicit state,
 * query and hash keep deep-link context intact.
 */
function StandardRouteDeviceNegotiator({
  index,
}: {
  index: StandardRouteManifestIndex;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const device = useViewportDevice(index.manifest.devicePolicy);
  const redirectKey = useRef<string | undefined>(undefined);
  const initialPath = useRef(location.pathname);
  const initialized = useRef(false);

  useEffect(() => {
    if (!device) return;
    if (!initialized.current) {
      initialized.current = true;
      const explicitPaths = [
        index.manifest.authentication.desktop.path,
        index.manifest.authentication.mobile.path,
      ];
      const normalizePath = (path: string) =>
        path.length > 1 ? path.replace(/\/$/, '') : path;
      if (
        explicitPaths.some(
          path => normalizePath(path) === normalizePath(initialPath.current),
        )
      ) {
        return;
      }
    }
    const currentUrl = `${location.pathname}${location.search}${location.hash}`;
    const target = negotiateStandardRoute(
      index,
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      device,
    );
    if (!target) return;
    const targetUrl = `${target.pathname}${target.search}${target.hash}`;
    if (targetUrl === currentUrl) return;
    const key = `${device}:${currentUrl}`;
    // The guard only suppresses a duplicate effect for the same source URL.
    // Clear it when navigation or a viewport transition changes the key so a
    // later, intentional reverse transition is still allowed.
    if (redirectKey.current && redirectKey.current !== key) {
      redirectKey.current = undefined;
    }
    if (redirectKey.current === key) return;
    redirectKey.current = key;
    navigate(targetUrl, { replace: true, state: location.state });
  }, [
    device,
    index,
    location.hash,
    location.pathname,
    location.search,
    navigate,
  ]);

  return null;
}

export function OpenXiangdaApplication({
  adminAccess,
  appCode,
  appName,
  timeZone,
  resourceDefinitions: readonlyResourceDefinitions,
  adminPages,
  adminNavigation,
  routeManifest,
  perspectives = [],
  workflows = [],
  contributions,
  publicAccess,
}: OpenXiangdaApplicationProps) {
  configureApplicationIdentity({ appCode, appName });
  const routeManifestIndex = useMemo(
    () => createStandardRouteManifestIndex(routeManifest, appCode),
    [appCode, routeManifest],
  );
  const resourceDefinitions =
    readonlyResourceDefinitions as unknown as GeneratedResourceDefinitions;
  const codes = Object.keys(resourceDefinitions);
  const contributionRoutes = contributions?.routes || [];
  const adminEntry = (
    <ApplicationAdminEntry
      adminAccess={adminAccess}
      portalRoot={routeManifest.rootEntry}
    />
  );
  const resourcePages = adminPages.filter(page => page.resourceCode);
  const resourceRoutes = resourcePages.flatMap(page => {
    const resourceCode = page.resourceCode!;
    const mode =
      page.kind === 'resource-create'
        ? 'create'
        : page.kind === 'resource-update'
          ? 'edit'
          : page.kind === 'resource-detail'
            ? 'detail'
            : 'list';
    const desktopPaths = resourceRoutePaths(
      resourcePages,
      resourceCode,
      'desktop', page.viewCode
    );
    const mobilePaths = resourceRoutePaths(
      resourcePages,
      resourceCode,
      'mobile', page.viewCode
    );
    const mobilePath = `/m${page.path}`;
    const declared = resourceDefinitions[resourceCode];
    const mobileEnabled = declared && projectDataResourceView(declared.surface as DataResourceSurface, page.viewCode).mobile?.enabled !== false;
    return [
      <Route
        key={page.code}
        path={page.path}
        element={
          <GeneratedResourceRoute
            devicePolicy={routeManifest.devicePolicy}
            mobileEnabled={Boolean(mobileEnabled)}
            adminAccess={adminAccess}
            mode={mode}
            paths={desktopPaths}
            portalRoot={routeManifest.rootEntry}
            resourceCode={resourceCode}
            viewCode={page.viewCode}
          />
        }
      />,
      ...(mobileEnabled ? [<Route
        key={`${page.code}:mobile`}
        path={mobilePath}
        element={
          <GeneratedResourceRoute
            devicePolicy={routeManifest.devicePolicy}
            mobileEnabled={Boolean(mobileEnabled)}
            adminAccess={adminAccess}
            mode={mode}
            paths={mobilePaths}
            portalRoot={routeManifest.rootEntry}
            resourceCode={resourceCode}
            viewCode={page.viewCode}
            variant="mobile"
          />
        }
      />] : []),
    ];
  });
  const applicationRoutes = contributionRoutes.map((contribution) => (
    <Route
      element={
        <ApplicationContributionRoute
          adminAccess={adminAccess}
          allRoutes={contributionRoutes}
          contribution={contribution}
          portalRoot={routeManifest.rootEntry}
        />
      }
      key={contribution.route.code}
      path={contribution.route.path}
    />
  ));
  const workflowInstanceRoute = routeManifestIndex.entries.get(
    'workflow:instance',
  );
  const workflowRoutes = routeManifestIndex.manifest.routes.flatMap(entry => {
    if (entry.kind === 'application-todo-center') {
      return [
        <Route
          key={entry.code}
          path={entry.desktop.path}
          element={
            <StandardUserRoute
              device="desktop"
              entry={entry}
              portalRoot={routeManifest.rootEntry}
            >
              <ApplicationTodoCenterPage messageCenter />
            </StandardUserRoute>
          }
        />,
        <Route
          key={`${entry.code}:mobile`}
          path={entry.mobile.path}
          element={
            <StandardUserRoute
              device="mobile"
              entry={entry}
              portalRoot={routeManifest.rootEntry}
            >
              <ApplicationTodoCenterPage variant="mobile" messageCenter />
            </StandardUserRoute>
          }
        />,
      ];
    }
    if (entry.kind === 'workflow-work-center') {
      return [
        <Route
          key={entry.code}
          path={entry.desktop.path}
          element={
            <StandardUserRoute
              device="desktop"
              entry={entry}
              portalRoot={routeManifest.rootEntry}
              workflow
            >
              <WorkflowWorkCenterPage />
            </StandardUserRoute>
          }
        />,
        <Route
          key={`${entry.code}:mobile`}
          path={entry.mobile.path}
          element={
            <StandardUserRoute
              device="mobile"
              entry={entry}
              portalRoot={routeManifest.rootEntry}
              workflow
            >
              <WorkflowWorkCenterPage variant="mobile" />
            </StandardUserRoute>
          }
        />,
      ];
    }
    if (entry.kind === 'workflow-task') {
      return [
        <Route
          key={entry.code}
          path={entry.desktop.path}
          element={
            <StandardUserRoute
              device="desktop"
              entry={entry}
              portalRoot={routeManifest.rootEntry}
              workflow
            >
              <WorkflowTaskPage />
            </StandardUserRoute>
          }
        />,
        <Route
          key={`${entry.code}:mobile`}
          path={entry.mobile.path}
          element={
            <StandardUserRoute
              device="mobile"
              entry={entry}
              portalRoot={routeManifest.rootEntry}
              workflow
            >
              <WorkflowTaskPage variant="mobile" />
            </StandardUserRoute>
          }
        />,
      ];
    }
    if (entry.kind === 'workflow-instance') {
      return [
        <Route
          key={entry.code}
          path={entry.desktop.path}
          element={
            <StandardUserRoute
              device="desktop"
              entry={entry}
              portalRoot={routeManifest.rootEntry}
              workflow
            >
              <WorkflowInstancePage />
            </StandardUserRoute>
          }
        />,
        <Route
          key={`${entry.code}:mobile`}
          path={entry.mobile.path}
          element={
            <StandardUserRoute
              device="mobile"
              entry={entry}
              portalRoot={routeManifest.rootEntry}
              workflow
            >
              <WorkflowInstancePage variant="mobile" />
            </StandardUserRoute>
          }
        />,
      ];
    }
    if (entry.kind === 'workflow-launch') {
      return [
        <Route
          key={entry.code}
          path={entry.desktop.path}
          element={
            <StandardUserRoute
              device="desktop"
              entry={entry}
              portalRoot={routeManifest.rootEntry}
              workflow
            >
              <WorkflowSubmissionPage
                instancePath={workflowInstanceRoute?.desktop.path}
              />
            </StandardUserRoute>
          }
        />,
        <Route
          key={`${entry.code}:mobile`}
          path={entry.mobile.path}
          element={
            <StandardUserRoute
              device="mobile"
              entry={entry}
              portalRoot={routeManifest.rootEntry}
              workflow
            >
              <WorkflowSubmissionPage
                instancePath={workflowInstanceRoute?.mobile.path}
                variant="mobile"
              />
            </StandardUserRoute>
          }
        />,
      ];
    }
    return [];
  });
  const provider = createApplicationProvider(resourceDefinitions);

  return (
    <AdminInformationArchitectureProvider
      navigation={adminNavigation}
      pages={adminPages}
      standardRoutes={routeManifest.routes}
    >
      <AdminContributionsProvider contributions={contributions}>
      <OpenXiangdaResourceDefinitionsProvider definitions={resourceDefinitions}>
        <OpenXiangdaWorkflowDefinitionsProvider definitions={workflows}>
          <OpenXiangdaUiProvider timeZone={timeZone}>
            <ApplicationRouter basename={applicationBasename()}>
              <GlobalRequestLoading />
              <StandardRouteDeviceNegotiator index={routeManifestIndex} />
              <RuntimeBoundary
                authentication={contributions?.authentication}
                perspectives={perspectives}
                publicAccess={publicAccess}
                routeManifest={routeManifest}
                routes={contributionRoutes}
              >
                <Refine
                  dataProvider={provider}
                  options={REFINE_OPTIONS}
                  resources={codes.map((code) => {
                    const byKind = new Map(
                      resourcePages
                        .filter(page => page.resourceCode === code && page.viewCode === undefined)
                        .map(page => [page.kind, page.path]),
                    );
                    return {
                      name: code,
                      ...(byKind.get('resource-list')
                        ? { list: byKind.get('resource-list') }
                        : {}),
                      ...(byKind.get('resource-create')
                        ? { create: byKind.get('resource-create') }
                        : {}),
                      ...(byKind.get('resource-update')
                        ? { edit: byKind.get('resource-update') }
                        : {}),
                      ...(byKind.get('resource-detail')
                        ? { show: byKind.get('resource-detail') }
                        : {}),
                    };
                  })}
                >
                  <Routes>
                    <Route
                      path="/"
                      element={
                        <ApplicationRootEntry
                          adminAccess={adminAccess}
                          index={routeManifestIndex}
                        />
                      }
                    />
                    <Route
                      path="/m/"
                      element={
                        <ApplicationRootEntry
                          adminAccess={adminAccess}
                          index={routeManifestIndex}
                        />
                      }
                    />
                    <Route
                      path="/m"
                      element={
                        <ApplicationRootEntry
                          adminAccess={adminAccess}
                          index={routeManifestIndex}
                        />
                      }
                    />
                    <Route path="/admin" element={adminEntry} />
                    <Route
                      path="/files/:resourceCode/:fileId/preview"
                      element={
                        <ApplicationRoute>
                          <FilePreviewPage />
                        </ApplicationRoute>
                      }
                    />
                    {resourceRoutes}
                    {workflowRoutes}
                    {applicationRoutes}
                    <Route
                      path="/admin/*"
                      element={
                        <AdminAccessBoundary
                          access={adminAccess}
                          portalRoot={routeManifest.rootEntry}
                        >
                          <EmptyApplicationPage />
                        </AdminAccessBoundary>
                      }
                    />
                    <Route
                      path="/m/admin/*"
                      element={
                        <AdminAccessBoundary
                          access={adminAccess}
                          portalRoot={routeManifest.rootEntry}
                        >
                          <EmptyApplicationPage />
                        </AdminAccessBoundary>
                      }
                    />
                  </Routes>
                </Refine>
              </RuntimeBoundary>
            </ApplicationRouter>
          </OpenXiangdaUiProvider>
        </OpenXiangdaWorkflowDefinitionsProvider>
      </OpenXiangdaResourceDefinitionsProvider>
      </AdminContributionsProvider>
    </AdminInformationArchitectureProvider>
  );
}
