# Mobile directory, cascade and reference fields

## Evidence and owner

The standard mobile form still opens a desktop directory Drawer containing a
two-column Tree, and uses the desktop Cascader. Its reference picker uses a
handwritten input/overlay, loses unconfirmed selections when a search replaces
results, and allows an older pagination response to overwrite a newer query.

The 2.0 field kit owns these interactions. Existing directory and field-source
APIs own identity, eligibility, paging, environment and authorization. Existing
directory/cascade/reference snapshots and codecs own submitted values. The form
remains the sole owner of committed field values; popup selections are temporary.

## Decision and affected contracts

- Reuse a scoped Ant Design Mobile trigger, Popup, SearchBar and selection panel.
  Single and multiple choices are staged until Confirm; Close discards changes.
  Show removable selected labels separately from the current result page.
- Directory browsing uses breadcrumb navigation and paged department/member
  lists. Department selection and entering its children are distinct actions.
  Disabled directories may be browsed, but cannot be selected. Search retains
  the existing two-character lower bound and current API pagination bounds.
- Cascades use hierarchical touch rows and complete-path snapshots. Multiple
  paths survive navigation/search; no new cascade value format or storage field.
- Reference search, paging and retry are isolated to the current popup/query.
  Retain snapshots of staged selections independently of current search results.
  No ID fallback labels, native data-entry inputs or desktop Select in these
  mobile interactions. Explicit mobile surface selection takes precedence over
  viewport inference for the directory picker.
- Keep desktop controls and public source/data contracts. No new persistence,
  theme settings, global CSS reset, endpoint or permission rule.

## Failure, concurrency and resource bounds

Closing/unmounting or changing keyword, department or source bindings invalidates
pending reads. Only the matching request may change items, cursor, error or busy
state. Failed reads preserve staged selections and expose a deliberate retry.
Search and paging never fetch all remote results. Duplicate page requests are
suppressed; entering a new query resets its result list and cursor. Server
eligibility remains authoritative at submission; UI disabled rows do not replace
server validation. Staged selections reset on reopening, not on unrelated render.

## Blast radius, rollback and verification

Only the 2.0 frontend package, fixture acceptance, documentation and Changeset
change. 1.x, other tenants, backend schema and production are untouched. Rollback
uses the previous frontend package/build with no stored-data conversion.

Verify real browser clicks at phone width and explicit mobile mode at desktop
width: browse, backtrack, search, pagination, disabled items, clear/remove,
discard/confirm, reopening, canonical submit/reload, retry and out-of-order
responses. Check popup/body scrolling, no horizontal overflow and unchanged host
styles. Run affected checks and a freshly packed independent application. Record
mocked browser evidence separately from remote authenticated acceptance.

## Acceptance fixture corrections

The submit/reload browser journey exposed unwrapped JSON in the field-protocol
fixture's diagnostic output (742 px on a 390 px viewport). Wrapping that output
restores 390 px without changing the component layout or weakening the overflow
assertion. Full regression also exposed a pre-existing selector ambiguity while
two desktop dropdowns coexist during a closing animation. The test now follows
the active combobox's `aria-controls` list; actual filter/query assertions remain
unchanged. These corrections affect acceptance fixtures only.

## Local verification, 2026-09-05

- Affected gate: 16/16 tasks passed, including the 139 runtime/SDK regressions.
- Seven freshly packed candidates installed into an independent application
  pass checks, unit tests, build, deterministic artifacts and tamper rejection.
- Browser acceptance: 45 passed, 6 skipped (3 require the live Data API bridge;
  3 do not apply to the empty generated template). Four new journeys verify
  member/department browsing and paging, disabled ancestors, search retention,
  close/confirm, retry, stale pagination responses, canonical snapshots,
  submit/reload and cascade paths. Mobile mode also stays mobile at 1200 px.
- Phone screenshots at 390×844 were visually inspected for all four selection
  sheets. Existing desktop, list query, draft and workflow journeys pass.
- Documentation build passes. Changed desktop selector files pass Ant Design
  lint; SurfaceFields retains two pre-existing Alert message deprecation warnings
  outside this change's edited branches.

This is local source/candidate verification using controlled API responses.
No registry publication, deployment or remote authenticated acceptance occurred.
