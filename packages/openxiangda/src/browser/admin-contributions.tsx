import type { AppFrontendRouteContract } from 'openxiangda-contracts/browser';
import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from 'react';
import type {
  ApplicationAuthenticationSurfaceContribution,
  ApplicationLoginSurfaceComponent,
  GeneratedApplicationAuthenticationSurface,
} from './authentication';
import type { StandardUserSurfaceContributions } from './standard-user-surfaces';

const CODE_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const CAPABILITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._*-]{0,254}$/;
const RESOURCE_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_ROUTES = 500;
const MAX_RESOURCES = 200;
const MAX_ACTIONS_PER_SLOT = 50;
const ADMIN_CONTRIBUTIONS_BRAND: unique symbol = Symbol(
  'openxiangda.admin-contributions',
);

export type AdminContributionAccess = Pick<
  AppFrontendRouteContract,
  'capability' | 'access'
>;

export interface ApplicationRoutePageProps {
  route: Readonly<AppFrontendRouteContract>;
}

export type ApplicationRoutePageComponent =
  ComponentType<ApplicationRoutePageProps>;

export interface AdminOperationPageProps extends ApplicationRoutePageProps {}

export type AdminOperationPageComponent = ComponentType<AdminOperationPageProps>;

interface AdminResourceActionContext {
  resource: string;
  refresh(): Promise<unknown>;
}

export interface AdminToolbarActionContext extends AdminResourceActionContext {
  selectedRecords: readonly Readonly<Record<string, unknown>>[];
}

export interface AdminRowActionContext<RecordValue = Record<string, unknown>>
  extends AdminResourceActionContext {
  record: Readonly<RecordValue>;
}

export interface AdminDetailActionContext<RecordValue = Record<string, unknown>>
  extends AdminRowActionContext<RecordValue> {}

interface AdminActionContribution<Context> extends AdminContributionAccess {
  code: string;
  label: string;
  order?: number;
  render(context: Context): ReactNode;
}

export type AdminToolbarActionContribution = AdminActionContribution<
  AdminToolbarActionContext
> & { /** Hide this action until at least one record is selected. */ requiresSelection?: boolean };
export type AdminRowActionContribution<RecordValue = Record<string, unknown>> =
  AdminActionContribution<AdminRowActionContext<RecordValue>>;
export type AdminDetailActionContribution<
  RecordValue = Record<string, unknown>,
> = AdminActionContribution<AdminDetailActionContext<RecordValue>>;

export interface AdminResourceContributions<
  RecordValue = Record<string, unknown>,
> {
  toolbar?: readonly AdminToolbarActionContribution[];
  row?: readonly AdminRowActionContribution<RecordValue>[];
  detail?: readonly AdminDetailActionContribution<RecordValue>[];
}

export interface ApplicationRoutePageContribution {
  route: Readonly<AppFrontendRouteContract>;
  component: ApplicationRoutePageComponent;
}

export interface AdminOperationPageContribution
  extends ApplicationRoutePageContribution {
  component: AdminOperationPageComponent;
}

export interface OpenXiangdaApplicationContributions {
  readonly [ADMIN_CONTRIBUTIONS_BRAND]: true;
  routes: readonly ApplicationRoutePageContribution[];
  resources: Readonly<Record<string, Readonly<AdminResourceContributions>>>;
  authentication: readonly ApplicationAuthenticationSurfaceContribution[];
  standardUserSurfaces?: Readonly<StandardUserSurfaceContributions>;
}

export interface OpenXiangdaAdminContributions
  extends OpenXiangdaApplicationContributions {
  routes: readonly AdminOperationPageContribution[];
}

type RouteContracts = Readonly<
  Record<string, Readonly<AppFrontendRouteContract>>
>;
type PagesFor<Routes extends RouteContracts> = {
  readonly [Key in keyof Routes]: ApplicationRoutePageComponent;
};

type AuthenticationSurfaceContracts = Readonly<
  Record<string, Readonly<GeneratedApplicationAuthenticationSurface>>
>;
type AuthenticationPagesFor<Surfaces extends AuthenticationSurfaceContracts> = {
  readonly [Key in keyof Surfaces]: ApplicationLoginSurfaceComponent;
};

export interface ApplicationContributionContracts<
  Routes extends RouteContracts,
  Surfaces extends AuthenticationSurfaceContracts,
> {
  routes: Routes;
  authenticationSurfaces: Surfaces;
}

export interface DefineAdminContributionsInput<Routes extends RouteContracts> {
  pages: PagesFor<Routes>;
  resources?: Readonly<Record<string, AdminResourceContributions>>;
}

export interface DefineApplicationContributionsInput<
  Routes extends RouteContracts,
> extends DefineAdminContributionsInput<Routes> {
  standardUserSurfaces?: StandardUserSurfaceContributions;
}

export interface DefineAuthenticatedApplicationContributionsInput<
  Routes extends RouteContracts,
  Surfaces extends AuthenticationSurfaceContracts,
> extends DefineApplicationContributionsInput<Routes> {
  authentication: AuthenticationPagesFor<Surfaces>;
}

function invalid(reason: string): never {
  throw new Error(`OPENXIANGDA_ADMIN_CONTRIBUTIONS_INVALID:${reason}`);
}

function normalizeStandardUserSurfaces(
  value: StandardUserSurfaceContributions | undefined,
): Readonly<StandardUserSurfaceContributions> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('standard-user-surfaces:invalid');
  }
  const expectedGroups = ['applicationTodoCenter', 'frame'];
  if (
    Object.keys(value).sort().join('\u0000') !== expectedGroups.join('\u0000')
  ) {
    invalid('standard-user-surfaces:groups');
  }
  const normalizePair = <Props,>(
    name: string,
    pair: {
      desktop: ComponentType<Props>;
      mobile: ComponentType<Props>;
    },
  ) => {
    if (
      !pair ||
      typeof pair !== 'object' ||
      Array.isArray(pair) ||
      Object.keys(pair).sort().join('\u0000') !== 'desktop\u0000mobile' ||
      typeof pair.desktop !== 'function' ||
      typeof pair.mobile !== 'function'
    ) {
      invalid(`standard-user-surfaces:${name}:pair`);
    }
    return Object.freeze({
      desktop: pair.desktop,
      mobile: pair.mobile,
    });
  };
  return Object.freeze({
    frame: normalizePair('frame', value.frame),
    applicationTodoCenter: normalizePair(
      'application-todo-center',
      value.applicationTodoCenter,
    ),
  });
}

function validateAccess(
  value: AdminContributionAccess,
  target: string,
): void {
  if (
    value.capability !== undefined &&
    !CAPABILITY_PATTERN.test(value.capability)
  )
    invalid(`${target}:access-invalid`);
  if (value.capability && value.access) invalid(`${target}:access-conflict`);
  const expressions = [value.access?.allOf, value.access?.anyOf].filter(
    (item): item is readonly string[] => item !== undefined,
  );
  if (value.access && expressions.length === 0)
    invalid(`${target}:access-invalid`);
  for (const expression of expressions) {
    if (expression.length === 0 || new Set(expression).size !== expression.length)
      invalid(`${target}:access-invalid`);
    if (expression.some((capability) => !CAPABILITY_PATTERN.test(capability)))
      invalid(`${target}:access-invalid`);
  }
}

function validateActions(
  resource: string,
  slot: 'toolbar' | 'row' | 'detail',
  actions: readonly AdminActionContribution<unknown>[] | undefined,
): void {
  if (!actions) return;
  if (actions.length > MAX_ACTIONS_PER_SLOT)
    invalid(`${resource}:${slot}:too-many-actions`);
  const codes = new Set<string>();
  for (const action of actions) {
    if (!CODE_PATTERN.test(action.code) || codes.has(action.code))
      invalid(`${resource}:${slot}:action-code`);
    if (!action.label.trim() || typeof action.render !== 'function')
      invalid(`${resource}:${slot}:${action.code}:action-invalid`);
    if (
      action.order !== undefined &&
      (!Number.isSafeInteger(action.order) || Math.abs(action.order) > 10_000)
    )
      invalid(`${resource}:${slot}:${action.code}:order-invalid`);
    validateAccess(action, `${resource}:${slot}:${action.code}`);
    codes.add(action.code);
  }
}

function orderedActions<Context>(
  actions: readonly AdminActionContribution<Context>[] | undefined,
) {
  return Object.freeze(
    [...(actions || [])].sort(
      (left, right) =>
        (left.order ?? 0) - (right.order ?? 0) ||
        left.code.localeCompare(right.code),
    ).map((action) =>
      Object.freeze({
        ...action,
        ...(action.access
          ? {
              access: Object.freeze({
                ...(action.access.allOf
                  ? { allOf: Object.freeze([...action.access.allOf]) }
                  : {}),
                ...(action.access.anyOf
                  ? { anyOf: Object.freeze([...action.access.anyOf]) }
                  : {}),
              }),
            }
          : {}),
      }),
    ),
  );
}

/**
 * Binds every compiler-generated route contract to exactly one local React
 * component and declares bounded extension slots for generated resource pages.
 */
function defineContributions<const Routes extends RouteContracts>(
  routeContracts: Routes,
  input: DefineApplicationContributionsInput<Routes>,
  allowedSurfaces: ReadonlySet<AppFrontendRouteContract['surface']>,
  adminPathMode: 'application' | 'operation',
  authenticationSurfaceContracts: AuthenticationSurfaceContracts = {},
  authenticationPages: Readonly<
    Record<string, ApplicationLoginSurfaceComponent>
  > = {},
): OpenXiangdaApplicationContributions {
  const routeEntries = Object.entries(routeContracts);
  const pageEntries = Object.entries(input.pages);
  if (routeEntries.length > MAX_ROUTES) invalid('too-many-routes');
  const routeKeys = new Set(routeEntries.map(([key]) => key));
  if (
    pageEntries.length !== routeEntries.length ||
    pageEntries.some(([key]) => !routeKeys.has(key))
  )
    invalid('pages-must-match-generated-routes');

  const codes = new Set<string>();
  const paths = new Set<string>();
  const routes = routeEntries.map(([key, route]) => {
    const component = input.pages[key as keyof Routes];
    if (
      !CODE_PATTERN.test(route.code) ||
      codes.has(route.code) ||
      (route.surface === 'admin' &&
        !(adminPathMode === 'application'
          ? route.path.startsWith('/admin/')
          : route.path === '/admin/operations' ||
            route.path.startsWith('/admin/operations/'))) ||
      (route.surface === 'user' && route.path.startsWith('/admin')) ||
      paths.has(route.path) ||
      !allowedSurfaces.has(route.surface) ||
      !route.label.trim() ||
      !component
    )
      invalid(`route:${key}`);
    validateAccess(route, `route:${route.code}`);
    codes.add(route.code);
    paths.add(route.path);
    const normalizedRoute = Object.freeze({
      ...route,
      ...(route.access
        ? {
            access: Object.freeze({
              ...(route.access.allOf
                ? { allOf: Object.freeze([...route.access.allOf]) }
                : {}),
              ...(route.access.anyOf
                ? { anyOf: Object.freeze([...route.access.anyOf]) }
                : {}),
            }),
          }
        : {}),
    });
    return Object.freeze({ route: normalizedRoute, component });
  });

  const parentByCode = new Map(
    routes
      .filter(({ route }) => route.parentCode)
      .map(({ route }) => [route.code, route.parentCode!] as const),
  );
  for (const [code, parentCode] of parentByCode) {
    if (!codes.has(parentCode) || code === parentCode)
      invalid(`route:${code}:parent`);
    const route = routes.find(item => item.route.code === code)!;
    const parent = routes.find(item => item.route.code === parentCode)!;
    if (route.route.surface !== parent.route.surface)
      invalid(`route:${code}:parent-surface`);
    const visited = new Set<string>();
    let current: string | undefined = code;
    while (current && parentByCode.has(current)) {
      if (visited.has(current)) invalid(`route:${code}:parent-cycle`);
      visited.add(current);
      current = parentByCode.get(current);
    }
  }

  const resourceEntries = Object.entries(input.resources || {});
  if (resourceEntries.length > MAX_RESOURCES) invalid('too-many-resources');
  const resources = Object.fromEntries(
    resourceEntries.map(([resource, slots]) => {
      if (!RESOURCE_CODE_PATTERN.test(resource)) invalid(`resource:${resource}`);
      validateActions(resource, 'toolbar', slots.toolbar);
      validateActions(resource, 'row', slots.row);
      validateActions(resource, 'detail', slots.detail);
      return [
        resource,
        Object.freeze({
          toolbar: orderedActions(slots.toolbar),
          row: orderedActions(slots.row),
          detail: orderedActions(slots.detail),
        }),
      ];
    }),
  );

  const authenticationEntries = Object.entries(authenticationSurfaceContracts);
  const authenticationPageEntries = Object.entries(authenticationPages);
  const authenticationKeys = new Set(authenticationEntries.map(([key]) => key));
  if (
    authenticationEntries.length > 2 ||
    authenticationPageEntries.length !== authenticationEntries.length ||
    authenticationPageEntries.some(([key]) => !authenticationKeys.has(key))
  ) {
    invalid('authentication-must-match-generated-surfaces');
  }
  const authenticationPaths = new Set<string>();
  const authentication = authenticationEntries.map(([key, surface]) => {
    const component = authenticationPages[key];
    if (
      !component ||
      !CODE_PATTERN.test(surface.routeCode) ||
      (surface.device !== 'desktop' && surface.device !== 'mobile') ||
      (surface.device === 'desktop'
        ? surface.path !== '/login'
        : surface.path !== '/m/login') ||
      authenticationPaths.has(surface.path)
    ) {
      invalid(`authentication:${key}`);
    }
    authenticationPaths.add(surface.path);
    return Object.freeze({ surface: Object.freeze({ ...surface }), component });
  });
  const standardUserSurfaces = normalizeStandardUserSurfaces(
    input.standardUserSurfaces,
  );

  return Object.freeze({
    [ADMIN_CONTRIBUTIONS_BRAND]: true,
    routes: Object.freeze(routes),
    resources: Object.freeze(resources),
    authentication: Object.freeze(authentication),
    ...(standardUserSurfaces ? { standardUserSurfaces } : {}),
  }) as OpenXiangdaApplicationContributions;
}

export function defineApplicationContributions<
  const Routes extends RouteContracts,
  const Surfaces extends AuthenticationSurfaceContracts,
>(
  contracts: ApplicationContributionContracts<Routes, Surfaces>,
  input: DefineAuthenticatedApplicationContributionsInput<Routes, Surfaces>,
): OpenXiangdaApplicationContributions;
export function defineApplicationContributions<
  const Routes extends RouteContracts,
>(
  routeContracts: Routes,
  input: DefineApplicationContributionsInput<Routes>,
): OpenXiangdaApplicationContributions;
export function defineApplicationContributions(
  contractsOrRoutes:
    | RouteContracts
    | ApplicationContributionContracts<
        RouteContracts,
        AuthenticationSurfaceContracts
      >,
  input:
    | DefineApplicationContributionsInput<RouteContracts>
    | DefineAuthenticatedApplicationContributionsInput<
        RouteContracts,
        AuthenticationSurfaceContracts
      >,
): OpenXiangdaApplicationContributions {
  const bundled =
    'routes' in contractsOrRoutes &&
    'authenticationSurfaces' in contractsOrRoutes;
  const routeContracts = (bundled
    ? contractsOrRoutes.routes
    : contractsOrRoutes) as RouteContracts;
  const authenticationSurfaces = (bundled
    ? contractsOrRoutes.authenticationSurfaces
    : {}) as AuthenticationSurfaceContracts;
  const authentication =
    bundled && 'authentication' in input ? input.authentication : {};
  return defineContributions(
    routeContracts,
    input,
    new Set<AppFrontendRouteContract['surface']>(['admin', 'user']),
    'application',
    authenticationSurfaces,
    authentication,
  );
}

export function defineAdminContributions<const Routes extends RouteContracts>(
  routeContracts: Routes,
  input: DefineAdminContributionsInput<Routes>,
): OpenXiangdaAdminContributions {
  return defineContributions(
    routeContracts,
    input,
    new Set<AppFrontendRouteContract['surface']>(['admin']),
    'operation',
  ) as OpenXiangdaAdminContributions;
}

export function isAdminContributionAllowed(
  contribution: AdminContributionAccess,
  hasCapability: (capability: string) => boolean,
): boolean {
  if (contribution.capability)
    return hasCapability(contribution.capability);
  const allOf = contribution.access?.allOf || [];
  const anyOf = contribution.access?.anyOf || [];
  return (
    allOf.every(hasCapability) &&
    (anyOf.length === 0 || anyOf.some(hasCapability))
  );
}

export function isAdminRouteAllowed(
  contribution: AdminOperationPageContribution,
  allRoutes: readonly AdminOperationPageContribution[],
  hasCapability: (capability: string) => boolean,
): boolean {
  return isApplicationRouteAllowed(contribution, allRoutes, hasCapability);
}

export function isApplicationRouteAllowed(
  contribution: ApplicationRoutePageContribution,
  allRoutes: readonly ApplicationRoutePageContribution[],
  hasCapability: (capability: string) => boolean,
): boolean {
  const byCode = new Map(allRoutes.map((item) => [item.route.code, item]));
  let current: ApplicationRoutePageContribution | undefined = contribution;
  const visited = new Set<string>();
  while (current) {
    if (
      visited.has(current.route.code) ||
      !isAdminContributionAllowed(current.route, hasCapability)
    )
      return false;
    visited.add(current.route.code);
    const parentCode = current.route.parentCode;
    if (!parentCode) {
      current = undefined;
    } else {
      const parent = byCode.get(parentCode);
      if (!parent) return false;
      current = parent;
    }
  }
  return true;
}

const EMPTY_CONTRIBUTIONS: OpenXiangdaApplicationContributions = Object.freeze({
  [ADMIN_CONTRIBUTIONS_BRAND]: true as const,
  routes: Object.freeze([]),
  resources: Object.freeze({}),
  authentication: Object.freeze([]),
});

const AdminContributionsContext = createContext(EMPTY_CONTRIBUTIONS);

export function AdminContributionsProvider({
  children,
  contributions = EMPTY_CONTRIBUTIONS,
}: {
  children: ReactNode;
  contributions?: OpenXiangdaApplicationContributions;
}) {
  return (
    <AdminContributionsContext.Provider value={contributions}>
      {children}
    </AdminContributionsContext.Provider>
  );
}

export function useAdminContributions() {
  return useContext(AdminContributionsContext);
}

export function useAdminResourceContributions(resource: string) {
  return useAdminContributions().resources[resource] as
    | Readonly<AdminResourceContributions>
    | undefined;
}
