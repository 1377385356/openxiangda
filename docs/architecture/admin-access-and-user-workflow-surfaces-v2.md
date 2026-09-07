# OpenXiangda 2.0 Admin Access Boundary and User Workflow Surfaces

Status: accepted for implementation, 2026-09-02

## Problem evidence and outcome

The React runtime currently treats each generated resource, admin operation and
admin navigation item as an independently authorized page, but it has no
application-wide boundary for `/admin/**` or `/m/admin/**`. An application can
hide its management shortcut while a non-admin user still deep-links to a
generated resource or operation and reaches the admin Shell before the page
level decision. Standard Todo and Workflow routes are also split between user
and admin paths: Todo, work center and workflow launch still use
`/admin/**`, while task and instance detail already use user paths and retain
legacy admin redirects.

The outcome is one compiled `frontend.admin.access` contract consumed by the
configuration bundle, contract bundle, generated client and React runtime. The
runtime denies every admin root, generated resource and admin contribution
before rendering the Shell, using a stable 403 page with a return-to-portal
action. Standard Todo and Workflow pages use only authenticated user Surface
paths on desktop and mobile, with no admin aliases.

## Owners and stable invariants

- The application owns one optional `frontend.admin.access` declaration. It is
  an `AppFrontendRouteAccess` expression over application capabilities. Omission
  means the application has not declared an additional global admin boundary;
  page capabilities remain authoritative for that application.
- The compiler owns validation, deterministic normalization and the immutable
  `adminAccess` contract. It accepts only non-empty, duplicate-free `allOf`
  and/or `anyOf` arrays containing declared capability codes.
- `openxiangda/react` owns the browser boundary. The same predicate gates
  `/admin`, `/admin/**`, `/m/admin`, `/m/admin/**`, the first admin target and
  the admin Shell. It never derives authority from a menu, role display name or
  application-specific role session.
- Native Identity/AuthZ owns the capability decision. The boundary is an early
  browser denial and information-architecture filter; Data API, App API and
  Workflow authorization remain mandatory for every request.
- Standard Todo and Workflow pages are authenticated user Surfaces. Their only
  desktop paths are `/todos`, `/work-center`, `/tasks/:taskId`,
  `/workflows/:instanceId` and `/workflows/:workflowCode/start`; mobile adds the
  `/m` prefix. No redirect or compatibility alias is emitted for an older
  `/admin/**` path.
- The route manifest remains the only owner of paired desktop/mobile standard
  routes and portal root targets. A 403 return action reads its same-device
  root target instead of hard-coding an application path.

## Public contract

```ts
frontend: {
  root: 'apps/web',
  admin: {
    access: {
      anyOf: [
        'app:example:admin:view',
        'app:example:system-admin:view',
      ],
    },
    navigation: defineAdminNavigation([/* declared admin pages */]),
  },
},
```

The compiler emits `frontend.admin.access` in `ConfigurationBundleV3` and
`adminAccess` in `ContractBundleV3` and generated `contracts.ts`. Generated
application bootstrap passes that value to `OpenXiangdaApplication`. Runtime
code and application-owned portal shortcuts may call the exported pure
`isAdminAccessAllowed` predicate; they do not copy the expression semantics.

The existing standard-page declarations remain compilation inputs during the
2.0 alpha, but their generated routes are user Surface routes. Standard pages
are not rendered inside the admin Shell. Applications should expose them from
their portal workbenches rather than relying on the admin information
architecture.

## Failure, concurrency, security and bounds

- Invalid access keys, empty expressions, duplicates, malformed capability
  codes or references to undeclared capabilities fail compilation with a stable
  `APP_CONFIG_ADMIN_ACCESS_INVALID` diagnostic at
  `frontend.admin.access`.
- Access normalization sorts and de-duplicates only after successful strict
  validation. The contract is bounded by the existing route-access limit of at
  most 50 entries per expression.
- Authorization refresh can only re-evaluate the immutable expression against
  the current capability set. A denied route never mounts the Shell or target
  page, so page effects and data requests cannot run before the denial.
- Direct URLs, root entry selection, menu rendering and portal shortcuts use
  the same expression semantics. Route and menu hiding are not substitutes for
  server-side resource policies or Named Action invariants.
- The 403 page reveals no missing capability names, role codes, resource data or
  workflow identifiers. Its only action navigates to the current device's
  compiled portal root.

## Replacement and rollback boundary

This directly replaces the incorrect pre-release 2.0 standard routes. No
redirects, compatibility aliases, app-specific special cases or second task
surface are retained. Existing applications regenerate against the released
contract and update links to the user paths.

The code change is reversible at the toolchain commit before publication. It
contains no database migration, package publication, deployment or production
data write. After publication, rollback means redeploying the prior immutable
toolchain/application artifacts together; mixing generated contracts and a
runtime from different alphas is unsupported.

## Falsifiable acceptance

1. Compiler tests accept a declared admin boundary, normalize it
   deterministically and reject every malformed or unknown-capability variant.
2. Public JSON Schema validates the configuration and contract bundle shapes,
   and generated `contracts.ts` exports `adminAccess`.
3. Runtime tests prove authorized users reach admin roots/resources/operations,
   denied users receive 403 before Shell/page mount, and the return action uses
   the route-manifest portal root on desktop and mobile.
4. Menu filtering and first-admin-page selection use the same global predicate;
   page-level capability checks still apply after the boundary passes.
5. Route-manifest tests prove all Todo/Workflow desktop and mobile routes have
   `surface: 'user'`, and the old `/admin/todos`, `/admin/work-center`,
   `/admin/tasks/**`, `/admin/workflows/**` paths are absent.
6. Package exports, docs, templates and representative generated applications
   consume the same contract without a RoleSession or application-owned auth
   store.
7. `pnpm verify:affected` passes under Node 24 with the required Changeset.
