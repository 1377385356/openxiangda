# Structured parallel workflow execution

Status: implementation approved for the owned development laboratory. Design reviewed in the original Claude session; the consolidated contract and sealing amendment are retained in the local design workspace.

## Evidence and owner

The current planner returns one blocking node and task completion consumes all request tokens. The Data API SQL authority compares global request revisions. Rendering a fork before replacing these assumptions would either cancel sibling work or accept stale authority. The workflow kernel remains the single position owner, Native Data API remains the record/revision owner, and Event v2 plus step recovery remain the effect owners.

## Contract

Add paired `parallel { join, branches: [{ id, title, target, when? }] }` and `join { parallel, next }` nodes, two to eight branches, no nesting and at most 200 nodes. Conditions freeze activation at entry. Bodies are disjoint, cannot be entered from outside, and every path reaches the matching join or the common rejected end. Return targets remain within their branch. Task page editable root fields (including owned subtables) are disjoint between branches; steps cannot read sibling writable projections or sibling outputs.

A durable fork visit records immutable activation, monotonically growing arrivals and active/joined/rejected/cancelled status. Visits, tasks, position tokens, steps, return sessions and command tokens carry its id and branch id. A request remains positioned at the active fork; branch position additionally requires an active matching token and an activated, unarrived branch. Kernel and SQL enforce the same predicate. Outside a fork, existing revision checks remain. Inside it, command authority compares R, task revision and scoped position, not the revision changed by siblings. E continues to own people, task pages, fields and operation switches. Adoption never rewrites E.

## Concurrency and failure

Lock configuration then request, then task/fork/timer rows. Serialize join under the request lock and continue exactly once after every activated branch arrives, including an empty activation. A rejection cancels siblings, assignments, timers and tokens and records the rejected fork. Returning only consumes the source branch token; return sessions are unique per branch. Native Data API keeps strict optimistic record revisions; a stale form edit is retained for explicit refresh and reconfirmation, never silently merged.

Step verification keeps execution/claim/handler/schema and entry mapping checks. A newer fact revision in an active branch may apply the verified output only if remapping E inputs gives the original digest. Otherwise retain the verified result as `result_stale_inputs`, freeze continuation and show the changed input reason. Pure recomputation uses a new visit/key. Reconciled effects are never rerun; the existing administrator recovery owner may audit and apply the stored result or terminate. Late verified receipts from a rejected branch are retained without continuation.

Adoption requires the same fork/join and every activated unarrived branch plus its active nodes in the same body. Arrived branches may disappear. Pending or stale-result steps defer adoption. Return/resume proof cannot cross a join.

## Security, bounds and rollback

All rows keep tenant/app/environment scope; directory, assignment, role and field checks remain with existing owners. No alternate form store, identity store or backend executor is added. The feature is opt-in and V1 does not consume its tables/contracts. One migration adds nullable branch scope plus the fork table and updates the existing SQL authority. Quiesce workflow writers at the schema/runtime cutover. After any fork is active, rollback requires stopping new forks and draining or explicitly terminating affected synthetic requests before running older code. Production deployment and npm publication are outside this task.

## Verification

Reject malformed/nested/overlapping bodies, cross-branch returns, shared writes and sibling fact reads. Concurrent sibling votes both succeed and join once. A stale form revision refuses while input survives refresh. Two receipts with equal remapped inputs apply once each; changed input stores a blocked result without another handler call. Reject/return invalidates only intended positions; late results cannot continue. Adoption preserves active membership and E. Existing nonparallel, Save, return, reminder and SQL authority suites must continue to pass, followed by actual laboratory API readback and PC/mobile browser checks.

## Source ownership and UI

Shared contracts own paired topology, branch field/input separation and the pure position predicate. The server kernel and its existing SQL task-data authority own durable fork activation and scoped command/step position. The SDK adds grouped fork rendering and deterministic semantic edits; the assistant emits the same edits. Canvas drafts and source declarations use the same validators. Entry metadata E is never rewritten by routing adoption R.

Recovery preserves verified outputs. Pure recomputation creates a new visit and key; an explicit administration preview/command can apply an already verified reconciled-effect result with changed-input digests and a reason in the existing audit owner. Crossing a fork/join during a return resume proof falls back to replay.

Changes are opt-in to V2 declarations. Existing V1 engine is outside this change. This is source development for the owned laboratory; package publication and production rollout require a later release task.
