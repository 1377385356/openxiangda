# Generated admin resource route namespace v2

Status: accepted for implementation on 2026-08-28.

## Problem evidence

The pre-release application compiler emits generated resource pages at root
paths such as `/activities`, while `OpenXiangdaApplication` registers those
pages before application-contributed user routes. A user portal can therefore
declare the same path and be shadowed by the generated admin CRUD page. The
browser runtime also invents a separate `/m/<resourceCode>` route family and
generated resource components hard-code a third copy of their navigation
paths, so the compiler is not the effective route owner.

The desktop generated resource route currently renders
`GeneratedResourcePage` without the platform `Shell`. Following a declared
admin navigation item can consequently leave the standard admin information
architecture even though the application contract assigns ownership of the
router and Shell to the platform.

## Capability owner and public contract

- The OpenXiangda compiler owns generated desktop admin resource paths. List,
  detail, create and update pages use the stable route family
  `/admin/resources/<resourceCode>`,
  `/admin/resources/<resourceCode>/:id`,
  `/admin/resources/<resourceCode>/new` and
  `/admin/resources/<resourceCode>/:id/edit`.
- `OpenXiangdaApplication` projects the same compiled page catalog into the
  mobile admin resource family `/m/admin/resources/<resourceCode>...`. This
  keeps independent user pages such as `/activities` and `/m/activities`
  outside the generated admin namespace.
- Generated resource components receive their complete route catalog from the
  application composition owner. List, detail, create, edit, cancel, save and
  delete navigation never reconstruct a route from `resourceCode`.
- The platform remains the only owner of `BrowserRouter`, `RuntimeBoundary`,
  `Refine`, generated routes and the standard desktop `Shell`. Desktop
  generated resource routes render inside exactly one platform `Shell`;
  mobile generated resource routes retain the independent mobile presentation
  without a desktop Shell.
- There are no old-path aliases, redirects, application compatibility
  branches or route-order fallbacks. This replaces an incorrect pre-release
  2.0 contract.

## Stable invariants

1. An explicit frontend route and a platform-generated route cannot claim the
   same canonical path shape, even if dynamic parameter names differ.
2. Canonical shape comparison treats `/items/:id` and `/items/:recordId` as
   the same route and treats splats as the same unbounded shape. Surface or
   registration order cannot resolve an ownership conflict.
3. The generated desktop paths in `adminPages` are the paths consumed by
   Refine resources, Shell navigation and generated component navigation.
4. Generated mobile resource paths are reserved by the application runtime
   under `/m/admin/resources`; application user routes remain free to own
   ordinary `/...` and `/m/...` product paths.
5. Direct generated admin URLs and navigation entries use the same capability
   gates as before. UI route ownership does not replace Data API
   authorization.

## Failure, concurrency, security and bounds

- Configuration validation fails closed with a stable
  `APP_CONFIG_FRONTEND_ROUTE_PATH_CONFLICT` diagnostic at the explicit route
  path when it conflicts with an explicit or generated route shape. It names
  both owners so the application can select a non-reserved route.
- Generated route claims are deterministic, bounded by existing resource,
  workflow and frontend route limits, and computed without network or runtime
  discovery. Concurrent identity or permission refresh cannot change route
  ownership.
- Resource codes continue through existing schema validation; record ids are
  URL-encoded only when substituting a compiled `:id` parameter. Route values
  contain no credentials, remote module URLs or environment-specific state.
- Invalid or incomplete route catalogs fail before rendering instead of
  falling back to root resource paths.

## Affected contracts and blast radius

- compiler `adminPages` output and generated TypeScript contracts;
- platform Native preflight compiler route validation and independent contract
  projection;
- `OpenXiangdaApplication` route composition and generated resource page
  navigation;
- official application template, packaged Skill, frontend documentation and
  resource browser fixtures;
- deterministic compatibility corpus and package release versions.

No business API, database schema, platform authorization, stable OpenXiangda
1.x application or other tenant data changes. The platform server image must
move with this contract so preflight independently validates and projects the
same generated namespace. Applications compiled against the preceding 2.0
alpha must regenerate their contracts and rebuild with the new exact package
version.

## Rollback boundary

Before publication the change is reversible at the `tools/openxiangda-v2` and
platform-server commits. After publication an application rolls back by
redeploying the prior immutable package set and its matching generated
contracts together with the matching platform image. No data rollback or SQL
migration is required.

## Falsifiable verification

1. Compiler tests assert all four desktop generated resource paths use
   `/admin/resources/<resourceCode>...`.
2. Configuration tests reject exact and parameter-name-equivalent conflicts
   between explicit routes and generated desktop/mobile route claims.
3. Browser tests render a user portal at the former root resource path and the
   generated admin page at its namespaced path in the same application.
4. The generated desktop page has exactly one standard Shell; the user and
   mobile pages have no desktop Shell.
5. Create, detail, edit, save, cancel and delete navigation resolve through the
   supplied route catalog on desktop and mobile.
6. Template checks, public export tests, `pnpm verify:affected` and the full
   `pnpm verify:release` candidate gate pass from a clean authoritative commit.
