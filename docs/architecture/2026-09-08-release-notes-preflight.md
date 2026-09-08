# Release Notes Before Version Writes

Status: accepted for implementation.

The 2.3.0 and 2.4.1 release:version attempts changed manifests and deleted reviewed
Changesets before discovering invalid release notes. The latter also rejected a
pure bug-fix release because newFeatures was empty although the renderer supports
empty sections. No package publication occurred, but manual recovery was needed.

Changesets remains the sole version planner. Before running changeset version,
obtain its read-only status plan in a temporary directory, validate reviewed notes
for the planned root version (or unchanged root when only other packages change),
and remove the temporary directory. Do not choose or increment versions in this
wrapper. Preserve existing mainline, bootstrap-coupling and publication gates.

newFeatures and fixes remain arrays of nonblank strings, but either can be empty
when the other contains a substantive entry. Other mandatory sections remain
nonempty. Render an empty category as the existing explicit none text. Notes
validation is read-only and must precede any manifest or Changeset mutation.

There is no new state store, receipt, registry write or runtime contract. The
existing serial maintainer/mainline boundary applies. Planning failures and invalid
notes leave source files unchanged. Filesystem/package-manager failures during
the later existing version operation are still errors requiring review; this
change does not claim atomicity of all Changesets writes. Reverting the release
scripts is independent from package/runtime rollback and does not affect V1 apps.

Verify missing/malformed/unreviewed notes and empty release categories, valid
patch-only notes, prerelease behavior, planner-selected next version and unchanged
files on preflight failure. Replay the actual pending Changeset plan afterward.
