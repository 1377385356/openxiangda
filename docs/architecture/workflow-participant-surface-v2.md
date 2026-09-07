# Workflow participant surface v2

Status: superseded on 2026-08-25 by the current-user role-union Workflow v2
contract in the unified R0-R6 Workflow and Notification Hub plan.

> Historical decision record only. The `workflow_participant` RoleSession and
> `/workflow/kernel/*` surface described below are deleted pre-release
> contracts. Current Workflow v2 endpoints authorize the logged-in user's
> application-role union plus immutable participant facts; clients neither
> select nor transmit a RoleSession. This record must not be used as current
> implementation guidance.

## Problem evidence

- The standard purchase form already persists the selected department and
  submits `departmentId` as a workflow fact, while the workflow definition also
  asks the initiator to choose a submission department. The confirmation
  surface therefore repeats a decision the user has already made and exposes a
  second "resolve approval path" click.
- Department supervisor resolution returns valid user identifiers without
  display names. A node with four supervisors is rendered as four identical
  unresolved placeholders even though assignment succeeded.
- Workflow preview already contains its canonical end node. Admin, desktop user,
  and mobile user renderers append another synthetic completion node.
- Task surfaces project only a subset of their owning instance, omitting
  `startedAt` and `completedAt`. The timeline endpoint returns command logs only,
  so a newly started instance has no visible process history and no future-node
  preview.
- A department supervisor can be frozen into a workflow task by user identity
  without owning an application role membership. Native RoleSession bootstrap
  stops at `unassigned` before the Workflow Kernel can apply its existing
  task/instance participant authorization.

## Capability owners

- Native RoleSession remains the only owner of the active human runtime
  identity. It may expose one reserved `workflow_participant` subject when the
  user is an initiator or participant in this application's environment.
- Workflow Kernel remains the only owner of task assignment, instance access,
  commands, node state, timestamps, and immutable operation logs.
- Native Data remains the owner of physical business records. Workflow Surface
  may request one revision-bound record for an already-authorized instance and
  project only fields visible under the workflow field policy.
- Workflow Definition and Binding remain the only owners of path shape and
  assignee resolution. Renderers do not infer workflow transitions.
- Admin and user renderers own only presentation and automatic re-prepare after
  all required answers are present.

## Stable invariants and affected contracts

1. A business form's explicit department fact is used directly by a
   `department_supervisor` binding. The reference workflow does not ask for a
   second organization-context department.
2. `prepare-start` remains revision-bound and side-effect free. When genuine
   requirements remain, changing a complete answer set automatically requests a
   new preparation; starting still requires a ready preparation token and one
   explicit confirmation.
3. Candidate identifiers and assignment semantics do not change. The platform
   adds directory display names when they are available, and renderers fall back
   to a concise assignee count instead of repeating unresolved labels.
4. A canonical end node is the sole completion step. A synthetic completion
   step is added only when a preview has no end node.
5. Workflow timeline adds a deterministic `flow` projection containing submit,
   planned nodes, node visit state, assignees, and lifecycle timestamps. Existing
   immutable command logs remain available as `items`.
6. Task Surface returns the complete public instance lifecycle projection and a
   field-policy-filtered `presentation.businessData` record when the DataRef is
   valid. The client does not need ordinary Data API read capability to render
   an assigned approval.
7. The reserved `workflow_participant` RoleSession has zero application
   capabilities and no data scopes. It does not create an application role or
   membership. Workflow endpoints still authorize every task, instance,
   work-center row, timeline, and command from stored participation.
8. `workflow_participant` cannot prepare or start a workflow and cannot call
   ordinary Data/App APIs. Existing membership and super-admin behavior is
   unchanged.
9. OpenXiangda 1.x, unrelated tenants, and existing production AppVersions do
   not consume these 2.0 contracts.

## Failure, concurrency, security, and resource bounds

- Automatic re-prepare is generation-guarded; a later answer change wins and a
  stale response cannot replace the current preparation token.
- RoleSession creation and switching keep the existing serializable transaction,
  single-active-session rule, expiry, Head revision binding, and CAS behavior.
- The reserved subject exists only while a matching workflow instance or task
  participation row exists in the same tenant, application, environment, and
  user identity. It is invalidated by the normal bootstrap/context checks when
  that relation disappears.
- Workflow instance, task, timeline, and business-data reads fail closed unless
  the caller is the initiator, a stored participant, or the application super
  admin. Completed participants retain read-only history access; only an active
  task assignment receives command operations.
- Timeline planning uses the activated immutable definition and frozen fact
  snapshot. It is bounded by the existing 200-step planner limit. Business-data
  projection reads exactly one referenced record and never enables list queries.

## Rollback boundary

- Platform rollback uses the previous platform-server image plus the down
  section of the additive RoleSession subject-kind SQL migration.
- Frontend and contract rollback uses the previous independently published
  OpenXiangda 2.0 package versions.
- Reference application rollback uses the previous immutable preproduction
  AppVersion. No compatibility flag or duplicate authorization store remains.

## Falsifiable verification

1. Reference workflow tests prove that the department selected in the business
   form is the only department input and resolves the configured platform
   supervisor.
2. Admin, desktop user, and mobile user tests prove answer changes re-prepare
   automatically, real assignee names render, and previews contain one terminal
   node.
3. Platform tests prove task Surface carries start/completion timestamps and
   field-policy-filtered business data, while timeline returns submit, complete,
   active, and waiting node states plus immutable command logs.
4. A user with no application membership but an assigned department-supervisor
   task receives a `workflow_participant` RoleSession, can open and operate that
   task, can view the instance history after completion, and cannot prepare a
   new workflow or read ordinary Data API records.
5. Users with no application role and no workflow relationship remain
   `unassigned`; membership, multi-role selection, and super-admin tests remain
   unchanged.
6. Platform OpenXiangda v2 release verification, toolchain affected/release
   verification, reference application generate/check/test/build, and desktop
   plus mobile Chromium approval paths pass before preproduction activation.

## Release-gate correction: local department supervisor resolution

The first formal packed-distribution run failed in the fresh PostgreSQL
application at `department-review` with
`WORKFLOW_V2_APPROVER_RESOLUTION_EMPTY`. Production correctly delegates this
provider to platform organization data, but the local platform adapter still
expected every approval binding to carry an application `roleCode`; the
standard `department_supervisor` binding intentionally has none.

- Ownership and contracts remain unchanged: production organization data owns
  configured supervisors, while the local adapter only emulates that provider
  from the fixture's `department_manager` membership and department approval
  scope.
- The local adapter must require the binding's `departmentIdFrom` fact and a
  matching `department` scope grant with `approve` (or `*`). Missing facts,
  roles, or scope continue to fail closed with the existing resolution error.
- No new state store, public API, environment branch, concurrency behavior, or
  production authorization path is introduced. Rollback is the previous
  `openxiangda-local-platform` package.
- Unit verification covers both a matching and a non-matching department, and
  the packed fresh-application PostgreSQL lifecycle must resolve the same
  `department-review` node before this candidate can be published.

## Release-gate correction: persistent delegation policy

The next packed-distribution run resolved the department supervisor correctly,
but PostgreSQL start rejected the direct assignment with
`WORKFLOW_V2_PREPARATION_ASSIGNMENT_CHANGED`. The local assignment owner had
correctly ignored an unrelated long-term delegation, while the transaction
guard still queried delegation rules for every provider.

- The activated workflow binding remains the sole owner of whether long-term
  delegation applies. The local platform passes that resolved policy into the
  PostgreSQL transaction; the store does not infer provider semantics.
- Delegatable nodes retain the existing delegator lock, active-rule query, and
  frozen participant comparison so a concurrent rule change still invalidates
  preparation. Non-delegatable nodes validate a direct primary participant and
  deliberately do not consult or lock unrelated delegation rules.
- No public contract, persisted document, production provider, application
  identity, or business-data path changes. The rollback boundary is the prior
  `openxiangda-local-platform` package, and 1.x applications, other tenants,
  and already deployed AppVersions remain outside the blast radius.
- Verification must keep an active department-manager delegation present while
  a `department_supervisor` preparation starts directly in the real local
  PostgreSQL lifecycle. Its add-sign target remains a second explicit,
  in-scope department-manager identity; the test must not widen the current
  node to a finance role. Existing delegatable-node concurrency and snapshot
  tests must continue to pass.

## Release-gate correction: department supervisor participant targets

The formal packed-distribution lifecycle then reached the explicit after-add-sign
command, but the local platform rejected the second department-manager identity
with `WORKFLOW_V2_TARGET_ROLE_SUBJECT_INVALID`. Initial assignee resolution
already derived the implicit `department_manager` role and required the selected
department's approval scope; participant-target validation still read only an
explicit binding `roleCode`, which `department_supervisor` intentionally omits.

- The activated Workflow binding remains the only owner of target eligibility.
  The local adapter must apply the same implicit `department_manager` role,
  `departmentIdFrom` fact, and `department` `approve` (or `*`) scope check to
  transfer, delegate, and add-sign targets that it applies to the original
  department-supervisor assignment.
- Missing department facts, a different application role, an out-of-scope
  department, an expired local target, or an unknown RoleSubject continues to
  fail closed with the existing target-validation error. No fallback role or
  second resolver is introduced.
- Public Workflow contracts, remote provider behavior, participant persistence,
  task/instance CAS, idempotency receipts, and concurrency behavior are
  unchanged. Validation remains a bounded scan of declared local fixture roles
  and scope grants and does not add remote calls or mutable state.
- The rollback boundary is the prior `openxiangda-local-platform` package.
  OpenXiangda 1.x, other tenants, production platform authorization, and already
  deployed AppVersions remain outside the blast radius.
- A focused local-platform test must accept a same-role target for the selected
  department and reject the same target for another department. The full packed
  PostgreSQL lifecycle must complete add-sign, restart recovery, and subsequent
  approvals before this candidate can be published.
