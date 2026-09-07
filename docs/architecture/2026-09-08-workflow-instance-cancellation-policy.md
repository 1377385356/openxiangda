# Workflow Instance Cancellation Policy

Status: toolchain and platform candidate implemented; release and live application
verification pending.

## Evidence

The independent meeting application lifecycle exercise requires both initiator
cancellation and business-administrator cancellation before the scheduled start,
with a required administrative reason. Ordinary resource writes are action-owned.

The current Workflow v2 `instanceSurfaceOperations` always offers `withdraw` to
the initiator of a running/returned instance. `instanceCommand` verifies the
command token, instance revision, initiator identity, and workflow status, but
has no business deadline constraint. A separate application endpoint cannot
prevent a direct standard Workflow withdrawal after the business deadline.

The same command service restricts `terminate` to `isAppSuperAdmin`. A business
administrator cannot cancel another user's pending process through a declared
business capability. Promoting that role to application super administrator
would expand authority beyond the approved requirement.

These are contract gaps established by source and public schema inspection,
not yet reproduced through a deployed meeting instance. The application keeps
its architecture baseline in draft while the supported solution is established.

## Owner and Invariants

- Workflow Kernel v2 remains the sole owner of instance commands, authorization,
  command tokens, command receipts, instance/task state and terminal events.
- Native Identity/AuthZ remains the sole owner of current user capabilities.
- Data API remains the sole owner of business records. No application database,
  local lock, browser-only restriction, or impersonated administrator is allowed.
- Existing applications without the optional policy preserve current behavior.
- Every command entry and Surface uses the same declared policy. A token issued
  before a deadline must not bypass a command-time deadline check.
- Cancellation, task termination, command receipt and events retain their current
  transaction boundary. Business projections remain governed by their separately
  declared event/transaction contracts and must not claim premature completion.

## Contract Decision

The pinned definition may declare `instanceCommands.withdraw.beforeFact` and
`instanceCommands.terminate = { capability, beforeFact? }`. `beforeFact` names a
required root input fact with `type: string, format: date-time`, mapped by the
subject projection to a non-nullable datetime resource field. Nested paths,
arbitrary predicates, local clocks and callbacks are outside this first contract.
The terminate capability is an exact, explicitly declared capability of the same
application, without wildcard grants. There are at most two command policies.

The Kernel evaluates `databaseNow < beforeFact` after locking the instance,
using PostgreSQL `clock_timestamp()` (transaction-start `now()` is insufficient
after a lock wait). It re-resolves current authorization inside the transaction.
The current pinned instance fact snapshot is authoritative; supported resubmit
may replace facts, while this application's submitted fields remain immutable.
Both initiators and super administrators must obey an opted-in deadline.
Termination requires the existing super administrator or the explicitly delegated
current capability. Withdrawal remains initiator-only. Existing required reason
validation is preserved for both commands.

Task and instance Surfaces use the same evaluator and database clock. A visible
deadline-expired command is disabled and excluded from issued token command sets.
The command path always checks again, even when the token predates the deadline.
Delegated terminators may read the configured instance Surface and timeline after
the deadline or completion; this is explicit workflow-detail read authority, not
task participation, generic Data API access, work-center administration, copying,
reassignment, deletion or approval. Revoking the grant removes that read authority.

Pure policy validation is shared by the application and native compilers and the
Kernel planner. Application packages declaring the feature require the new
`workflow.instance-cancellation-policy` platform capability. Old servers must
reject these packages; applications without the policy retain their requirements.
No unimplemented declaration enters a published toolchain or root release gitlink.

The existing exact shared-validator digest gate requires the matching CLI and
platform revision for development/deployment. Already deployed instances without
policy preserve behavior; older V2 development workspaces may need an official
toolchain upgrade to connect to the updated validator. No V1 engine is changed.

The separate finding that reject Surface requires a comment while the decision
path accepts an empty comment is a later repair unit. It is not folded into this
contract's commit or used to broaden cancellation privileges.

## Failure, Bounds and Rollback

Only the two cancellation commands are in scope; no arbitrary scripts, remote
callbacks, extra data stores, or general workflow engine redesign. Invalid
deadline facts and unsupported policy declarations fail closed. Deadline and
permission checks happen before workflow side effects. Successful idempotent
replay returns the existing receipt without reexecuting the command.

The change is optional and limited to V2 definitions declaring the policy; V1
and other applications keep their behavior. No SQL migration is expected.
Rollback must retain a policy-aware server while any deployed definition depends
on it; reverting only the application code does not rewrite pinned instances.

## Falsifiable Verification

1. Initiator withdrawal before the deadline succeeds; at/after it fails without
   cancelling tasks, changing instance state or emitting terminal facts.
2. A token obtained before the deadline cannot bypass the later command check.
3. Only the explicitly authorized current business capability may terminate the
   configured workflow; unrelated roles and revoked grants fail.
4. Business management does not grant approve, reassign, delete or other platform
   administration powers. Required reasons and current CSRF/token checks remain.
5. Missing/malformed fact values fail closed, and replay of a completed command
   does not run checks or effects a second time.
6. Existing workflows without policy pass their existing regression suites.
7. Packed official CLI, matching platform release and the independent application
   demonstrate the same behavior through real role browser/API acceptance.
