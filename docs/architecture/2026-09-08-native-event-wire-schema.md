# Native event receiver schema alignment

Evidence: current native CRUD emits data event bodies with resource, revision,
projection, actor and cause. Immutable capture identity is stored by the platform
event ledger, not in the event data object. The receiver still requires the
retired capturePlanRevision field and rejects the current user_union actor.
Signed delivery consequently fails before the application handler can execute.

The platform owns event identity and authorization. The contracts package owns
the SDK wire validator. Remove the retired required data property and admit the
platform's user_union actor in the event schema and type. The HMAC, environment,
handler binding, strict data schema, receipt and idempotent side effect boundaries
remain enforced. No permissions or V1 behavior changes. Invalid actors and extra
undeclared fields still fail before handler dispatch. Reverting the SDK recreates
the rejection but cannot undo already completed application side effects.

Verification: signed native user_union payload without capturePlanRevision is
accepted once, duplicates remain suppressed, invalid signed actor is rejected,
and existing signature/receipt tests pass. Release through reviewed Changesets
and the existing deterministic package validation/publish workflow.
