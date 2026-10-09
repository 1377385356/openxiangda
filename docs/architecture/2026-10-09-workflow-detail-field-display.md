# Conditional workflow detail display

## Evidence and owner

A completed finance migration sample returned 76 readable, empty budget fields
that do not apply to its project type. Submission and task pages already share
the application's conditional field rules, but the standard workflow detail
renderer displays every projected field. Both PC and mobile consequently show
empty budget sections. Private school data remains in the application lab.

The application owns these presentation conditions. The platform owns readable
field projection, business records, workflow versions and authorization. The SDK
owns grouping and rendering the existing projected detail. No task page is
guessed by name, and no current definition is substituted for a pinned instance.

## Decision and invariants

Add an optional `workflowDetails` map to `OpenXiangdaApplication` and its workflow
provider. Each workflow may supply a synchronous `fieldVisibility` callback with
the projected record, field/resource code and actual definition/binding versions.
Returning false hides only an empty field; nonempty values (including 0 and false)
and nonempty subtables remain visible. Missing callbacks, indeterminate results
and callback errors preserve the field. Empty sections disappear naturally.

Only fields already selected by the server detail surface are considered. This
extension cannot fetch a hidden field, grant access, mutate business state or
change a task. Application conditions must use their existing rule source and
retain fields when required controlling facts are absent from the projection.
Apps can limit the callback to the versions for which their rule is known.

## Bounds, failure and rollback

The detail contract already limits fields and rows to 200 and the envelope to
2 MiB. This adds at most one synchronous callback per empty displayed field,
with no requests, storage, global preference or background work. Each render
uses the current server projection; no asynchronous race or cached identity is
introduced. Exceptions fall back to showing readable fields.

Omitting the optional map restores existing behavior. Removing the application
callback is independently reversible. V1 is untouched; existing V2 applications
without the extension retain the same output. No npm publication or production
deployment is part of this development window.

## Falsifiable verification

Verify false conditions remove empty fields and entire empty groups; readable
historical text, 0, false, reference objects and subtables remain visible; missing
or throwing callbacks preserve fields; callbacks never add unprojected fields.
Use the existing completed finance sample in ordinary-user PC and 390×844 mobile
detail views, confirm amount/history remain accessible, and restore the original
administrator. Keep source-link checks distinct from frozen-package validation.

## Observed validation

`pnpm verify:affected` passed all 12 tasks (6 cached), including 492 SDK tests.
The original applicant's 1440×1000 PC and 390×844 mobile detail views omitted the
nonapplicable empty budget section, preserved 50,000 and its uppercase amount,
opened the original history tab and had no horizontal overflow. The administrator
was restored and temporary metrics were cleared. This was read-only source-link
verification; no new application, workflow path or frozen-package pass was claimed.
