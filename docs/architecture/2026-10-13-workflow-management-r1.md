# Action-scoped workflow management (R1)

Status: implementation, not released or accepted. Design authority: Claude's
2026-10-13 decision 19 (`e23b84b8d8e054b96289ee9bf42e869b546f8db83927b4cc30b8d3d0add36117`),
which supersedes the state-lock and redacted-replay decisions in 17/18.

## Evidence and ownership

The contract application's full SDK canvas host exists, but its business manager
cannot be admitted without application-wide management. Backend `2fa41881`
checks legacy management before transactions. The native authorization kernel
already owns reasoned, revisioned management grants and mutation receipts. The
user-role-union owner already locks current admission facts NOWAIT. Workflow
owns the draft, node configuration, registry and original idempotency record.
R1 adds no identity interpreter, receipt ledger, application-owned permission
store or public agent execution path.

## Stable contracts

- Environment-specific grants name a subject application role, workflow targets
  and a subset of `definition.read`, `draft.edit`, `publication.publish`,
  `handling.configure`. Each write action implies read. Membership validity is
  interpreted only by the existing union owner at database time.
- Reader/handling-only sees published data, never draft revision, diagnostics or
  authoring catalogue. Editor and publisher see the shared draft; only editor
  receives the authoring catalogue. Roles combine by union.
- The client sends designer contract marker 2 on every designer request. Legacy
  unrestricted clients retain their existing responses; grant-only legacy
  clients fail explicitly. A new client on an old server fails closed except
  for a bootstrap-confirmed native super-admin.
- Successful mutations retain their full existing result type. Recorded actor
  must match on replay. A separate original-outcome read discloses only kind,
  commit time and revision/publication id to the recorded actor. Historical
  actor-null ownership is never inferred. Absence with continuing authority is
  `undetermined`, not proof of failure.

## Concurrency and security

Mutation lock order: existing exclusive node-configuration lock, original
idempotency lookup, role-union admission rows NOWAIT, existing workflow
head/draft/registry locks, writes and receipt. Admission holds native head,
environment, account, admitting memberships, active manual-role definitions
where needed, native super-admin rows and workflow grant rows FOR SHARE NOWAIT.
The union owner's existing NOWAIT projection-readiness check is reused; the
designer adds no authorization-state, subject or projection-key lock.

Revocation/retirement waits behind an admitted write on its evidence row. An
already-open revocation makes admission fail fast with authority-busy, no
revision change, same-key retry. Source activation is fenced by the native head.
No cached read authorization admits a write. Data-transaction actor guards keep
their existing package-role/capability semantics; manual-role support is for the
workflow management guard, not a silent expansion of data authority.

Bounds: 400 active actor memberships, 512 active grants per environment, 200
workflow targets per grant, four closed actions, at most eight admitting grant
ids in a public receipt. Grant create/update/revoke is native super-admin or the
existing platform-administration owner only, never a workflow/role manager.
Unreleased/new protocol fields cannot select an actor, provider or model.

## Delivery and rollback

Technical host milestone T is administrator-only, not business-role delivery.
R1 is a paired contracts/backend/bootstrap/SDK/grant-management/application
unit. Foundation commits may be validated independently but must not be
represented as a usable delegated-management release. Grants default ignored;
the server can opt in exact environment ids and disable them without deleting
grants or receipts. Two forward additive SQL migrations create grants and add
nullable actor/evidence to original designer mutation records. No historical
actor backfill. Legacy 1.x behavior and public register/deploy/instance/agent
management authority remain unchanged.

TEST rollout only after package/mainline pairing and gates; preserve the prior
platform revision and application TEST version. No production promotion, real
approval/signing replay or role-source incident repair in R1.

## Falsifiable verification

Real PostgreSQL must show save-versus-membership/super-admin/grant revoke and
projection retirement serializing, the reverse order returning busy without
writes, and activation/concurrent loops without deadlock. Test manual roles,
expiry, stale caches, environment/workflow isolation and inert grants. Check
legacy compatibility, all read shapes, actor-bound replay, actor-null history,
own/other/absent outcome and exact result types. SDK must retain unsaved input
and resolve a held operation once on authority loss. TEST acceptance with real
reader/editor/publisher accounts uses `new_only` and synthetic contracts only;
original instances and unchanged-source heads must remain unchanged. Source,
package release, deployment and business readback are distinct evidence.

## Device scope — user decision, 2026-10-13

The user explicitly excluded mobile work for this workflow-administration UI.
R1 canvas editing and grant administration target PC only. Do not spend this
increment adapting or accepting a mobile designer. Existing shared SDK mobile
fallbacks are not removed as an unrelated breaking change. Business end-user
mobile templates and mobile approval tasks are outside this exclusion.
Earlier mobile source-fixture screenshots are historical diagnostics, not an
R1 deliverable or mobile acceptance requirement.
