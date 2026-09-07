import { Alert, Button, Result, Spin } from 'antd';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type {
  AnonymousPublicAccessContractV2,
  AppPerspectiveContract,
  AppRouteManifestV3,
} from 'openxiangda-contracts';
import {
  isApplicationUnauthenticatedError,
  createAnonymousPublicClient,
  loadRuntimeAuthorization,
  loadApplicationLoginSurface,
  OpenXiangdaPlatformRequestError,
  subscribePlatformSessionInvalidation,
  type RuntimeAuthorization,
  type RuntimeIdentity,
} from './platform-client';
import {
  applicationCode,
  applicationName,
  runtimeMount,
  setActivePerspectiveCode,
} from './runtime-meta';
import {
  ApplicationLoginController,
  type ApplicationAuthenticationSurfaceContribution,
} from './authentication';
import type { ApplicationRoutePageContribution } from './admin-contributions';
import {
  standardRouteManifestDeviceForViewport,
  type StandardRouteManifestDevice,
} from './route-manifest';

export type RuntimePerspective = AppPerspectiveContract;

interface RuntimeValue {
  identity: RuntimeIdentity;
  authorization: RuntimeAuthorization;
  identityEpoch: number;
  hasCapability(code: string): boolean;
  hasReadCapability(code: string): boolean;
  perspectives: RuntimePerspective[];
  perspective: RuntimePerspective | null;
  setPerspective(code: string | null): void;
}

const RuntimeContext = createContext<RuntimeValue | null>(null);

export type RuntimeAuthorizationFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'temporarily-unavailable';

export function classifyRuntimeAuthorizationFailure(
  error: unknown,
): RuntimeAuthorizationFailureKind {
  if (isApplicationUnauthenticatedError(error)) return 'unauthenticated';
  if (
    error instanceof OpenXiangdaPlatformRequestError &&
    error.status === 403
  ) {
    return 'forbidden';
  }
  return 'temporarily-unavailable';
}

function useRuntimeManifestViewportDevice(
  manifest: AppRouteManifestV3 | undefined,
): StandardRouteManifestDevice | null {
  const [device, setDevice] = useState<StandardRouteManifestDevice | null>(() => {
    if (!manifest || typeof window === 'undefined') return null;
    return standardRouteManifestDeviceForViewport(
      manifest.devicePolicy,
      window.innerWidth,
    );
  });

  useEffect(() => {
    if (!manifest || typeof window === 'undefined') return;
    const update = () => {
      const next = standardRouteManifestDeviceForViewport(
        manifest.devicePolicy,
        window.innerWidth,
      );
      setDevice(current => (current === next ? current : next));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [manifest]);

  return device;
}

function manifestPathMatches(pathname: string, path: string) {
  const normalize = (value: string) =>
    value.length > 1 ? value.replace(/\/$/, '') : value;
  return normalize(pathname) === normalize(path);
}

export function resolveRuntimeManifestNavigation({
  manifest,
  authentication,
  pathname,
  viewportDevice,
}: {
  manifest?: AppRouteManifestV3;
  authentication: readonly ApplicationAuthenticationSurfaceContribution[];
  pathname: string;
  viewportDevice: StandardRouteManifestDevice | null;
}) {
  const manifestDevice = manifest
    ? manifestPathMatches(pathname, manifest.authentication.mobile.path)
      ? 'mobile'
      : manifestPathMatches(pathname, manifest.authentication.desktop.path)
        ? 'desktop'
        : undefined
    : undefined;
  const loginContribution = authentication.find(item =>
    manifestPathMatches(item.surface.path, pathname),
  );
  const requestedDevice: StandardRouteManifestDevice =
    loginContribution?.surface.device ||
    manifestDevice ||
    viewportDevice ||
    'desktop';
  const deviceLoginContribution = authentication.find(
    item => item.surface.device === requestedDevice,
  );
  return {
    loginContribution,
    requestedDevice,
    deviceLoginContribution,
  };
}

export function RuntimeBoundary({
  children,
  perspectives = [],
  authentication = [],
  routes = [],
  publicAccess,
  routeManifest,
}: {
  children: React.ReactNode;
  perspectives?: readonly RuntimePerspective[];
  authentication?: readonly ApplicationAuthenticationSurfaceContribution[];
  routes?: readonly ApplicationRoutePageContribution[];
  publicAccess?: AnonymousPublicAccessContractV2 | null;
  routeManifest?: AppRouteManifestV3;
}) {
  const [authorization, setAuthorization] = useState<RuntimeAuthorization>();
  const [error, setError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const [identityEpoch, setIdentityEpoch] = useState(0);
  const [pendingRedirect, setPendingRedirect] = useState<string>();
  const location = useLocation();
  const navigate = useNavigate();
  const publicPolicy = publicAccess?.policies.find(policy => {
    const route = routes.find(item => item.route.code === policy.routeCode);
    return route?.route.path === location.pathname;
  });
  const [publicReady, setPublicReady] = useState(false);
  const [publicError, setPublicError] = useState<Error>();

  useEffect(() => {
    let active = true;
    if (publicPolicy) {
      setAuthorization(undefined);
      setError(undefined);
      setPublicReady(false);
      setPublicError(undefined);
      void createAnonymousPublicClient({
        routeCode: publicPolicy.routeCode,
        policyCode: publicPolicy.code,
      })
        .bootstrap()
        .then(
          () => active && setPublicReady(true),
          reason =>
            active &&
            setPublicError(
              reason instanceof Error ? reason : new Error(String(reason)),
            ),
        );
      return () => {
        active = false;
      };
    }
    setPublicReady(false);
    setPublicError(undefined);
    setAuthorization(undefined);
    setError(undefined);
    void loadRuntimeAuthorization({ refresh: attempt > 0 }).then(
      value => {
        if (!active) return;
        setAuthorization(value);
        setIdentityEpoch(epoch => epoch + 1);
      },
      reason =>
        active &&
        setError(reason instanceof Error ? reason : new Error(String(reason)))
    );
    return () => {
      active = false;
    };
  }, [attempt, publicPolicy?.code, publicPolicy?.routeCode]);

  useEffect(
    () =>
      subscribePlatformSessionInvalidation(() => {
        setAuthorization(undefined);
        setError(
          new OpenXiangdaPlatformRequestError({
            code: 'APPLICATION_AUTH_UNAUTHENTICATED',
            status: 401,
            message: '当前平台登录已退出',
          }),
        );
      }),
    [],
  );

  const identity = authorization?.identity || null;
  const production =
    identity?.environment.key === 'production' ||
    runtimeMount()?.environmentKey === 'production';
  const viewportDevice = useRuntimeManifestViewportDevice(routeManifest);
  const {
    loginContribution,
    requestedDevice,
    deviceLoginContribution,
  } = resolveRuntimeManifestNavigation({
    authentication,
    manifest: routeManifest,
    pathname: location.pathname,
    viewportDevice,
  });
  const currentReturnTo = `${location.pathname}${location.search}${location.hash}`;
  const failureKind = error
    ? classifyRuntimeAuthorizationFailure(error)
    : undefined;
  const declaredReturnTo = loginContribution
    ? new URLSearchParams(location.search).get('returnTo') ||
      routePathForCode(loginContribution.surface.defaultRouteCode, routes) ||
      routeManifest?.rootEntry[requestedDevice] ||
      '/'
    : currentReturnTo;

  useEffect(() => {
    if (!authorization?.identity || !pendingRedirect) return;
    const redirectTo = pendingRedirect;
    setPendingRedirect(undefined);
    navigate(redirectTo, { replace: true });
  }, [authorization?.identity, navigate, pendingRedirect]);

  if (publicPolicy) {
    if (publicError) {
      return (
        <Result
          status="error"
          title="公开页面暂时不可用"
          subTitle="匿名浏览器会话或公开访问策略无法建立，请稍后重试。"
          extra={
            <Button onClick={() => setAttempt(value => value + 1)}>
              重试
            </Button>
          }
        />
      );
    }
    if (!publicReady) {
      return (
        <div className="oxa-loading">
          <Spin description="正在建立匿名浏览器会话" />
        </div>
      );
    }
    return <AnonymousPublicRuntime>{children}</AnonymousPublicRuntime>;
  }

  return (
    <>
      {production && (
        <Alert
          banner
          showIcon
          type="error"
          data-testid="production-data-warning"
          title="正在使用正式数据：所有新增、编辑和删除都会影响生产环境"
        />
      )}
      {error && failureKind === 'unauthenticated' && loginContribution ? (
        <ApplicationLoginController
          app={{ code: applicationCode(), name: applicationName() }}
          contribution={loginContribution}
          returnTo={declaredReturnTo}
          onAuthenticated={async redirectTo => {
            setPendingRedirect(redirectTo);
            setAttempt(value => value + 1);
          }}
        />
      ) : error &&
        failureKind === 'unauthenticated' &&
        deviceLoginContribution ? (
        <Navigate
          replace
          to={`${deviceLoginContribution.surface.path}?returnTo=${encodeURIComponent(
            currentReturnTo,
          )}`}
        />
      ) : error && failureKind === 'forbidden' ? (
        <Result
          status="403"
          title="当前账号无权访问此应用"
          subTitle="当前身份已登录，但缺少访问该应用或当前功能所需的授权。"
          extra={
            <Button onClick={() => setAttempt(value => value + 1)}>
              重新检查
            </Button>
          }
        />
      ) : error ? (
        <Result
          status="error"
          title="登录与权限服务暂时不可用"
          subTitle="网络或平台服务异常；当前会话不会因此被清除，请稍后重试。"
          extra={
            <Button onClick={() => setAttempt(value => value + 1)}>
              重试
            </Button>
          }
        />
      ) : authorization?.state === 'unassigned' ? (
        <Result
          status="403"
          title="尚未分配应用角色"
          subTitle="请联系应用管理员，为当前用户分配至少一个当前环境中的应用角色。"
          extra={
            <Button onClick={() => setAttempt(value => value + 1)}>
              重新检查
            </Button>
          }
        />
      ) : identity && authorization ? (
        loginContribution ? (
          pendingRedirect ? <div className="oxa-loading"><Spin description="正在返回原页面" /></div> :
          <AuthenticatedLoginReturn returnTo={declaredReturnTo} device={loginContribution.surface.device} />
        ) : (
          <ActiveRuntime
            authorization={authorization}
            identityEpoch={identityEpoch}
            perspectives={perspectives}
          >
            {children}
          </ActiveRuntime>
        )
      ) : (
        <div className="oxa-loading">
          <Spin description="正在读取当前用户的角色并集与权限" />
        </div>
      )}
    </>
  );
}

function AnonymousPublicRuntime({ children }: { children: React.ReactNode }) {
  const environmentKey = runtimeMount()?.environmentKey || 'preproduction';
  const identity = useMemo(
    () =>
      ({
        userId: 'anonymous-browser',
        roleCodes: [],
        capabilityCodes: [],
        isAppSuperAdmin: false,
        identityScope: `anonymous-public:${applicationCode()}:${environmentKey}`,
        subjectProfile: {},
        roles: [],
        environment: { id: 'anonymous-public', key: environmentKey },
      }) as unknown as RuntimeIdentity,
    [environmentKey],
  );
  const authorization = useMemo<RuntimeAuthorization>(
    () => ({ state: 'active', identity }),
    [identity],
  );
  const value = useMemo<RuntimeValue>(
    () => ({
      identity,
      authorization,
      identityEpoch: 1,
      hasCapability: () => false,
      hasReadCapability: () => false,
      perspectives: [],
      perspective: null,
      setPerspective: () => undefined,
    }),
    [authorization, identity],
  );
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

/** 已恢复身份时仍由平台校验原目标，不在登录页提前跳到默认首页。 */
function AuthenticatedLoginReturn({ returnTo, device }: { returnTo: string; device: 'desktop' | 'mobile' }) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([returnTo, device, attempt]);
  const [result, setResult] = useState<{ key: string; target?: string; failed?: boolean }>();
  useEffect(() => {
    let active = true;
    void loadApplicationLoginSurface({ returnTo, device }).then(surface => {
      if (active) setResult({ key, target: surface.returnTo });
    }, () => {
      if (active) setResult({ key, failed: true });
    });
    return () => { active = false; };
  }, [returnTo, device, key]);
  const current = result?.key === key ? result : undefined;
  if (current?.target) return <Navigate replace to={current.target} />;
  if (current?.failed) return <Result status="error" title="暂时无法返回原页面"
    subTitle="原目标尚未通过平台校验，请重试或检查访问地址。"
    extra={<Button onClick={() => setAttempt(value => value + 1)}>重试</Button>} />;
  return <div className="oxa-loading"><Spin description="正在返回原页面" /></div>;
}

function routePathForCode(
  routeCode: string,
  routes: readonly ApplicationRoutePageContribution[],
) {
  return routes.find(item => item.route.code === routeCode)?.route.path;
}

function ActiveRuntime({
  authorization,
  children,
  identityEpoch,
  perspectives: declaredPerspectives,
}: {
  authorization: RuntimeAuthorization;
  children: React.ReactNode;
  identityEpoch: number;
  perspectives: readonly RuntimePerspective[];
}) {
  const identity = authorization.identity!;
  const perspectives = useMemo(
    () =>
      declaredPerspectives.filter(perspective =>
        perspective.roleCodes.some(roleCode =>
          identity.roleCodes.includes(roleCode)
        )
      ),
    [declaredPerspectives, identity.roleCodes]
  );
  const storageKey = `openxiangda:perspective:${applicationCode()}:${identity.environment.key}:${identity.userId}`;
  const [perspectiveCode, setPerspectiveCode] = useState<string | null>(() => {
    const stored = readPerspectivePreference(storageKey);
    if (stored && perspectives.some(item => item.code === stored)) return stored;
    return perspectives.find(item => item.default)?.code || null;
  });
  const perspective =
    perspectives.find(item => item.code === perspectiveCode) || null;

  useLayoutEffect(() => {
    setActivePerspectiveCode(perspective?.code || null);
    writePerspectivePreference(storageKey, perspective?.code || null);
    return () => setActivePerspectiveCode(null);
  }, [perspective?.code, storageKey]);

  const value = useMemo<RuntimeValue>(
    () => ({
      identity,
      authorization,
      identityEpoch,
      hasCapability: code =>
        identity.isAppSuperAdmin || identity.capabilityCodes.includes(code),
      hasReadCapability: code =>
        identity.isAppSuperAdmin ||
        (!perspective
          ? identity.capabilityCodes.includes(code)
          : perspective.capabilityCodes.includes(code)),
      perspectives,
      perspective,
      setPerspective: code => {
        const normalized = String(code || '').trim();
        if (
          normalized &&
          !perspectives.some(item => item.code === normalized)
        ) {
          throw new Error('OPENXIANGDA_PERSPECTIVE_NOT_AVAILABLE');
        }
        setPerspectiveCode(normalized || null);
      },
    }),
    [authorization, identity, identityEpoch, perspective, perspectives]
  );

  return (
    <RuntimeContext.Provider
      key={`${identity.identityScope}:${identityEpoch}:${perspective?.code || 'union'}`}
      value={value}
    >
      {children}
    </RuntimeContext.Provider>
  );
}

function readPerspectivePreference(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePerspectivePreference(key: string, code: string | null) {
  try {
    if (code) window.localStorage.setItem(key, code);
    else window.localStorage.removeItem(key);
  } catch {
    // Perspective is a convenience preference; request authorization is intact.
  }
}

export function useRuntime() {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error('OPENXIANGDA_RUNTIME_NOT_READY');
  return value;
}
