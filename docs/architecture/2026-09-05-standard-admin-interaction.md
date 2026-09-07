# Standard admin interaction based on the 1.x visual reference

Status: implementation authorized by the user on 2026-09-05.

## Evidence and capability owner

The user selected the established 1.x single-toolbar list, collapsible sidebar,
drawer entry, filter dialog and column settings as the visual baseline. The new
2.0 mockups added unnecessary default business views. Current 2.0 source also
adds route-history tabs, multiple list toolbars, audit columns by default, a large
edit hero and three-column form cards. Form submission can reject without a
handled UI error, and a query refresh can rehydrate an in-progress edit.

Read-only inspection of 1.x DataManagementList and StandardFormPage shows that
their data/form lifecycle depends on legacy APIs and schema. Reuse the interaction
pattern in the 2.0 React runtime; do not import that implementation or its APIs.
The existing Shell owns navigation; the existing Data API and field codecs own
business persistence, authorization and values. Ant Design owns overlay lifecycle.

## Decision and affected contracts

This unit delivers the standard PC list-to-form interaction: one toolbar with
search, on-demand filters/settings, explicit business columns, grouped entry in
a drawer, and the same form on its existing full-page route. Keep lists mounted
while their drawer is active so filtering, pagination and selection are retained.
The drawer form owns its values, pending state, cancellation and error feedback.
Remove the extra route-history UI/state and duplicate form page heading. Sidebar
groups remain real expandable menu nodes and reveal the active page on navigation.
Use React Router's ranked matching for the current page title too; a static
`/new` page must not be mislabeled by an earlier `/:id` registry entry.

Use existing surface field order, section metadata and permissions. A small
ungrouped form has no artificial section card. Grouped forms use lightweight
section headings, at most two ordinary columns and full-width complex fields.
No new schema, route family, theme, draft persistence store or server endpoint is
introduced. Direct page URLs and mobile renderers remain valid. Separate reusable
form lifecycle code from the generated list/detail module as part of this change.

The new model/CRUD authoring API currently omits section metadata. Add optional
`crud[].sections` (title and selected field codes), shared by that CRUD's standard
form/detail presentation, and compile it into the existing `field.section`.
Storage models remain free of layout facts. Existing explicit field selections
remain exhaustive and ordered; grouping never adds fields or grants access.
This is an authoring addition only, with no server or wire-schema change.

Nested AND/OR filter authoring and expanded ordered/frozen-column persistence
will be a subsequent query/settings contract unit; this unit preserves current
supported filter semantics and persisted list preferences without inventing a
second query language. Workflow, notifications, server aggregation and complex
mobile controls retain their separate roadmap units.

## Invariants, failure and concurrency

- Models never imply pages; navigation and actions remain explicitly authorized.
- Selected readable business fields define the default columns. Audit fields are
  optional settings. System/hidden fields never become editable through grouping.
- Initialize each edit from one complete record snapshot. Background refetches
  do not overwrite entered values or silently replace its expected revision.
- Catch validation/submission/transaction errors, preserve values and allow a
  deliberate retry. Prevent duplicate submissions and closing during submission.
  Dirty cancellation and switching to a full page require a discard decision.
- Successful drawer writes refresh the original list and close the form. Read
  failures are distinct from not-found; failed writes never show success.
- Field codecs, row/field authorization, subtable atomic transactions, expected
  revisions and existing transaction/import/export bounds remain authoritative.

## Blast radius and rollback

Changes are limited to the 2.0 React package, the authoring projection, their
tests, guidance and a Changeset.
No database migration, 1.x modification, remote data write, registry publication
or production deployment is part of this unit. Rollback is the previous package
and application build, with no stored-data conversion.

## Falsifiable verification

- Browser: collapsed group can reopen, a deep page selects its parent and there
  is no extra route-history/title band.
- Browser: one toolbar; filters/settings open only on demand; business columns
  are default and audit columns can be selected explicitly.
- Browser: create/edit drawer preserves list state; grouped platform fields
  serialize correctly; failed save retains input and retry succeeds; duplicate
  submission is suppressed; cancel warns only for dirty data.
- Browser: direct edit route and mobile form still load/save; refreshing an
  edited record does not overwrite the draft or change the revision used to save.
- Run TypeScript, relevant runtime tests, affected gates and freshly packed
  application browser acceptance. Distinguish fixture verification from remote
  authenticated acceptance, publication and deployment.

## Local verification, 2026-09-05

- `pnpm verify:affected`: 24/24 tasks passed, including 138 runtime/SDK tests,
  197 devkit tests and the template checks. The model tests compile section
  declarations while proving unchanged storage, permissions and selected fields.
- Ant Design lint: no issues in the five changed/new component files.
- Seven candidate packages were packed and installed into a fresh independent
  application. CLI check, application checks/tests/build, deterministic package
  generation and tamper rejection passed.
- Fresh application browser acceptance: 38 passed, 6 skipped. Three skips require
  a configured real Data API bridge; three require resource declarations absent
  from the empty template. The five new standard-admin scenarios all passed.
- New browser scenarios cover menu collapse, optional audit columns, grouped
  drawer create, required validation, failed-save preservation, duplicate-click
  suppression, unchanged list query/page, pristine/dirty cancellation, full-page
  create/edit and accurate titles, read retry, revision conflicts after reconnect
  and mobile input/save without horizontal overflow.
- Skill distribution consistency and documentation build passed. Screenshots
  were visually inspected; this caught the static/dynamic title mismatch that
  API and submission tests alone did not cover.

This is source and local candidate verification only. No registry package was
published, no remote platform was deployed, and real-role business acceptance
has not been claimed.


## Follow-up

The confirmed interaction extension supersedes earlier Cancel / full-page-switch
choices in this record: use Save draft / Submit and Full screen / New page /
Close. See `2026-09-05-list-query-and-preferences.md` and the platform server
`docs/architecture/2026-09-05-authenticated-form-drafts-v2.md` for ownership,
concurrency, partial values and atomic submit behavior.

Follow-up local evidence: affected checks 16/16 and runtime tests 139/139 pass.
Seven freshly packed candidates installed into an independent application pass
check, test, build, deterministic artifact and tamper-rejection verification.
Browser acceptance passes 41 tests; 3 live Data API cases have no bridge configured
and 3 cases do not apply to the empty template. The eight standard-interface
journeys also pass at 1440×1000 desktop and 390×844 mobile preview sizes. Mobile
drafts are additionally exercised without `crypto.randomUUID`, including settled
bottom-sheet positions, recovery and one-time submission. Skill-reference
validation and documentation build pass.

These browser runs use controlled platform responses; the new server service is
separately covered by 74 service/controller regressions. Live PostgreSQL migration
execution and remote authenticated business acceptance remain release steps.
