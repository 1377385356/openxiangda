# Application route composition v2

Status: accepted for implementation on 2026-08-28.

## 2026-08-30 runtime amendment: standard route device negotiation

`OpenXiangdaApplication` now performs compiler-manifest-driven device
negotiation for standard Todo, Work Center, Task, Instance, and launch route
pairs. The manifest remains the only route-pair fact; the runtime does not
maintain a second path table or ask the server for a viewport decision.

The device family is `mobile` at viewport widths up to and including 768px,
and `desktop` at 769px and above. Negotiation runs in a passive effect after
the sole `BrowserRouter` has attached its history listener. When the viewport
family changes, either direction is allowed: a matching manifest pair is
visited with `replace`, preserving path parameters, query, hash, and router
state. An already matching or non-standard route is left untouched, so the
operation is bounded and cannot loop.

This amendment supersedes the earlier session-fixed wording in
`mobile-user-standard-pages-v2.md` that automatic detection happens only once
and that a resize must not switch experience, but only for standard manifest
route-pair navigation. It does not add a RoleSession, second identity, or
client-side authorization state. Application-contribution routes remain
explicit and are not inferred from a `/admin`/`/m` naming convention.

## Problem evidence

An OpenXiangda application can declare generated `admin` and `user` frontend
route contracts, but a runtime that accepts only generated resource, operation
and Workflow pages forces an application with independent PC/mobile user pages
to copy `BrowserRouter`, `RuntimeBoundary`, `Refine`, the admin `Shell` and all
generated routes. That creates two lifecycle and authorization owners and makes
standard admin composition impossible in the same React application.

## Capability owner and contract

- `OpenXiangdaApplication` remains the only owner of the application
  `BrowserRouter`, basename, `RuntimeBoundary`, `Refine`, resource routes,
  Workflow routes, global request state and admin `Shell`.
- The compiler-generated `appRoutes` record is the only route catalog. Each
  entry contains code, path, `admin | user` surface, optional parent,
  capability/access expression and lifecycle hints.
- `defineApplicationContributions(appRoutes, { pages, resources })` binds every
  generated route key to exactly one local React component. It is a binding
  contract, not a second router or a runtime route store.
- `admin` contributions render inside the platform's one `Shell`. `user`
  contributions render without an admin Shell, while remaining inside the same
  router, runtime identity, permission context and data provider.
- `defineAdminContributions` remains the stricter admin-operation-only helper
  and rejects user routes. Existing custom admin pages continue to use the
  same contribution provider and typed resource action slots.

## Stable invariants

1. The `pages` keys must exactly equal generated `appRoutes` keys. Missing,
   extra or duplicated bindings fail before render.
2. Route paths come only from generated contracts. Components cannot replace a
   route path, surface, access rule, parent, tab persistence or keep-alive mode.
3. Parameterized desktop/mobile routes are normal generated contracts and
   receive React Router parameters in their component. Parameterized routes are
   direct-entry only and never become admin navigation items.
4. Route access is checked for the route and every declared ancestor using the
   current user's capability union. UI reachability never replaces Data API,
   Workflow or application-operation server authorization.
5. An admin component does not render `Shell`; a user component owns only its
   own page presentation. Neither component creates a `BrowserRouter`, Refine
   provider, identity provider or permission store.
6. Route components are bundled into the immutable application frontend. The
   platform never downloads arbitrary module URLs or evaluates remote code.

## Failure, security and bounds

- Bindings are capped at the compiler route limit. Codes, paths, surfaces,
  access expressions, parent references and cycles are validated and frozen.
- `defineApplicationContributions` accepts both `admin` and `user` surfaces but
  enforces `/admin/...` only for admin routes and rejects user routes that
  collide with the admin namespace.
- Unknown or unauthorized routes render no application component; unauthorized
  declared routes render a stable 403 result inside their appropriate surface.
- Parent access is monotonic: a child cannot weaken an ancestor's capability
  requirement.

## Affected contracts

- `OpenXiangdaApplicationProps.contributions`;
- `defineApplicationContributions`, generated `appRoutes` and route page props;
- application runtime route composition and admin information architecture;
- template `main.tsx`, application `AGENTS.md`, packaged OpenXiangda skill and
  frontend documentation;
- packed reference application and browser/export/contribution tests.

No server or SQL change is required. Stable OpenXiangda 1.x applications are
outside this contract.

## Rollback boundary

Applications using user route contributions require the exact package version
that publishes this contract. Rolling back means restoring the preceding
application bundle and package set together. There is no data repair.

## Falsifiable verification

1. A generated fixture with desktop and mobile parameterized user routes binds
   every route through `defineApplicationContributions` and renders inside one
   application router/runtime.
2. Admin contributions have one platform Shell; user contributions have no
   admin Shell. Source and browser tests detect a nested router or duplicate
   Shell.
3. Missing/extra page keys, admin/user namespace mismatch, duplicate path,
   invalid parent and parent cycle fail deterministically.
4. Capability `allOf`/`anyOf` and inherited parent guards produce 403 without
   invoking the page component.
5. Template, Skill and generated contract tests teach this composition path;
   the packed reference application consumes only exact published packages.
