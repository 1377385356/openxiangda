# Audited legacy Workflow checkpoint administration

The platform owns durable prepare/apply/receipt, canonical Native subject reads,
current role resolution, task creation and scoped origin invariants. The source
application owns its legacy field mapping and evidence. The shared CLI/MCP admin
operations catalog exposes bounded explicit-environment inputs and fixed routes;
no arbitrary HTTP bridge or applicant impersonation is introduced.

Preparation binds the original subject UUID/revision, source snapshot and record
digests, original initiator/round, approved path facts, current node and publication
configuration. Apply re-authorizes administration and creates only the current
manual task transactionally. Legacy approvals are source facts, not V2 votes.
Missing subjects use Native's existing idempotent import first. Expired/changed
plans fail; uncertain apply queries/retries the original receipt. Unknown source
identity remains held. This is an additive administration protocol, not ordinary
launch, runtime OAuth delegation, or a second Workflow engine.

Acceptance covers bounded catalog parsing and transport; platform acceptance
separately covers PostgreSQL concurrency, rollback, source/path/subject identity,
original-round preservation, revocation, publication and configuration changes.
