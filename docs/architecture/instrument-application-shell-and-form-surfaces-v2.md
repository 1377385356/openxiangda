# Instrument application shell and form surfaces v2

Status: Accepted and revised by the product owner on 2026-08-21

Scope: `templates/application/apps/web`

## Problem evidence

The CRUD-first instrument template has a working Data API loop, operation-aware
field controls, and authoritative college, department, and user selectors. Its
current `Shell` is only a dark header, create and edit share the same generic
full-page form, and detail is a two-column field dump. The result proves data
contracts but does not provide the stable company application frame or mature
field experiences expected by internal developers.

OpenXiangda 1.x already contains useful presentation behavior for member,
department, attachment, image, desktop, responsive, and read-only states. Those
components are coupled to the 1.x `FormContext`, directory API, RoleSession
transport, and upload adapters, so importing the package or copying the runtime
boundary would restore the history that 2.0 intentionally removed.

The product owner approved the shell and then revised the form-surface split
after reviewing the connected demo:

- retain the existing company white sidebar and white top-navigation language;
- use the instrument resource as the complex-form benchmark, with full-page,
  sectioned create, edit, and detail;
- use the two-field college dictionary as the simple CRUD benchmark, with a
  concise create/edit drawer;
- adapt the mature 1.x member, department, and attachment interaction rather
  than presenting those fields as generic Select dropdowns.

## Decision and capability owners

- The application template owns the browser shell, navigation state, page
  hierarchy, responsive presentation, and form composition.
- React Router remains the only route owner. `/admin/resources/instruments/new`,
  `/admin/resources/instruments/:id`, and `/admin/resources/instruments/:id/edit` are full pages. The college
  dictionary owns its simple create/edit drawer inside `/colleges`.
- Refine remains the query and mutation lifecycle owner. Native Data API remains
  the only CRUD owner.
- The platform current-user contract remains the identity and capability owner.
  The platform directory and scope-value endpoints remain the only member,
  department, and college option owners.
- Data API file endpoints remain the only attachment owner.
- OpenXiangda 1.x is a read-only behavior and test reference. 2.0 may adapt its
  selected-value presentation, search feedback, responsive states, read-only
  rendering, upload progress, preview/download, and validation semantics, but
  imports no 1.x runtime package and adds no compatibility API.
- Adapted reusable field presentation lives under the generated application's
  `components/platform-fields` layer. It is not a seventh public package and
  does not add React dependencies to contracts or the Node-oriented Devkit.

## Stable UI and data invariants

- The shell uses a white, collapsible sidebar, a white top bar, breadcrumbs,
  the current page title, and the verified current user. It never displays raw
  user IDs, role codes, environment internals, or a developer-only Nest probe.
- Production retains the platform-owned persistent warning rendered by the
  runtime boundary.
- Instrument create and edit display every declared non-system field in stable
  full-page sections. Hidden required defaults are explicit application
  defaults, never inferred identity or scope values.
- College create/edit is the concise drawer example. Its two declared fields
  are fully visible and it never substitutes a missing Native resource with
  local fixture data.
- Edit displays all declared fields in stable sections. A field denied by the
  operation-aware capability contract remains visible and read-only, and is
  removed from the mutation payload.
- Detail uses the same section taxonomy and mature read-only renderers. It
  never leaks a field absent from the Data API response.
- A member field opens a bounded desktop dialog with department tree, paged
  member list, search, avatars, and a selected-members panel. A department
  field opens a bounded tree dialog with search, full path, and selected items.
  Mobile presentation uses a full-height popup rather than a small dropdown.
- Selected college, department, and user IDs are resolved independently of
  search pages. There are no fixture labels or raw-ID fallbacks. Directory
  browsing uses real tenant users, departments, and user-department relations.
- Attachment removal is local form state until save. The field uses the 1.x
  interaction language: compact upload button, drag/paste area, typed file
  rows, size/status, preview, download, and remove. Upload still uses Data API
  file plans and never imports FormContext or a legacy storage adapter.
- The college drawer is at most 560 px and becomes full width on narrow screens.
  Full-page instrument forms collapse from three/two columns to one without a
  second mobile application implementation.

## Affected contracts

This browser slice changes only the template and the template bytes embedded in
`openxiangda-cli`. It consumes the separately accepted authoritative selector
platform contract (directory tree/search/resolve and Native scope values) but
does not add another endpoint, data schema, Nest contract, deployment contract,
or public component package. A reviewed CLI patch Changeset records the
template change.

## Failure, concurrency, privacy, and resource bounds

- Identity, directory, scope, record, or file failures remain visible and fail
  closed. The UI never broadens choices or fabricates a label.
- Update keeps the record revision and relies on the existing 409 conflict
  contract; it never silently overwrites a newer record.
- Drawer close and navigation do not submit. An in-flight submit disables the
  corresponding action and duplicate mutations are not started.
- Member search keeps the existing debounce and opaque cursor bounds. Selected
  renderers expose only platform-provided label, description, path, and avatar
  metadata.
- No new public package or second design system is introduced. The application
  source remains within the existing template file/count and production bundle
  budgets.

## Rollback and blast radius

Rollback restores the previous toolchain template commit. Existing generated
applications, 1.x applications, platform data, other tenants, and deployed
immutable AppVersions are unchanged. No data migration or platform rollback is
required.

## Falsifiable verification

1. Source tests prove the shell has the approved menu groups and no raw
   identity/role/Nest developer labels.
2. A direct `/admin/resources/instruments/new` visit renders the complete sectioned instrument
   form as a full page; cancel returns to `/admin/resources/instruments` without a mutation.
3. Browser CRUD creates from the full page, opens full-page detail, opens
   full-page edit, updates with the current revision, and deletes from the list.
4. College create/edit uses a simple drawer and fails honestly when the
   published Head does not contain the `colleges` resource.
5. College update denial remains visible/read-only and absent from the payload;
   instrument-admin protected fields remain read-only.
6. Member and department dialogs cover tree browse, department-member paging,
   global search, selected-ID resolution, empty/error behavior, and zero
   RoleSession requests.
7. Attachment edit and read-only states cover upload success/error, remove,
   preview/download availability, and multiple files without a 1.x transport.
8. Narrow-viewport browser assertions prove the sidebar and college drawer remain
   operable without horizontal page loss.
9. `antd lint`, template check/test/build/E2E, packed fresh-app smoke, and
   `pnpm verify:affected` pass before the source commit is pushed.
