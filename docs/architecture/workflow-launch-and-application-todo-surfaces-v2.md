# Workflow launch and application todo surfaces v2

Status: accepted for implementation on 2026-08-28.

This decision extends, and does not replace,
`workflow-custom-detail-routing-v2.md`. The custom detail declaration remains
the single navigation contract for Workflow detail entry from the work center,
the application todo center and notification channels.

## Problem evidence

OpenXiangda already provides authenticated Workflow task/instance Surfaces and
desktop/mobile detail pages. Its standard Workflow launch page, however, is a
desktop-only route that trusts the locally generated Workflow declaration and
navigates to a hard-coded desktop detail path after start. The active platform
Workflow Head and Native Contract Head therefore do not expose one read model
that proves whether the current Workflow is launchable and which canonical
desktop/mobile paths and command endpoints belong to that release.

Notification Hub v2 already stores application messages and per-user recipient
state, including `action_required`, unread/read/clicked state, fields, actions
and an authenticated navigation target. Only management APIs exist today. They
return cross-user delivery and audit data and cannot safely back a logged-in
user's application todo page.

The first formally generated todo declaration exposed a second ownership gap:
the package compiler emitted `application-todo-center`, but the platform Native
preflight rejected that exact page-reference kind with
`NATIVE_ADMIN_PAGE_REFERENCE_KIND_INVALID`. The platform compiler must accept
and independently project the same canonical page before the contract is
deployable; an application fallback to the Workflow work center is not valid.

## Capability owners and contracts

- The active Workflow environment Head owns the immutable definition and
  binding versions. The active Native environment Head owns the matching
  Workflow launch declaration and route catalog.
- Workflow Kernel exposes an authenticated `WorkflowLaunchSurface` for one
  Workflow and environment. The Surface is the canonical read contract for
  title, launch mode, active revisions, standard desktop/mobile launch paths,
  compiler-owned process operation, subject declaration and durable commit.
- Application React renders the Native subject form but does not own a save
  callback. The platform atomically commits the bounded business mutation and
  Workflow intent, then exposes recovery through `ProcessCommandSurface`.
- Notification Hub v2 messages and recipient rows are the only todo state
  owner. A dedicated current-user projection exposes only the logged-in user's
  rows in one application and environment.
- The existing Notification navigation resolver owns desktop/mobile targets.
  Workflow task and instance targets use the same custom detail-route resolver
  as work center and channel delivery.
- Native application configuration owns whether the standard application todo
  page is compiled and where it appears in admin navigation. Application code
  does not recreate the inbox with local state or direct SQL.

## Stable invariants

1. `WorkflowLaunchSurface` is read-only and authenticated with the current
   logged-in user's application-role union. It reads one active Workflow Head
   and one active Native Contract Head for the same application, environment
   and environment id.
2. `standalone` and `hidden-handoff` Workflows expose standard desktop and
   mobile launch paths. `custom-page` and `work-center-only` fail closed when a
   caller requests the standard launch page.
3. Desktop and mobile launch pages share one compiler-owned process operation,
   one subject declaration, and one durable command protocol. They render
   independently, persist `commandId` in the URL, and never call prepare/start.
4. The todo API derives the user id from the authenticated request. It never
   accepts a target user id, RoleSession, application client secret or role
   selection from the browser.
5. Todo responses never contain other recipients, deliveries, attempts,
   channel bindings, raw template variables, source snapshots, action tokens or
   audit details.
6. A recipient interaction advances monotonically from unread to read to
   clicked. An `action_submitted` state is never downgraded. Repeated read or
   click requests are idempotent.
7. Todo navigation is resolved at read time against the current environment
   Head. A custom Workflow detail declaration therefore changes work center,
   todo center and channel links together without rewriting stored messages.
8. Current-user role summaries continue to come from
   `openxiangda.runtime-authorization/v2`; directory search and resolution use
   the existing bounded public directory SDK. Todo recipient materialization
   already stores resolved user ids, so no arbitrary-user role enumeration API
   is introduced.

## Failure, concurrency, security and bounds

- Missing/mismatched active Workflow or Native Heads, an unknown Workflow,
  invalid launch mode, or invalid route contract returns a stable failure and
  never guesses a fallback configuration.
- Launch Surface revision hashes the effective app/environment, Workflow Head,
  Native Contract revision and launch declaration. Atomic Head promotion keeps
  one request internally consistent.
- Todo list queries are bounded to 50 items per request and stable cursor/order
  values. Filters are allowlisted; free-text search is length bounded and uses
  parameterized SQL. Counts and items share the same tenant, application,
  environment and current-user predicate.
- Recipient rows are updated in a transaction with a row lock. Interaction
  progression is monotonic and emits a bounded user audit without channel
  impersonation.
- External targets retain the Notification Hub HTTPS allowlist and credential
  guards. Application/platform targets are returned as application-relative
  desktop/mobile paths, not token-bearing absolute URLs.
- A message whose logical target is invalid fails closed for navigation while
  remaining visible as a todo; the response carries a non-sensitive
  `navigationUnavailable` marker.

## Application todo information architecture

The platform page is product-neutral and must not copy an application's legacy
screen. Desktop uses a full-width semantic table with no permanent detail
preview; mobile uses a separate touch-first list. Both expose three stable views:
`待处理`, `消息`, and `已完成`, plus unread state, bounded search/filtering and a
single `查看详情` action that follows the canonical device navigation target.
Visual design must be generated from these requirements before page
implementation and stored as release evidence.

Accepted requirement-driven mockups:

- [desktop application todo center](./assets/application-todo-center-desktop-v2.png)
- [mobile application todo center](./assets/application-todo-center-mobile-v2.png)

## Affected contracts

- public Workflow launch Surface types and browser/NestJS clients;
- Workflow controller/service and active Native Contract projection reads;
- generated standard desktop/mobile Workflow launch routes;
- public application-todo contracts and browser client;
- current-user Notification Hub controller/service and navigation resolution;
- native admin page/reference compiler, schemas, generated exports and runtime;
- OpenXiangda skill, Workflow/Notification docs, tests and packed reference app.

No SQL migration is required. Notification Hub v2 already owns all required
message, recipient, interaction and time columns. OpenXiangda 1.x remains
outside this contract.

## Rollback boundary

The changes are additive. Removing the todo page declaration and deploying the
preceding exact OpenXiangda package set removes the UI. Rolling back the platform
server image removes the new read/interaction and launch Surface endpoints.
Existing Workflow instances, messages, recipients and delivery records remain
valid; no data migration rollback or repair is required.

## Falsifiable verification

1. Launch Surface returns exact active definition/binding/contract revisions,
   both standard device paths and command descriptors for an authorized user;
   missing role, mismatched Head and nonstandard launch modes fail closed.
2. `/workflows/:workflowCode/start` and
   `/m/workflows/:workflowCode/start` load the same Surface and protocol; after
   start they navigate through the correct device detail entry, including a
   declared custom detail route.
3. Todo list/count tests prove strict tenant/app/environment/current-user
   isolation, stable pagination, state/search filters and redaction of
   management-only data.
4. Read/click interaction tests prove monotonic idempotent progression and
   reject a message not addressed to the current user.
5. Workflow todo targets resolve to the same declared desktop/mobile custom
   detail paths as work center and notification delivery; invalid targets do
   not leak credentials or another recipient.
6. Compiler/schema tests cover the new todo page reference and generated route;
   packed reference installation, browser desktop/mobile E2E and full platform
   Workflow/Notification suites pass.
