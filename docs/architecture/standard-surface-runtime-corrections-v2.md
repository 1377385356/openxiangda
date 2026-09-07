# Standard surface runtime corrections v2

Status: accepted for implementation on 2026-08-20.

## Problem evidence

- Standard Admin filters send scalar `eq` predicates for stable JSON option and
  directory values. PostgreSQL rejects values such as `software` as invalid
  JSON with SQLSTATE `22P02`.
- A department field is rendered by the platform field kit in forms, but its
  search value is not normalized with the same field contract before a Data
  API query is created.
- Admin tabs persist path metadata while the active Umi `Outlet` is unmounted
  on every navigation. Returning to a tab therefore recreates and reloads the
  page. Query-string changes do not have an explicit page-instance invalidation
  key.
- The official mobile application shell explicitly contributes a role switcher
  even though this surface is the normal end-user entry.
- The procurement reference workflow binds department approval to an
  application role scope. The configured platform organization department
  supervisor is therefore not consulted.
- Native clients request the durable record audit endpoint at
  `/native/data/:resource/records/:id/audit`, but the Native Data controller has
  no matching route. Desktop and mobile detail pages load data and audit in one
  request group, so the missing audit route makes the whole detail page fail.
- The desktop end-user workflow submission route removes primary navigation
  without contributing a back action.

## Capability owners

- `openxiangda-admin` owns standard search-value normalization, tab metadata,
  and bounded mounted page instances.
- `openxiangda-field-kit` remains the owner of department and other platform
  field controls and stable values; no application-specific selector is added.
- Native Data API owns durable business-audit reads and row/field enforcement.
- Platform organization data and `department_supervisor` resolution are the
  only owners of configured department supervisors.
- `openxiangda-user` owns standard desktop submission navigation affordances;
  the application supplies the destination.
- The application template owns which optional controls appear on its mobile
  shell and which workflow provider its domain workflow selects.

## Stable invariants and affected contracts

1. Data API remains the only business-record store and query boundary. Stable
   directory and option values keep their existing `{ label, value }` shapes.
2. Search predicates for those values use JSON containment; text, dates,
   numbers, booleans, and physical scalar identifiers keep their current
   operators.
3. Tabs, mounted page instances, query responses, and drafts remain separate
   state. At most twelve tabs and six mounted pages are retained per identity.
4. A tab is identified by pathname. A change to that pathname's search/hash
   location key remounts the active page and therefore reloads URL-bound data.
5. Identity epoch changes discard every mounted instance. Closing or LRU
   eviction discards only the affected instance; the persisted tab may remain.
6. Native audit returns the existing `openxiangda.data-audit-page/v2`
   contract. No second application audit API or database is introduced.
7. Native audit rechecks the current role's resource capability, row policy,
   and field policy before returning each durable outbox event.
8. Mobile RoleSession behavior is unchanged; only the visible top-level role
   switch button is removed from the standard user template.
9. Workflow Kernel contracts do not change. The reference binding selects the
   already-supported `department_supervisor` provider with `departmentId`
   facts.
10. OpenXiangda 1.x applications and runtime contracts are not affected.

## Failure, concurrency, security, and resource bounds

- Invalid or unreadable search fields still fail closed at Data API. The Admin
  never falls back to browser filtering.
- Cached pages are hidden but remain mounted. LRU eviction is deterministic and
  bounded to six instances; identity changes synchronously invalidate the pool.
- A changed URL location key replaces only the active cached instance. Stale
  requests remain guarded by each standard page's request generation.
- Audit pagination is bounded, reads at most 500 matching durable events, and
  omits events whose record snapshot no longer passes the current row policy.
- Audit is read-only and introduces no lock, receipt, retry loop, or mutable
  application state.
- Department supervisor resolution remains tenant-scoped and uses the existing
  organization service. Empty resolution continues to fail closed.

## Rollback boundary

- Platform rollback is the previous platform-server image; no SQL migration is
  required.
- Frontend rollback is the previous independently published package set.
- Application rollback is the previous immutable preproduction AppVersion.
- No compatibility switch or duplicate endpoint is kept after rollback.

## Falsifiable verification

1. Admin tests prove department search uses the Field Kit control and stable
   option/directory values compile to JSON containment rather than scalar `eq`.
2. Admin lifecycle tests prove switching between two tabs preserves component
   state, the seventh cacheable page evicts the least recently used instance,
   closing a tab unmounts it, identity changes clear all instances, and a query
   change remounts the active instance.
3. Native Data tests prove the audit route exists, returns masked durable
   history, enforces current row policy, and supports bounded pagination.
4. Workflow tests/config checks prove a configured platform department
   supervisor resolves for `department-review` without an application-managed
   department membership.
5. Mobile Chromium has no role button and can open a purchase detail page.
6. Desktop Chromium can return from the standalone submission page and URL
   query changes reload the appropriate page.
7. Platform `verify:openxiangda-v2:release`, toolchain `verify:release`, and the
   standard application's generate/check/test/build gates pass before a new
   preproduction deployment is activated.
