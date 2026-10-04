# Atomic current-actor authority in named business transactions

Status: accepted for implementation under the user's existing local platform repair and equivalent V1 migration authorization. 2026-10-05.

## Evidence and owner

ZJNU V2 Head33 maintenance submit/completion deliberately remain school-admin/appSuperAdmin-only. V1 adminManagementScope.ts combines school, explicit business-college roles (including dean) and currently assigned instrument administrators. Native BusinessData's verified capability is an action gate; current role-member guards verify a target's package membership, without binding that same membership to the action capability and an optional scope. Assignment candidates are a read/dispatch predicate and are not management authority. This is a contract gap, not a failed application request.

Platform UserUnion authorization owns current actor, active memberships, capability bindings, grant scopes, validity and environment. Native's existing transaction manager owns guards and writes. Applications own the instrument relation and business rules; they freeze Native record revisions and inspect the current actor's stable ID, never maintain authorization snapshots.

## Additive contract and invariants

Add transaction guard `actor-authority`, only for authenticated named gateway/connected-development business actions explicitly declaring `platformAccess.roleAssertions.actorAuthority:true` and a nonempty allowed `roleCodes` list. Guard shape: `kind`, `errorCode`, `anyOf` (1–20 distinct requirements `{roleCode, scope?:{dimensionCode,value,operation}}`), optional `allowAppSuperAdmin:boolean` (default false). No userId, capability, membership IDs or browser authority are accepted in the guard. Actor and required capability come only from the verified action. Every requested role must be declared by that action and the current authz revision. Scope dimensions must exist in that revision.

The guard succeeds if the currently valid application-super-admin grant is explicitly permitted, or one locked package membership simultaneously has its requested role, this action's required capability and the exact declared scope value/operation. Scope matching retains the existing role-candidate/Workflow membership predicate: exact dimension/value; absent, null or empty operations mean all, otherwise the operation or `*` must match. Role union is OR across full eligible memberships; capability from one member and scope from another cannot combine. Manual/unrelated roles, user-level scope, account department and client role snapshots are not substitutes. Existing role-member dispatch guards are unchanged.

Lock the active environment/head, strict authorization projection readiness, current account, relevant memberships and permitted super-admin grants inside the existing manager using NOWAIT and bounded lock/statement time. Obtain database time after all relevant locks, re-resolve current UserUnion and evaluate only locked identities. Freeze scope membership rows until the business transaction completes. No async grants, HTTP lookup, shadow IAM store, new endpoint, cross-tenant bypass or SQL data migration.

The actor guard caps related locked memberships at 400 (select at most 401 and fail busy on overflow); all guards share the existing 20-guard/20-branch/byte budgets. Account eligibility is rechecked at the post-lock database time. The native wrapper keeps a stricter existing timeout, otherwise sets lock wait to at most 1 second and actor-guard SQL to at most 10 seconds; timeout returns a bounded busy result with the original request retained.

Derive `data.transaction-actor-authority@1.0.0` from the explicit declaration. Carry it through contracts, both compilers, Nest, connected-dev and platform immutable projections. Ordinary user/app/event/queue APIs cannot use the guard without this action context. Keep strict shapes, 20 guard/20 branch bounds and existing transaction bytes/operation budgets. Unknown-result recovery and original same-key receipts retain their existing owner/identity and replay semantics.

## Application usage and boundary

Use a dedicated maintenance-management capability, not the broad instrument manage capability. The equivalent management alternatives are school-admin, college-admin/college-dean with instrument's authoritative business college, and instrument-admin only when the authoritative instrument's current instrument_admins includes the actor. Instrument/maintenance revisions and instrument lock remain guards, so ownership/assignment changes between preparation and commit reject. Actor scope is re-evaluated at commit; prepare is not a permission grant. Application-super-admin allowance retains the original management behavior and never makes the actor an approval participant.

Use platform Native data policies for scoped management reads and fields. Navigation, scopes and identities come from platform projections; no frontend cached role/scope table. Preserve ordinary public/personal projections and direct sensitive-mutation denial. UI compatibility and complete role acceptance are separate from kernel verification.

## Failure, concurrency, rollout and rollback

Known guard rejection returns the declared bounded OPENXIANGDA_* code/pointer and rolls back all writes/events/receipts. Lock conflicts keep existing retry/recovery protocol; unknown transport outcomes query the original request. Never silently fall back to an unscoped branch. Revocation completed before commit must reject; a revocation overlapping an already locked committing transaction may occur after that transaction and must not be represented as an earlier revoke. Deadlines use database time after locks.

V1 engine and applications without the opt-in are unaffected. Other V2 applications retain existing contract behavior. Local-only source/SDK deployment; no npm or school production publish. Additive source rollback disables new declarations first; app/SDK rollback cannot undo committed business data. Old definition instances remain frozen.

## Falsifiable verification

Contracts: strict schema and validator agree; compiler preserves flag and derives capability; malformed/empty/oversize/undeclared branch fails; old declaration remains unchanged. Nest and platform reject ordinary/service/event contexts and missing opt-in. Server/real PostgreSQL: same-member pass; capability-only plus scope-only members fail; a later eligible membership passes; expired/revoked/disabled member/account and wrong tenant/head/scope/operation fail; lock conflict and revocation serialization preserve atomicity; app super-admin is checked/locked only with explicit allowance. Application: own college/instrument pass, other college/instrument fail, multi-role union, preparation-to-commit revoke/ownership change, raw direct mutation denial, and original-receipt replay. Browser evidence uses the actual published Head and records partial coverage honestly.
