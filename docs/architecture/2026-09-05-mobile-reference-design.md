# Mobile field kit: confirmed reference interaction

## Evidence and authority

The user rejected the current boxed inputs and spacious attachment action cards
and supplied 14 mobile reference screenshots on 2026-09-05. These references
supersede the previous mobile visual draft, including the uncommitted file UI.
The user explicitly requests reuse of suitable 1.x frontend implementations.

Read-only sources inspected in tools/openxiangda/packages/sdk/src/components/fields:
shared/MobileField.tsx and shared/MobileDatePicker.tsx; SelectFieldMobile,
DateFieldMobile, CascadeDateFieldMobile, ImageFieldMobile and SubFormFieldMobile.
Reuse their presentation and date-picker algorithms while adapting to 2.0's
controlled values, scoped Ant Design Mobile imports and current data clients.
Do not import 1.x FormContext, APIs, file deletion, storage or permission models.

## Owner and affected contracts

The 2.0 field kit owns the mobile presentation across standard and custom forms.
The frame itself supplies row spacing, typography and separators; appearance
must not depend on an optional page wrapper. The page groups rows in white
surfaces on the default mobile background. No theme settings or global resets.

- Text and numbers use borderless input; radio/checkbox are inline choices.
- Selects use searchable bottom sheets, staged selection, cancel/confirm, and
  multiple-selection count. Cascade/address use breadcrumb drilldown.
- Dates use month calendar plus time wheels. Date-time ranges stage start then
  end, allow returning to the previous step, and validate the existing boundary.
- Images use thumbnail tiles and a plus tile; files use compact icon/name/actions
  rows. Retain in-flight upload removal, retry and current managed file contracts.
- Mobile subtable rows are collapsible inline editors; field permissions and
  child-resource persistence retain their current owners.
- Location uses the available capture provider and a readable result. Signatures
  use the existing canvas/upload/hash with a mobile sheet and image preview.
- Mobile rich text edits plain text; untouched values keep their original HTML.
  Editing produces escaped paragraph HTML through the existing rich-text codec.

The reference includes a five-star rating. Add `rating` as an integer widget in
the shared Surface schema, compiler and server's existing `WIDGETS_BY_TYPE`
validator. Its stored value remains `number.integer`; no new data type or table.
The server currently rejects this widget, so the compiler-only change would be
incomplete. Align that one allowlist and verify integer acceptance, rejection on
text, and the existing numeric bounds. Publish the server contract before an
application begins declaring rating; older combinations fail explicitly.

Inline child forms retain their own field values and validators. A scoped
registration connects their `validateFields` calls to the parent subtable rule,
including collapsed rows. No validation flags enter business data. Existing
transaction generation still owns revisions, atomicity and child permissions.

## Failure, concurrency, bounds and rollback

Popup draft state is discarded on cancel; formal field values remain in the
parent form. Reuse existing stale-read guards, upload task invalidation, file
limits, child row bounds and permission checks. No fallback identity or endpoint.
Keep incomplete and failed input visible and prevent duplicate submissions.
No backend migration or production write is involved. Stable 1.x stays read-only.
Rollback is the preceding 2.0 package source; no stored-value conversion.

## Falsifiable verification

Create a grouped mobile component fixture corresponding to the user's examples,
not the protocol diagnostic grid. Exercise actual inputs and popup actions,
selection cancel/confirm, date/time steps, multi-image retention and preview,
file retry/removal, location, signature and plain-text rich-text roundtrip.
Check phone screenshots, 390px overflow, host style isolation, desktop regression,
affected gates and a fresh independent tarball application. Record source
verification separately from publication/deployment/real-role acceptance.

## Verification completed on 2026-09-05

- `pnpm verify:affected`: 28/28 tasks passed, including runtime/SDK 139/139,
  devkit 198/198 and the CLI lifecycle black box with controlled platform responses.
- `OPENXIANGDA_KEEP_PACK_SMOKE=1 node scripts/verify-packed-distribution.mjs`:
  seven candidate tarballs installed into a fresh independent application;
  checks, tests, build, deterministic Native package and tamper rejection passed.
  Browser acceptance: 51 passed, six skipped (three require a live database
  bridge; three do not apply to the empty application template).
- The new 390×844 reference fixture covers actual rating values, staged single
  and multiple selection, calendar/time/range cancellation, address drilldown,
  location, cascade, uploaded signature PNG, plain-text rich-text roundtrip and
  inline child validation with create/update/delete revision handling. Separate
  file tests cover upload retry, pending removal, late completion, limits,
  image preview and failed-download retry. Existing PC/mobile acceptance passed.
- Final packed-application screenshots were inspected for the grouped form,
  choices, date/time, address, files, inline subtable and signature states.
  The shared standard mobile form was checked as well as the reference fixture.
- Server data-presentation and field-contract regression: two suites, 16 tests
  passed. Scoped ESLint and `npm run build` passed. The server change only adds
  integer rating to the existing widget allowlist. An exact-key test fixture
  was aligned with the already implemented `hidden` and `fieldOrder` contract;
  no additional server runtime contract changed.
- `pnpm docs:build:from-build` passed. Template inventory and Vite prewarming
  include the new reference fixture; component source checks were updated for
  the actual mobile popup owner after removing the former desktop drawers.

These results use controlled backend responses and local candidate packages.
They do not establish registry publication, deployment, real-account remote
acceptance or live database transaction acceptance. No package was published,
no environment was deployed and no production data was written in this round.
