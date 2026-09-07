# Superseded prepublication receipt reconciliation v2

Status: accepted for implementation on 2026-08-21.

## Problem evidence

A `validated` receipt for an older source commit can remain in the shared Git
directory after a later release publishes one unchanged package version from a
new receipt. The old receipt has not entered any publication phase, but the
existing discard path requires every old candidate version to remain
unpublished. It therefore blocks a new `verify:release` even when the registry
artifact is byte-for-byte identical to the frozen old candidate.

## Owner and invariants

The release receipt state machine remains the sole owner. A superseded
`planned` or `validated` receipt may be discarded only before its own
publication begins. For each old candidate, an absent registry version is safe;
an existing version is safe only when its registry integrity exactly equals the
receipt artifact integrity. A mismatched or unreadable integrity fails closed.
Dist-tags are not restored from a superseded prepublication receipt because it
never owned a registry write and newer releases may legitimately have advanced
them.

No package version, tarball, dist-tag, Git tag, reference application, or npm
credential is changed during reconciliation. The old artifact directory and
receipt are removed only after every candidate passes the check; a failure
leaves both intact. The next release then creates a new receipt bound to the
current authoritative `master` and current reference evidence.

## Rollback and falsifiable verification

This is independently reversible by reverting the release-tool commit. Tests
must prove that unpublished candidates pass, published candidates pass only
with equal integrity, and missing or unequal integrity fails. A real stale
receipt with one equal published candidate must be discarded before any npm
write, after which `verify:release` must build a fresh current-head receipt.

