# Unified record detail and standard entry

## Decision, 2026-09-06

The approved desktop drawer, standalone and mobile designs are now required in
the runtime. Actual generated detail omitted the record heading and footer;
Workflow rendered another card layout; mobile Workflow submission did not use
the ordinary form frame. Desktop child rows required a separate modal.

The browser package owns one `RecordDetailFrame` and one grouped field renderer.
Ordinary records and Workflow aggregates provide authorized data to this frame.
Drawer, standalone, task, instance, record, todo and message entrances all use
these components. Workflow adds the current-node banner and application,
approval-history and Native change-history tabs. Existing custom detail routes
remain explicit server-owned navigation, never an inferred fallback.

Native Data API retains ordinary data, field/row permissions, files, change
history, revision checks and parent/child transactions. Workflow retains its
instance, participants, outcome, command Surface and idempotent command
lifecycle. The frame does not manufacture metadata, permissions or approvals.
Editing stays the full ordinary form in the current page/drawer without an
application dialog or reason. Saving does not rewrite approval facts.

Both Workflow and ordinary submission use `ResourceFormContent`; Workflow
continues to own preparation, requirements, retries and atomic commit. Desktop
child rows use the same field codec and validation registry as mobile inline
rows. Parent submit validates all rows; editing a cell never saves immediately.
Only selected, permitted fields are sent, with the existing transaction bounds.
Compact upload keeps the same upload/preview/download lifecycle and limits.

Loads discard superseded responses. A failing detail or history load offers
retry and never substitutes an unscoped Native read. File links retain their
authorized record or Workflow binding. No additional storage or identity path
is introduced. This only changes optional 2.0 runtime components; 1.x and other
tenants' data remain untouched. Reverting the browser package reverses the
presentation change independently of immutable records and command history.

Change history describes historical values rather than a retained file archive.
Files and signatures show metadata; rich text shows its text without hydrating
old embedded images. History never broadens access through a Native file read.

Verification: actual drawer and standalone screenshots must have the same
heading, gray background, white grouped cards and sticky footer; Workflow must
have three tabs and the server's current operations from every entrance.
Check 320/390px mobile entry for matching controls and no horizontal overflow.
Submit invalid/valid inline child rows, reload persisted rows, edit and delete
with original CAS revisions. Exercise compact image/file upload and inspect
that editing adds only Native history while approval history remains stable.

Application center query/action extensions have their own server architecture
decision and tests; their transport does not create a second detail renderer.

The fresh-package release gate on 2026-09-06 found one semantic-list test still
asserting the former input-form section class in read-only detail. Its snapshot
already contained both declared detail groups. The same release now verifies
the shared detail frame, two detail cards and their ordered group headings;
semantic value assertions remain intact. This corrects acceptance coverage for
this decision without changing runtime behavior or its rollback boundary.
