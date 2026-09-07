# Workflow custom detail routing v2

Status: accepted for implementation on 2026-08-28.

## Problem evidence

The standard Workflow work center links directly to `/tasks/:taskId` and
`/m/tasks/:taskId`. Workflow Notification Hub projections persist separate
`workflow.task` or `workflow.instance` targets, and channel delivery resolves
those platform routes independently. Although applications can declare custom
React routes and call the headless Workflow Surface APIs, there is no canonical
declaration that replaces Workflow detail navigation across browser, message
center and channel deep links.

## Capability owner and contract

- `openxiangda.config.ts` is the only authoring owner. A Workflow definition
  declaration may add:

  ```ts
  detailRouteCode: {
    desktop: 'purchase-approval-detail',
    mobile: 'purchase-approval-detail-mobile',
  }
  ```

- The compiler validates and projects the active definition's route codes into
  the Workflow application contract. It never copies page components or URLs.
- The active Native environment Head is the runtime owner of the effective
  immutable Contract Bundle revision, which contains both Workflow contracts
  and the frontend route catalog.
- Workflow Kernel remains the owner of instance/task authorization and
  commands. Notification Hub owns the logical message and channel delivery,
  but consumes the same Workflow detail-route resolver.
- Application React owns only the declared route components and presentation.

## Stable invariants

1. Omitting `detailRouteCode` keeps the standard task/instance detail pages.
2. A custom detail declaration contains both `desktop` and `mobile` route
   codes. The desktop route has `surface: 'admin'`; the mobile route has
   `surface: 'user'`.
3. Both route paths contain exactly one dynamic path parameter,
   `:instanceId`, and no wildcard. A task link adds `taskId` as a bounded query
   parameter, so one page can load the instance Surface and, when present, the
   task Surface.
4. Route capability/access remains the frontend reachability gate. Landing on
   the page never grants Workflow access: every Surface and command request is
   re-authorized for the current logged-in user's application-role union.
5. Work center, message-center logical targets and channel deep links all use
   the same platform resolver against the current environment Head. No app
   domain, token, cookie or RoleSession value is stored in the declaration or
   message.
6. A declared custom route that cannot be found or rendered fails closed. Only
   an omitted declaration receives the standard-page fallback.

## Failure, concurrency and bounds

- The compiler rejects missing route codes, wrong surfaces, paths without
  `:instanceId`, extra dynamic parameters, duplicate desktop/mobile route
  codes, or a partial declaration.
- Runtime resolution reads the one immutable Contract Bundle revision pinned by
  the active environment Head. Head promotion is atomic; a request never mixes
  Workflow metadata and routes from different revisions.
- Resolution is bounded by the existing maximum of 100 Workflows and 500
  frontend routes. Path and query values use existing identifier and URL
  sanitation; `taskId` and `instanceId` are the only runtime substitutions.
- Stale task commands continue to fail on task/instance versions and preserve
  existing idempotency receipts. Navigation does not participate in command
  state or retries.

## Affected contracts

- public config/compiler and Contract Bundle Workflow declarations;
- generated `workflowDefinitions` and application route contributions;
- standard desktop/mobile Workflow work center and direct standard detail
  entry;
- Native platform configuration compiler closure;
- Workflow work-center response navigation metadata;
- Notification Hub Workflow projection and DingTalk/channel URL resolution;
- OpenXiangda Skill, template and frontend/Workflow documentation.

No SQL schema change is required because route declarations already live in
immutable JSON configuration projections. Stable 1.x Workflow, routes,
messages and applications are outside this contract and remain untouched.

## Rollback boundary

The change is additive at the declaration level. Removing `detailRouteCode`
and promoting the preceding AppVersion restores standard detail pages. Platform
rollback is the preceding platform-server image plus the preceding exact
OpenXiangda package set; no data repair or migration rollback is required.

## Falsifiable verification

1. Compiler positive fixture emits both route codes; partial, missing, wrong
   surface and wrong dynamic-path fixtures fail at stable JSON pointers.
2. Generated contracts keep the route codes and a packed reference application
   binds both desktop and mobile route components.
3. Desktop and mobile work-center items navigate to their declared route with
   `instanceId` in the path and `taskId` in the query.
4. Direct standard task/instance URLs redirect to the same custom route; a
   Workflow without the declaration still renders the standard page.
5. Notification projection stores `workflow.detail`; Fake Channel and DingTalk
   snapshots resolve the declared mobile route, while desktop delivery resolves
   the declared desktop route.
6. Missing active route data fails closed, external/credential URL guards still
   pass, duplicate/stale command tests remain unchanged, and 1.x code has zero
   diff.
