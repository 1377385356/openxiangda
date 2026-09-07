# npm tombstoned release recovery, 2026-09-04

Status: recovery evidence sealed before the replacement release.

## Failure evidence

Release receipt `0be6af568f3293940cff6aa41a27ac43675ff187` entered
`publishing-packages`, but the first registry write rejected
`openxiangda@2.0.0-alpha.88` with npm's immutable-version response: the version
had previously been published and therefore could not be published again.

Registry readback returned `E404` for every candidate in that receipt. The
`alpha` and `latest` dist-tags for all seven packages remained exactly at the
receipt's prior values. No candidate Git tag existed. The failed invocation
therefore published none of this receipt's artifacts, but npm had permanently
reserved the root package coordinate independently of the receipt.

## Recovery boundary

The exact receipt and frozen artifact directory are retained together under the
worktree Git metadata as an abandoned-release evidence bundle. They are moved
out of the active receipt paths only after the candidate and dist-tag readbacks
above pass.

Only the burned root package coordinate is advanced through a reviewed
Changeset. The unchanged dependent candidates remain eligible because their
coordinates are still absent. A new authoritative-mainline commit, independent
reference-application lock, artifact manifest, validation receipt, and registry
integrity comparison are required before any retry writes to npm.

This recovery does not remove or overwrite a registry version, dist-tag, Git
tag, source commit, or reference-application commit. If the replacement release
fails validation, it stops before publication and the archived evidence remains
available for inspection.
