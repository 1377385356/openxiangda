# Workflow standard detail surface v2

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

Status: accepted for implementation on 2026-09-02.

## Problem evidence

- The standard mobile Workflow detail rendered resource field codes and raw
  values for ordinary business fields, while fields declared with
  `system: true` appeared in a visible system section.
- The page treated a business-record revision difference as a persistent
  warning and blocked a decision before the Workflow command was submitted.
  Workflow-owned projections may legitimately update the business record, so
  this is not an authoritative command conflict.
- Immutable operation logs were rendered again in a separate operation-history
  block after participant outcomes and comments had already appeared in the
  vertical process timeline.
- Workflow instance, task, record and resource identifiers were exposed in a
  technical-information collapse. Applicant presentation could fall back to a
  raw user identifier.
- The canonical desktop task and instance routes lived under `/admin` and the
  renderer mounted the admin Shell, exposing management navigation, tabs and
  account chrome around an ordinary approval page.

## Capability owners

- Workflow Kernel v2 remains the only owner of instances, tasks, command
  tokens, command CAS, participants, immutable operation logs and timeline
  facts.
- The Workflow detail reader owns the bounded `businessDetail` exposure
  projection. It derives presentation from the pinned Data Resource declaration
  and Workflow field policy; ordinary resource detail is not the Workflow
  exposure contract.
- Native Directory data owns applicant and operator display names. The
  Workflow Surface may use the immutable display snapshot when it is friendly,
  then tenant-scoped directory resolution, but never a raw identifier fallback.
- The compiler-owned route manifest remains the only standard route catalog.
  The React runtime owns whether a standard route mounts the admin Shell or a
  standalone page.
- The Workflow aggregate detail reader owns a revision-consistent composition
  of the authorized Surface and the server-owned timeline display projection.
  It does not introduce a second command or authorization path.

## Stable invariants and affected contracts

1. A standard Workflow detail exposes only ordered business-readable fields.
   A field is excluded when either its pinned schema declaration or Surface
   metadata has `system: true`, when its code is a platform system field or
   starts with `_`, or when Workflow field policy is `hidden`. Sections with no
   remaining fields do not exist. Parent and subtable projections apply the
   same rule.
2. `businessDetail.status: stale` remains bounded read metadata. It never emits
   a persistent page banner and never prevents selecting or confirming an
   operation. Only an authoritative Workflow command-token/version/CAS conflict
   with a `freshSurface` pointer tells the user that content changed and must be
   refreshed.
3. The typed timeline keeps the existing low-level `flow[]` and `items[]`
   fields for compatibility and additively exposes a server-owned
   `display.entries[]` projection. Task logs bind through the task's node
   visit. Instance-level withdraw/terminate logs become their own terminal
   process event and never appear as submit operations. A display entry has one
   `primaryDisplayTime`; lifecycle timestamps remain available only as typed
   facts. The standard renderer shows actor, action, reason and time once under
   the actual path and has no separate operation-history section.
4. Standard detail DOM never renders instance/task/record UUIDs, resource code,
   event sequence, source revision or diagnostic error pointers. Headless
   Surface fields remain available to authorized clients and platform
   observability; the business page has no technical-information component.
5. Applicant, assignee and operation-actor presentation is a friendly
   directory/snapshot name, optional department and optional avatar URL. A
   shared platform avatar renders the optimized platform default asset when the
   URL is absent or fails. It never renders initials or falls back to user ID.
6. Canonical desktop detail routes are `/tasks/:taskId` and
   `/workflows/:instanceId`. They render standalone authenticated pages without
   the admin Shell. Historical `/admin/tasks/:taskId` and
   `/admin/workflows/:instanceId` URLs have no alias or redirect and own no
   page implementation. Mobile routes stay unchanged.
7. Desktop and mobile timelines remain vertical. Approve/reject stay in the
   fixed primary action area; transfer/return/add-sign stay under more actions.
   Opinion fields remain inside the action Modal or Drawer.
8. `WorkflowDetailSurfaceV2` is an additive aggregate read for task and instance
   routes. It returns a consistent Surface, timeline, current status, node
   display entries, handling records, operation descriptors and stable
   navigation context. The browser SDK and React Hook consume this aggregate;
   the headless executor consumes an operation descriptor and does not require
   callers to branch on task versus instance.
9. Workflow-detail field presentation is a mode of the shared field renderer,
   not a new application renderer. User, department and resource-reference
   fields use the ordinary label/value layout in that mode, empty values render
   `暂无`, desktop uses two fields per row and mobile one. Default CRUD surfaces
   retain their existing presentation.

Affected public contracts are the additive aggregate detail schema, additive
timeline display/person fields, browser SDK and React Hook, generated route
manifest paths, standard React Workflow renderers and Workflow Skill/docs. The
existing Surface schema and Data Resource declaration remain the source of
field semantics; no application-specific visibility declaration is added.

## Failure, concurrency, security and resource bounds

- Command submission continues to use a short-lived, single-use token bound to
  current identity/session, environment Head, instance/task versions, command
  set and CSRF. A conflict is never auto-replayed; the client refreshes the
  Surface and asks the user to repeat the action.
- Filtering occurs in the server exposure projection and again defensively in
  the standard renderer. This can only narrow displayed data and does not grant
  Data API access or change Workflow authorization.
- Directory resolution is tenant-scoped and bounded to the one applicant needed
  for a Surface. Timeline display continues to use the existing bounded result;
  no new list endpoint or mutable identity store is introduced.
- Operation-to-node projection reuses rows already authorized and read by the
  timeline endpoint. It does not create another audit log or infer transitions
  in the browser.
- The aggregate reader obtains the Surface and timeline under the same existing
  authorization boundary, compares `instanceSequence`, retries a bounded two
  times when concurrent Workflow progress is observed, and otherwise fails
  closed with `WORKFLOW_V2_DETAIL_REVISION_CONFLICT`. It never returns mixed
  revisions and never auto-replays a command.
- Avatar URLs remain optional presentation data. The platform accepts only its
  existing safe relative/HTTPS forms and the browser falls back locally after
  an image error. The default asset contains no user-derived text or identity.
- The display projection is bounded by the same task, visit, participant and
  operation result limits as the existing timeline. It adds no unbounded
  directory scan and no caller-selected identity lookup.
- Legacy redirects preserve the same-origin path parameter, query and hash so
  application navigation state is not lost. They do not interpret, elevate or
  forward any value to another origin.

## Rollback boundary and blast radius

- Toolchain rollback is the previous exact OpenXiangda package set; platform
  rollback is the previous platform-server image. No SQL migration or business
  data repair is required.
- Existing Workflow instances, command receipts, operation logs and immutable
  application versions remain valid. Stable OpenXiangda 1.x applications,
  unrelated tenants and applications without Workflow have zero runtime code
  path changes.

## Falsifiable verification

1. Detail-reader tests prove schema/surface `system: true` fields are absent for
   parent and child resources and empty sections are not projected.
2. Renderer tests prove ready, stale and terminal/withdrawn Surfaces have no
   stale banner, technical labels, system fields or UUID text.
3. Command tests prove a real `freshSurface` conflict renders `内容已更新，请刷新后重试`
   and refreshes instead of auto-replaying.
4. Timeline tests prove approve/reject/return/transfer/add-sign/withdraw records
   occur exactly once under their node or terminal process event, use one
   primary display time, show no impossible waiting node after terminal state,
   and produce no separate operation-history DOM.
5. Surface tests prove applicant/assignee/actor directory resolution and the
   friendly missing placeholder; browser markup uses a real/default image
   avatar and contains no initials or user ID.
6. Route/compiler/browser tests prove canonical standalone desktop paths, legacy
   redirects, no Shell/admin navigation/breadcrumb/tab chrome, and unchanged
   mobile paths.
7. Aggregate tests prove task/instance reads return one revision, bounded retry
   closes a concurrent change, and persistent divergence fails closed without
   returning a partial detail.
8. Field-renderer tests prove Workflow mode uses plain user/department/resource
   layout with `暂无`, desktop two-column and mobile one-column layout, while a
   default CRUD render remains unchanged.
9. `pnpm verify:affected`, platform Workflow tests, both release gates, packed
   Chromium acceptance, npm publication and reference-environment runtime checks pass before
   the release is handed to union reference app.

## 2026-09-04 terminal participant presentation correction

- Evidence: a completed union reference app approval node retained every frozen candidate in
  `people[]` while its immutable `operations[]` named the one real approver.
  The standard renderer removed only a candidate whose user ID equalled an
  operation actor, so a non-acting acceptance account remained visible next to
  the real approver. Role-membership cleanup cannot rewrite immutable Workflow
  history and therefore cannot repair this presentation defect.
- Owner and invariant: the server-owned timeline remains the sole fact source;
  the standard renderer owns its bounded presentation. A terminal node with
  one or more operations presents only immutable operation actors. An active or
  waiting node may present unresolved candidate people, excluding anyone
  already represented by an operation. Submission entries without operations
  continue to present their submitter. Parallel approvals, transfer and
  add-sign retain every actual operation and every still-pending candidate.
- Failure, security and bounds: this narrows terminal presentation only. It
  changes no Workflow data, authorization, command, identity or persistence
  contract, performs no extra read, and remains bounded by the existing entry
  arrays. Missing operations preserve the existing people projection rather
  than guessing an actor.
- Rollback: revert the facade renderer/package candidate. No SQL, instance or
  application-data rollback is involved; other tenants receive the same
  corrected standard component only after consuming the new exact package.
- Falsifiable verification: renderer markup for a completed node must contain
  the real operation actor and opinion exactly once and must not contain a
  frozen non-acting candidate. Active/waiting parallel fixtures must keep the
  pending candidate while rendering all completed operations.
