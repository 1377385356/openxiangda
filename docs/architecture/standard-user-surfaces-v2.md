# OpenXiangda 2.0 Standard User Surface Renderers

Status: accepted for implementation, 2026-09-04

## Problem evidence and capability owner

The React runtime owns authenticated standard user routes such as `/todos`,
`/m/todos` and the paired Workflow launch, task, instance and work-center
routes. Their data, current-user authorization, navigation and lifecycle are
correctly platform-owned, but applications can only accept the platform's
default visual composition. Applications that need a consistent branded user
end therefore copy a second Todo page or route around the runtime. That copy
eventually drifts from Notification Hub, Workflow authorization, desktop/mobile
route negotiation and the current-user role union.

The outcome is one optional `standardUserSurfaces` contribution. The platform
continues to own route registration, `RuntimeBoundary`, current-user state,
Notification Hub requests, Workflow requests and navigation effects. The
application contributes only a paired desktop/mobile frame and a paired
desktop/mobile Todo renderer receiving bounded platform callbacks and immutable
view data.

## Stable invariants

- `AppRouteManifestV3` remains the only standard-route catalog. An application
  renderer cannot register, replace or redirect `/todos`, `/m/todos` or any
  Workflow route.
- `RuntimeBoundary` remains outside every contributed renderer. Applications
  receive no access token, gateway assertion, private client, role session or
  router instance.
- Notification Hub remains the owner of current-user Todo items, counts,
  interaction receipts and pagination. The runtime owns request ordering,
  refresh, query changes, incremental load and navigation.
- Workflow Kernel and the standard Workflow React pages remain the owner of
  launch, task, instance and work-center behavior. A contributed frame can
  compose their rendered children but cannot replace their controllers.
- Omission of `standardUserSurfaces` renders the existing default pages without
  any behavior or markup change.
- A contribution is one desktop/mobile family. Supplying only one device or
  only one of `frame` and `applicationTodoCenter` fails before the application
  mounts; there is no implicit cross-device fallback.

## Public contract

```ts
standardUserSurfaces?: {
  frame: {
    desktop: ComponentType<StandardUserPageFrameProps>;
    mobile: ComponentType<StandardUserPageFrameProps>;
  };
  applicationTodoCenter: {
    desktop: ComponentType<StandardApplicationTodoCenterProps>;
    mobile: ComponentType<StandardApplicationTodoCenterProps>;
  };
};
```

`StandardUserPageFrameProps` exposes the standard page kind, selected device,
children, an immutable route snapshot and a platform-owned `back()` callback.
The route snapshot contains only the manifest entry code, route code, current
path/query/hash and decoded path parameters.

`StandardApplicationTodoCenterProps` exposes current-user items and counts,
loading/error state, immutable query state, `setQuery`, `refresh`, `loadMore`,
`hasMore`, `recordInteraction` and `openItem`. These callbacks are the only
mutation/navigation surface. `openItem` records the click best-effort and then
performs the platform-owned internal or external navigation after checking the
Notification Hub navigation contract.

The contribution is accepted through `defineApplicationContributions(...)` and
is exported by `openxiangda/react`, so the application entry remains the only
binding point.

## Failure, concurrency, security and resource bounds

- Runtime validation rejects a missing or non-function desktop/mobile member
  with `OPENXIANGDA_ADMIN_CONTRIBUTIONS_INVALID:standard-user-surfaces:*`.
- Todo requests use a monotonically increasing request sequence. A late request
  cannot replace the latest query; incremental load is ignored while another
  load is active and deduplicates items by `messageId`.
- Query keyword length remains bounded to 100 characters. Page size remains 12
  on desktop and 10 on mobile, and the existing platform endpoint bounds the
  server result. Renderers cannot supply arbitrary offsets or limits.
- Interaction and navigation callbacks accept only an item from the current
  platform snapshot. A stale or foreign object is rejected rather than used as
  an authority. Server authorization remains mandatory.
- A contributed renderer error is contained by a platform error boundary. It
  shows a non-sensitive recovery surface and can reset that renderer; it never
  falls back after partial side effects or exposes tokens/error stacks.
- Frame props are presentation metadata, not authorization evidence. Route and
  Todo callbacks re-use the existing platform clients and router.

## Compatibility, blast radius and rollback

The contract is additive to the pre-release 2.0 application contribution API.
Applications without the contribution are byte-for-byte behavior compatible at
the route and controller level. The change does not affect OpenXiangda 1.x,
platform database schema, tenant data, server APIs or existing generated route
manifests.

Rollback is the prior `openxiangda` package and application artifact. A broken
application renderer can also be rolled back independently by removing
`standardUserSurfaces`; no platform deployment or data repair is required.

## Falsifiable acceptance

1. Type tests compile the exact public contribution and reject missing device
   pairs; runtime tests reject malformed JavaScript input.
2. Browser tests prove `/todos` selects the desktop renderer and `/m/todos`
   selects the mobile renderer while requests still target the platform Todo
   API and callbacks still navigate through the platform router.
3. Browser tests prove the frame wraps Todo and Workflow launch, task and
   instance pages with the correct page kind, route metadata and device.
4. Existing default Todo and Workflow browser tests pass with no contribution.
5. A throwing application renderer is caught by the platform error boundary
   and retry/reset does not remount the router or `RuntimeBoundary`.
6. Package exports, generated template entry, frontend Skill guidance and a
   representative application build consume the same contract without tokens
   or private API imports.
7. `pnpm verify:affected` and the release candidate gates pass with a reviewed
   Changeset before publication.
