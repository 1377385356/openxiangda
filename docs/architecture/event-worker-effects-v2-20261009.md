# Event worker effects (PLT-040)

Status: implementation candidate; not released or enabled. Writing locations are the independent worker-effect-v2 worktrees. Canonical platform release and school timer remain unchanged.

## Evidence and owner
Native event actions only map data-record events to fixed mutations. Managed commands require a real current initiator. Ordinary application OAuth cannot mutate action-owned resources. The platform event subsystem owns authority; application business code computes a bounded plan and never chooses an actor, database role, Head, lease, or capability proof.

## Contract and invariants
A new immutable `execution.kind=worker-effect` subscription grants explicit Native resources, readable/writable field codes, create/update operations, application event types, and bounded query/effect/guard limits. Compiler and platform use one shared validator and resource digests. No deletes, increments, arbitrary SQL, workflow-owned writes, generated field assignment, or caller-supplied identities/proofs. Existing native-data and webhook behavior remains unchanged.

The Nest facade obtains the existing event receipt claim token internally after successful event-envelope verification. HMAC binds action, tenant/application/environment/subscription/event/delivery, receipt token, intent key and canonical request digest. Platform rechecks the exact durable delivery and immutable subscription, current processing receipt and unexpired claim, subscription/runtime Head and resource digests. Environment/Head fencing precedes delivery, receipt and effect locks. A reclaimed, expired, paused or wrong-scope worker cannot read or write.

`prepare` freezes original operations and guards under an application+environment+subscription+intent key. `commit` references the frozen intent and digest and atomically commits the Native transaction, audit/event outbox and effect receipt. `resolve` recovers the original intent and durable outcome; unknown HTTP results are never retried under a new key. Explicit replays and later timer deliveries share the original intent identity. Prepare and resolve do not prove mutation success. Guard rejection rolls back all business/outbox writes; successful intent never writes twice.

Queries require explicit select, bounded offset/limit and filters/order only over declared readable fields. They return exact authorized Native values including UUID/revision; business plans must guard all snapshots or sets they relied on. Effects require expected revisions for every update, allow only safe Native data guards, and cannot smuggle actor authority, workflow commands or reservation operations. Event payload schema and causation limits remain platform validated.

## Failure, limits and rollback
Defaults/hard maxima: 8 effect operations, 24 guards, 500 returned records/query, 100 frozen intents/event, 64 KiB command/plan. One event receipt token is the lease fence, maintained by the existing platform receipt store; no new scheduler/identity store. Prepared intents retain original Head/resource/plan digests; changed Head cannot reinterpret them. Resolve can return durable success after completion, but never creates fresh authority. SQL migration is additive; pause and drain worker subscriptions before rollback. No existing application receives grants implicitly.

## Falsifiable verification
Reject missing/expired/reclaimed tokens, wrong delivery/scope, paused subscription, changed Head/resources, undeclared fields/filter/order/event types, generated/workflow-owned fields, excess limits, forged operation/guard keys. Demonstrate prepare immutability, commit+receipt atomicity, response loss then original resolve, same-event concurrent commit, replay/cross-event stable-intent deduplication, rollback after mid-plan failure, outbox once, and ordinary CRUD still denying action-owned mutations. Shared compiler, schemas, Nest facade and platform must pass focused tests before release; real PG integration and SDK release-train evidence are required before enabling timers.
