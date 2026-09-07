import type {
  AppRouteManifestEntryV3,
  AppRouteManifestRouteV3,
  AppRouteManifestV3,
  AppRouteManifestDevicePolicyV3,
} from 'openxiangda-contracts/browser';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts/browser';

export type StandardRouteManifestDevice = 'desktop' | 'mobile';

export interface StandardRouteManifestLocation {
  pathname: string;
  search?: string;
  hash?: string;
}

export interface StandardRouteManifestNegotiation {
  entryCode: string;
  from: StandardRouteManifestDevice;
  to: StandardRouteManifestDevice;
  pathname: string;
  search: string;
  hash: string;
}

export interface StandardRouteManifestIndex {
  manifest: Readonly<AppRouteManifestV3>;
  entries: ReadonlyMap<string, Readonly<AppRouteManifestEntryV3>>;
  routes: readonly Readonly<AppRouteManifestRouteV3>[];
}

interface StandardRoutePathMatch {
  params: Readonly<Record<string, string>>;
}

function pathParams(path: string) {
  return [...path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)]
    .map(match => match[1]!)
    .sort((left, right) => (left === right ? 0 : left < right ? -1 : 1));
}

function expectedRouteCode(
  kind: AppRouteManifestEntryV3['kind'],
  device: StandardRouteManifestDevice,
  workflowCode?: string,
) {
  if (kind === 'workflow-launch') {
    return `workflow.${workflowCode}.launch.${device}`;
  }
  if (kind === 'application-todo-center') {
    return `application.todo-center.${device}`;
  }
  return `${kind.replaceAll('-', '.')}.${device}`;
}

function validDevicePolicy(
  policy: unknown,
): policy is AppRouteManifestDevicePolicyV3 {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return false;
  }
  const value = policy as Record<string, unknown>;
  return (
    value.kind === 'viewport-family' &&
    Number.isInteger(value.mobileMaxWidthPx) &&
    Number.isInteger(value.desktopMinWidthPx) &&
    Number(value.mobileMaxWidthPx) >= 320 &&
    Number(value.mobileMaxWidthPx) <= 1600 &&
    Number(value.desktopMinWidthPx) >= 320 &&
    Number(value.desktopMinWidthPx) <= 1600 &&
    Number(value.desktopMinWidthPx) === Number(value.mobileMaxWidthPx) + 1
  );
}

function validStaticPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 2048 &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('..') &&
    !/[:*?#\\\s]/.test(value)
  );
}

function validManifestRoutePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 2048 &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('..') &&
    !/[?#\\\s]/.test(value)
  );
}

function validAuthenticationPair(value: unknown): value is {
  routeCode: string;
  path: string;
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { routeCode?: unknown }).routeCode === 'string' &&
    /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(
      (value as { routeCode: string }).routeCode,
    ) &&
    validStaticPath((value as { path?: unknown }).path)
  );
}

function sameStaticPath(left: string, right: string) {
  const normalize = (value: string) =>
    value.length > 1 ? value.replace(/\/$/, '') : value;
  return normalize(left) === normalize(right);
}

/**
 * Validate and index the compiler-owned standard route manifest once at the
 * application boundary. No component or router is allowed to provide a
 * second standard-route catalog.
 */
export function createStandardRouteManifestIndex(
  manifest: AppRouteManifestV3,
  appCode: string,
): StandardRouteManifestIndex {
  if (
    manifest.schemaVersion !== SCHEMA_VERSIONS.applicationRouteManifest ||
    manifest.appCode !== appCode ||
    !Array.isArray(manifest.routes) ||
    typeof manifest.digest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(manifest.digest)
  ) {
    throw new Error('OPENXIANGDA_ROUTE_MANIFEST_INVALID');
  }

  if (!validDevicePolicy(manifest.devicePolicy)) {
    throw new Error('OPENXIANGDA_ROUTE_MANIFEST_INVALID');
  }
  if (
    !validStaticPath(manifest.rootEntry?.desktop) ||
    !validStaticPath(manifest.rootEntry?.mobile) ||
    typeof manifest.rootEntry?.code !== 'string' ||
    !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(manifest.rootEntry.code) ||
    !validAuthenticationPair(manifest.authentication?.desktop) ||
    !validAuthenticationPair(manifest.authentication?.mobile) ||
    manifest.routes.length > 512
  ) {
    throw new Error('OPENXIANGDA_ROUTE_MANIFEST_INVALID');
  }

  const entries = new Map<string, Readonly<AppRouteManifestEntryV3>>();
  const routeCodes = new Set<string>();
  const routes: AppRouteManifestRouteV3[] = [];
  const validKinds = new Set([
    'application-todo-center',
    'workflow-work-center',
    'workflow-launch',
    'workflow-task',
    'workflow-instance',
  ]);
  for (const entry of manifest.routes) {
    if (
      !entry ||
      typeof entry.code !== 'string' ||
      !validKinds.has(entry.kind) ||
      (entry.kind === 'workflow-launch') !==
        (typeof entry.workflowCode === 'string' && entry.workflowCode.length > 0) ||
      (entry.kind !== 'workflow-launch' && entry.workflowCode !== undefined) ||
      entries.has(entry.code) ||
      !entry.desktop ||
      !entry.mobile ||
      JSON.stringify(entry.desktop.capability) !==
        JSON.stringify(entry.mobile.capability) ||
      JSON.stringify(entry.desktop.access) !== JSON.stringify(entry.mobile.access)
    ) {
      throw new Error('OPENXIANGDA_ROUTE_MANIFEST_INVALID');
    }
    for (const [device, route] of [
      ['desktop', entry.desktop],
      ['mobile', entry.mobile],
    ] as const) {
      if (
        !route ||
        typeof route.routeCode !== 'string' ||
        route.routeCode !== expectedRouteCode(entry.kind, device, entry.workflowCode) ||
        routeCodes.has(route.routeCode) ||
        !validManifestRoutePath(route.path) ||
        route.surface !== 'user' ||
        route.requiresAuthentication !== true ||
        !Array.isArray(route.pathParams) ||
        route.pathParams.length > 32 ||
        route.pathParams.join('\u0000') !== pathParams(route.path).join('\u0000')
      ) {
        throw new Error('OPENXIANGDA_ROUTE_MANIFEST_INVALID');
      }
      routeCodes.add(route.routeCode);
      routes.push(route);
    }
    entries.set(entry.code, entry);
  }
  const reservedStaticPaths = [
    manifest.rootEntry.desktop,
    manifest.rootEntry.mobile,
    manifest.authentication.desktop.path,
    manifest.authentication.mobile.path,
  ];
  if (
    new Set(reservedStaticPaths).size !== reservedStaticPaths.length ||
    manifest.authentication.desktop.routeCode ===
      manifest.authentication.mobile.routeCode ||
    routes.some(route => validStaticPath(route.path) && reservedStaticPaths.includes(route.path))
  ) {
    throw new Error('OPENXIANGDA_ROUTE_MANIFEST_INVALID');
  }
  return Object.freeze({
    manifest,
    entries,
    routes: Object.freeze(routes),
  });
}

export function standardRouteManifestPath(
  index: StandardRouteManifestIndex,
  entryCode: string,
  device: StandardRouteManifestDevice,
) {
  return index.entries.get(entryCode)?.[device].path;
}

/**
 * Resolve the browser device family used by standard paired surfaces.
 * Unknown or non-finite widths conservatively use the desktop family; a
 * browser can still negotiate again once it reports a real viewport width.
 */
export function standardRouteManifestDeviceForViewport(
  policy: AppRouteManifestDevicePolicyV3,
  width: number,
): StandardRouteManifestDevice {
  return Number.isFinite(width) && width <= policy.mobileMaxWidthPx
    ? 'mobile'
    : 'desktop';
}

function routeSegments(path: string) {
  return path.split('/').filter(Boolean);
}

function routePathParamNames(path: string) {
  return [...path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map(
    match => match[1]!,
  );
}

function matchStandardRoutePath(
  pattern: string,
  pathname: string,
): StandardRoutePathMatch | undefined {
  const patternSegments = routeSegments(pattern);
  const pathnameSegments = routeSegments(pathname);
  if (patternSegments.length !== pathnameSegments.length) return undefined;

  const names = routePathParamNames(pattern);
  const params: Record<string, string> = {};
  let paramIndex = 0;
  for (const [index, segment] of patternSegments.entries()) {
    const actual = pathnameSegments[index];
    if (!actual) return undefined;
    if (segment.startsWith(':')) {
      const name = names[paramIndex++];
      if (!name) return undefined;
      params[name] = actual;
    } else if (segment !== actual) {
      return undefined;
    }
  }
  return { params };
}

function routeSpecificity(path: string) {
  const segments = routeSegments(path);
  return {
    staticSegments: segments.filter(segment => !segment.startsWith(':')).length,
    segmentCount: segments.length,
    pathLength: path.length,
  };
}

function compareRouteSpecificity(left: string, right: string) {
  const a = routeSpecificity(left);
  const b = routeSpecificity(right);
  return (
    b.staticSegments - a.staticSegments ||
    b.segmentCount - a.segmentCount ||
    b.pathLength - a.pathLength
  );
}

function encodePathParam(value: string) {
  // Captures are kept in their URL-encoded form so a deep link such as
  // `%2F` is not accidentally decoded into another path segment.  Values
  // supplied by the manifest (for example a workflow code) are encoded once.
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return value;
  }
}

function samePathParamValue(left: string, right: string) {
  return encodePathParam(left) === encodePathParam(right);
}

function entrySemanticCaptureMatches(
  entry: Readonly<AppRouteManifestEntryV3>,
  sourceRoute: Readonly<AppRouteManifestRouteV3>,
  match: StandardRoutePathMatch,
) {
  if (entry.kind !== 'workflow-launch' || !entry.workflowCode) return true;

  const sourceNames = routePathParamNames(sourceRoute.path);
  const capturedWorkflowCode = match.params.workflowCode;
  if (capturedWorkflowCode !== undefined) {
    return samePathParamValue(capturedWorkflowCode, entry.workflowCode);
  }

  // A launch route with another dynamic parameter has no safe way to prove
  // that it belongs to this workflow.  A static desktop route is safe because
  // the entry metadata is the semantic identity used to fill the paired
  // mobile capture.
  return sourceNames.length === 0;
}

function projectPairedPath(
  entry: Readonly<AppRouteManifestEntryV3>,
  sourceRoute: Readonly<AppRouteManifestRouteV3>,
  targetRoute: Readonly<AppRouteManifestRouteV3>,
  match: StandardRoutePathMatch,
) {
  const sourceNames = routePathParamNames(sourceRoute.path);
  const targetNames = routePathParamNames(targetRoute.path);
  if (!entrySemanticCaptureMatches(entry, sourceRoute, match)) return undefined;

  const sourceValues = new Map<string, string>(Object.entries(match.params));
  const targetValues = new Map<string, string>();

  // Dynamic route parameters are semantic, not positional.  A capture can be
  // carried to the pair only when both routes name that parameter identically,
  // or when workflowCode is supplied by the compiler-owned entry metadata.
  for (const name of sourceNames) {
    if (targetNames.includes(name)) continue;
    if (
      name === 'workflowCode' &&
      entry.kind === 'workflow-launch' &&
      entry.workflowCode
    ) {
      continue;
    }
    return undefined;
  }

  for (const name of targetNames) {
    const value =
      sourceValues.get(name) ||
      (name === 'workflowCode' &&
      entry.kind === 'workflow-launch' &&
      entry.workflowCode
        ? entry.workflowCode
        : undefined);
    if (!value) return undefined;
    targetValues.set(name, value);
  }

  return targetRoute.path.replace(
    /:([A-Za-z][A-Za-z0-9_]*)/g,
    (_token, name: string) => encodePathParam(targetValues.get(name)!),
  );
}

/**
 * Find a standard route pair by pathname and project it to the requested
 * device.  The manifest is the only route catalog used here: the helper does
 * not know any Todo, Workflow, or application-specific path.  `undefined`
 * means that the location is not a standard pair, already targets the
 * requested device, or cannot safely carry the target route's parameters.
 */
export function negotiateStandardRoute(
  index: StandardRouteManifestIndex,
  location: StandardRouteManifestLocation,
  targetDevice: StandardRouteManifestDevice,
): StandardRouteManifestNegotiation | undefined {
  const candidates = index.manifest.routes
    .flatMap(entry =>
      (['desktop', 'mobile'] as const).map(device => ({
        device,
        entry,
        route: entry[device],
      })),
    )
    .sort((left, right) =>
      compareRouteSpecificity(left.route.path, right.route.path),
    );
  const routeMatches = candidates
    .map(candidate => {
      const match = matchStandardRoutePath(candidate.route.path, location.pathname);
      if (!match || candidate.device === targetDevice) return undefined;
      const targetRoute = candidate.entry[targetDevice];
      const pathname = projectPairedPath(
        candidate.entry,
        candidate.route,
        targetRoute,
        match,
      );
      if (!pathname || pathname === location.pathname) return undefined;
      return { ...candidate, match, pathname };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        device: StandardRouteManifestDevice;
        entry: Readonly<AppRouteManifestEntryV3>;
        route: Readonly<AppRouteManifestRouteV3>;
        match: StandardRoutePathMatch;
        pathname: string;
      } => Boolean(candidate),
    );
  const staticPairs = [
    {
      entryCode: index.manifest.rootEntry.code,
      desktop: index.manifest.rootEntry.desktop,
      mobile: index.manifest.rootEntry.mobile,
    },
    {
      entryCode: index.manifest.authentication.desktop.routeCode,
      desktop: index.manifest.authentication.desktop.path,
      mobile: index.manifest.authentication.mobile.path,
    },
  ];
  const staticMatches = staticPairs.flatMap(pair => {
    const from: StandardRouteManifestDevice | undefined =
      sameStaticPath(location.pathname, pair.desktop)
        ? 'desktop'
        : sameStaticPath(location.pathname, pair.mobile)
          ? 'mobile'
          : undefined;
    if (!from || from === targetDevice) return [];
    const pathname = targetDevice === 'desktop' ? pair.desktop : pair.mobile;
    if (sameStaticPath(pathname, location.pathname)) return [];
    return [
      {
        entryCode: pair.entryCode,
        from,
        pathname,
        sourcePath: location.pathname,
      },
    ];
  });
  const matches = [
    ...routeMatches.map(candidate => ({
      entryCode: candidate.entry.code,
      from: candidate.device,
      pathname: candidate.pathname,
      sourcePath: candidate.route.path,
    })),
    ...staticMatches,
  ].sort((left, right) =>
    compareRouteSpecificity(left.sourcePath, right.sourcePath),
  );
  const current = matches[0];
  if (!current) return undefined;

  // Shared mobile launch patterns are expected.  Once semantic constraints
  // are applied there must still be exactly one most-specific entry; otherwise
  // guessing would send a user to another workflow.
  const equallySpecific = matches.filter(
    candidate =>
      compareRouteSpecificity(candidate.sourcePath, current.sourcePath) === 0,
  );
  if (equallySpecific.length !== 1) return undefined;

  return Object.freeze({
    entryCode: current.entryCode,
    from: current.from,
    to: targetDevice,
    pathname: current.pathname,
    search: location.search || '',
    hash: location.hash || '',
  });
}
