# Root and CLI template version coupling

## Evidence

The unpublished root 2.9.1 query fix passed build and reference acceptance, but
release:plan rejected openxiangda-cli 2.2.13 because its packed application
template now pins root 2.9.1 instead of the published 2.9.0. No npm write occurred.
The existing Changeset gate enforces CLI-to-root coupling only.

## Decision and invariants

The release version planner owns package selection. The CLI owns its packaged
template and seals workspace dependencies to exact root versions. Therefore a
root Changeset must include a CLI Changeset, symmetrically with the existing
CLI-to-root requirement. Reject missing coupling before version materialization;
do not silently select packages, replace published bytes, or pin an old template.

The corrective reviewed Changeset bumps root and CLI together. The prior 2.9.1
candidate remains unpublished; its query fix is included in the next candidate.
No application runtime, identity, authorization, environment or data changes.
V1 remains isolated in its own package. Other tenants and production are unaffected
until normal package adoption and immutable deployment.

## Failure, concurrency, bounds and rollback

This check reads the finite pending Changeset set and fails before mutation.
Existing mainline, process locks, receipt and registry immutability guards remain
authoritative. Reverting the additive planner check restores the previous
behavior; published versions are never overwritten or rolled back in place.

## Falsifiable verification

- A root-only Changeset fails with ROOT_TEMPLATE_CLI_CHANGESET_REQUIRED.
- CLI-only continues to fail; coupled Changesets, including separate files, pass.
- Unrelated package Changesets remain unaffected by this direct coupling check.
- The corrected candidate passes release:plan and formal verify:release, followed
  by publication of the exact receipt bytes and independent application adoption.
