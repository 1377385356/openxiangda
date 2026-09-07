import type {
  AppAdminNavigationGroupContract,
  AppAdminPageContract,
  AppRouteManifestEntryV3,
} from 'openxiangda-contracts/browser';
import { createContext, useContext, type ReactNode } from 'react';
import type { DeepReadonly } from './components/resource/generated-resource-definition';

export type AdminPagesInput = DeepReadonly<readonly AppAdminPageContract[]>;
export type AdminNavigationInput = DeepReadonly<
  readonly AppAdminNavigationGroupContract[]
>;

export interface AdminInformationArchitecture {
  pages: readonly Readonly<AppAdminPageContract>[];
  pagesByCode: ReadonlyMap<string, Readonly<AppAdminPageContract>>;
  navigation: readonly Readonly<AppAdminNavigationGroupContract>[];
  centers?: readonly Readonly<AppRouteManifestEntryV3>[];
}

export function createAdminInformationArchitecture(
  pagesInput: AdminPagesInput,
  navigationInput: AdminNavigationInput,
): AdminInformationArchitecture {
  const pages = Object.freeze(
    pagesInput.map(page => Object.freeze({ ...page })),
  ) as readonly Readonly<AppAdminPageContract>[];
  const navigation = Object.freeze(
    navigationInput.map(group =>
      Object.freeze({
        ...group,
        items: Object.freeze(group.items.map(item => Object.freeze({ ...item }))),
      }),
    ),
  ) as readonly Readonly<AppAdminNavigationGroupContract>[];
  const pagesByCode = new Map(pages.map(page => [page.code, page]));
  if (pagesByCode.size !== pages.length)
    throw new Error('OPENXIANGDA_ADMIN_PAGE_REGISTRY_DUPLICATE');
  const referenced = new Set<string>();
  for (const group of navigation) {
    if (!group.items.length)
      throw new Error(`OPENXIANGDA_ADMIN_NAVIGATION_ORPHANED:${group.code}`);
    for (const item of group.items) {
      const page = pagesByCode.get(item.pageCode);
      if (!page || !page.navigationEligible)
        throw new Error(
          `OPENXIANGDA_ADMIN_NAVIGATION_PAGE_INVALID:${item.pageCode}`,
        );
      if (referenced.has(item.pageCode))
        throw new Error(
          `OPENXIANGDA_ADMIN_NAVIGATION_PAGE_DUPLICATE:${item.pageCode}`,
        );
      referenced.add(item.pageCode);
    }
  }
  return Object.freeze({ pages, pagesByCode, navigation });
}

const EMPTY: AdminInformationArchitecture = Object.freeze({
  pages: Object.freeze([]),
  pagesByCode: new Map(),
  navigation: Object.freeze([]),
});

const AdminInformationArchitectureContext = createContext(EMPTY);

export function AdminInformationArchitectureProvider({
  children,
  pages,
  navigation,
  standardRoutes = [],
}: {
  standardRoutes?: readonly Readonly<AppRouteManifestEntryV3>[];
  children: ReactNode;
  pages: AdminPagesInput;
  navigation: AdminNavigationInput;
}) {
  return (
    <AdminInformationArchitectureContext.Provider
      value={{ ...createAdminInformationArchitecture(pages, navigation), centers: standardRoutes.filter(route => route.kind === 'workflow-work-center' || route.kind === 'application-todo-center') }}
    >
      {children}
    </AdminInformationArchitectureContext.Provider>
  );
}

export function useAdminInformationArchitecture() {
  return useContext(AdminInformationArchitectureContext);
}

export function isAdminPageAllowed(
  page: Readonly<AppAdminPageContract>,
  hasCapability: (capability: string) => boolean,
  hasReadCapability: (capability: string) => boolean,
  isOperationAllowed?: (routeCode: string) => boolean,
) {
  if (page.kind === 'operation')
    return Boolean(page.routeCode && isOperationAllowed?.(page.routeCode));
  if (page.capability) {
    return page.kind === 'resource-list' || page.kind === 'resource-detail'
      ? hasReadCapability(page.capability)
      : hasCapability(page.capability);
  }
  const allOf = page.access?.allOf || [];
  const anyOf = page.access?.anyOf || [];
  return (
    allOf.every(hasCapability) &&
    (anyOf.length === 0 || anyOf.some(hasCapability))
  );
}

export function firstAllowedAdminPath(
  architecture: AdminInformationArchitecture,
  hasCapability: (capability: string) => boolean,
  hasReadCapability: (capability: string) => boolean,
  isOperationAllowed?: (routeCode: string) => boolean,
) {
  for (const group of architecture.navigation) {
    for (const item of group.items) {
      const page = architecture.pagesByCode.get(item.pageCode);
      if (
        page &&
        isAdminPageAllowed(
          page,
          hasCapability,
          hasReadCapability,
          isOperationAllowed,
        )
      )
        return page.path;
    }
  }
  return undefined;
}
