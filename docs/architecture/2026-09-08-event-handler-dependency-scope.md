# Event Handler Dependency Scope

Status: accepted for implementation.

The real meeting application discovers an event handler whose notification
dependency is REQUEST-scoped, but the current registry caches wrapper.instance.
Nest has only allocated a prototype at that point; the constructor never ran and
delivery fails with TypeError. An independent signed-receiver reproduction proves
the failure and per-delivery resolution through Nest proves the proposed boundary.

The SDK registry owns discovery and dependency construction. The existing receiver
continues to own signature/schema/app/environment validation, receipt claim,
verified event ALS identity and completion/release. Notification sendFromEvent
continues to consume that ALS and application credentials. User send continues to
require an authenticated Named Action. No new identity, receipt or retry owner is
introduced.

Store the provider token with its owning module-local ModuleRef. Resolve strictly
inside that module after receiver validation and successful receipt claim, with a
fresh ContextId and a frozen empty REQUEST. Do not fabricate request.openxiangda,
user, tenant, roles, authorization or environment. Nest retains static singleton
instances; request/transient trees are scoped to the accepted attempt. Do not
cache instances or contexts by event ID. Validate initialized handle methods
without eagerly constructing scoped handlers, including class field methods.

Invalid, busy and duplicate events must not construct handlers. Resolution and
handler failures remain within the receiver's existing receipt release path;
retry receives a new scope with the same event-derived idempotency key. Contexts
have no new long-lived store and follow Nest/GC lifecycle. Existing body/schema,
100-handler manifest and platform admission bounds apply. V1 and deployment
schemas are unaffected. An independent SDK rollback restores the known failure
for scoped consumers without requiring a data migration.

Verification uses real Nest DI and the unchanged HMAC receiver: singleton reuse,
request/transient initialization, concurrent ALS isolation, duplicate provider
tokens across modules, invalid/busy/duplicate no-construction, resolution failure
release, retry body/key stability and user/event identity refusal. Actual platform
notification persistence and delivery remain separate application acceptance.
