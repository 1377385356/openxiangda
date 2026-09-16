# Native event actor provenance

## Evidence And Owner

A real preproduction named action committed a cancellation at Native revision 4.
Its result projector delivery returned HTTP 400 before business processing. The
pinned 2.20.3 contracts reject exactly `/actor/initiatedBy` and
`/actor/businessAction` as additional properties; the same data with the basic
actor validates. Workflow-originated approval, whose actor has only the basic
fields, succeeds. The Native producer already records these audit facts and
also records sealed-repair provenance. Shared event contracts own this wire
shape; the application cannot replace a platform-owned Schema.

## Invariants And Contract

Extend `EventActor` and its Native event JSON Schema with optional, explicitly
bounded `initiatedBy`, `businessAction` and `platformMaintenance` matching the
existing producer. Preserve the basic actor, event type and schema version.
Provenance is audit information, never authorization or a reusable credential.
Only application actors may carry it. No unbounded additional properties,
recursive identity, arbitrary headers, bearer tokens or client secrets are
accepted. Existing signing, environment, manifest and receipt checks are unchanged.

The scope is V2 shared contracts and signed Nest receiver regression coverage;
no platform runtime, SQL, customer model, inbox or identity store changes. V1
is isolated. Other V2 applications receive the same additive correction when
they update the root package; existing simple events remain valid.

## Failure, Concurrency And Bounds

Reject malformed provenance before claiming a receipt or executing a handler.
The 64 KiB event body, existing field/projection limits and finite metadata
strings remain authoritative. No extra IO or fan-out. At-least-once processing
and original transaction/event keys remain unchanged. Recover the original
dead-letter delivery through the formal replay API only after the new SDK is
deployed; do not re-submit cancellation or rewrite historical events. Preserve
failed delivery and original business status for audit.

## Rollback And Verification

Before npm publication this is independently reversible source. After immutable
publication, publish a later correction; application rollback does not undo
business writes or notifications and restores the old receiver limitation.
Focused tests must exercise the signed receiver with basic, named-action,
event-action and sealed-repair actors, duplicate delivery, invalid nested fields,
oversized values, wrong principal, secret-shaped additions and bad signatures.
Run `verify:affected`, reviewed Changesets, deterministic `release:version/plan`,
`verify:release` and `release:publish`. Update the root gitlink on authoritative
master. The real application must deploy the published root dependency and
replay the same failed delivery: applicant/manager cancellation notices must
appear once with original venue/date/time, while approval history is immutable.
