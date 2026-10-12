# Workflow source synchronisation and deployment guard

Status: approved design, implementation and verification in progress for the owned development laboratory. The activation-owner and preparation-boundary amendments were confirmed in the original Claude session on 2026-10-12. No production deployment or package publication is authorised by this record.

## Evidence and ownership

Canvas publications currently advance workflow heads independently of application source. Application preparation registers immutable workflow versions; activation runs in the later deployment transaction. The current activation declaration references definition/binding versions and owns no additional version number. Source config remains the single declaration owner; import changes only its workflow declaration and a source-base lock. The workflow management authority owns export/plan/sync, the configuration preparation owner owns registration, and the existing deployment transaction owns target activation.

## Stable contract

Export canonical definition/binding documents without rewriting them, so legitimate fixed-user references and digests stay intact. Never export runtime records, tasks, visits, tokens, resolved credentials, internal environment ids or publication populations. Export live named-person overrides as counts only; role references, handling modes and operation labels/switches may be copied by explicit request. Import verifies all digests and released page/step/binding contracts before any file write; code-owned drift refuses the import. Handling defaults are optional; named people never become source defaults.

A read-only registration plan returns existing equal-digest version numbers or the next integers, including inert prepared versions. Seal only definition/binding numbers, canonical activation references and source-base digests. Import writes sourceBase in the authoritative activation declaration; the separate lock retains origin observations for audit and status only. An environment head observation is diagnostic/deployment state and never enters package bytes. Registration reuses equal number/digest pairs, refuses number conflicts, digest/number conflicts and gaps, and shares sequence locks with canvas publication.

## Failure and concurrency

Before preparation writes, compare the actual target head digests with the sealed declaration, imported base and the target's active application declaration; preserve a canvas head for a release with no workflow change. Verify the head's page/step/binding references against the candidate catalog. Persist the read head revision in the deployment job; activation rechecks it with CAS. Concurrent canvas publication refuses activation with a publication readback, preserving all active heads and the active AppVersion. Immutable versions already registered during preparation remain inert and consume their numbers; identical packages reuse them. Inert versions are excluded from canvas restore/history and are visible as a count in source status.

Sync is an explicit, audited target-environment change with expected target workflow head revision. It reuses app-wide source versions, checks target catalog and identities, and defaults to updating running and new requests through the existing publication/adoption owner. Target handling roles must resolve; named-person management overrides are reported for target configuration. Source environment remains untouched.

## Bounds, security and rollback

All management reads/writes use existing app design authority and tenant/environment owners. Keep 200-node / 8-branch and bounded-document limits. Source import validates paths, refuses symlinks or ambiguous config rewrite locations, checks the original source digest before replacing it, and preserves unrelated config/code. No arbitrary code execution from bundles, alternate data/identity store or forced deployment path is introduced. V1 APIs and applications do not consume these additive contracts. Roll back source import with Git; restore target runtime through the existing explicit publication/activation owner, preserving request ids and E snapshots. Do not delete or renumber immutable prepared versions.

## Falsifiable verification

Canonical export/import/compile preserves origin digests, ids and typed conditions. Missing code contracts refuse import without writes. Read-only plan changes no database/audit row and includes inert versions. Unchanged workflow deployment preserves a canvas head; imported source deploys to a different environment by digest rather than foreign revision. Registration and head races fail without active-state changes; unrelated preparation failure leaves only inert versions reusable by identical bytes. Sync refuses stale target heads, verifies role/fixed-user references and preserves named-person boundaries. Default adoption preserves task-entry E while changing routing R. Record source/build, real SQL concurrency, browser and real-role business evidence separately.
