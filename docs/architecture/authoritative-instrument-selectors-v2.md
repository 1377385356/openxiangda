# Authoritative instrument selectors v2

Status: Accepted

Platform authority: `sy-lowcode-platform-server` decision ffd11c9,
`docs/architecture/openxiangda-native-authoritative-selectors.md`.

- Problem evidence: the golden template stores presentation fixtures such as
  `user-wang`, `college-am`, and `dept-am-test`. They are not tenant user,
  application college, or organization department IDs, so real row and scope
  authorization cannot close after an otherwise successful CRUD write.
- Owners: platform `users.id` owns user identity; platform `departments.id`
  owns organization departments; an app-owned `colleges` Native Resource owns
  the college catalog and its system record UUID. `collegeId` and the college
  membership grant store that same UUID. Organization departments are never
  inferred to be colleges.
- Configuration contract: a scope dimension may declare
  `valueSource: { kind: 'native_resource', resourceCode, labelField,
  enabledField? }`. This source requires `valueType: 'uuid'`; resource,
  string/text label, and optional boolean enabled fields must exist in the same
  bundle. The compiler preserves this exact canonical object.
- Browser contracts: user and department search use the bounded, cursor-based
  application Directory endpoint and selected IDs use Directory resolve.
  College choices use the membership-bound field scope-values search; selected
  UUIDs use the dedicated scope-values resolve request. Every call carries the
  explicit runtime environment, uses same-origin cookies or Connected Dev, and
  sends no RoleSession header.
- Wire paths: directory search is `GET
  /openxiangda-api/v2/applications/:appCode/directory/users|departments` and
  exact resolution is `POST .../directory/resolve`. College search is `GET
  .../native/data-resources/instruments/fields/collegeId/scope-values`; exact
  UUID resolution is `POST .../scope-values/resolve`. Directory responses use
  `openxiangda.directory-entry-page/v2`; college responses use
  `openxiangda.native-scope-value-page/v2`. Each query has explicit
  `environmentKey`; scope calls also carry dimension `college` and operation
  `create|update`. Resolve bodies deduplicate 1..50 IDs and never treat an ID
  as a keyword.
- Stable UI invariants: selectors persist only returned `id`/`value`, debounce
  search, page with opaque cursors, resolve every selected ID independently of
  the first page, preserve non-selectable resolved labels for existing data,
  show errors, and return an honest empty state without fixture fallback.
  Operation-aware field capability guards remain presentation protection; the
  platform selector and mutation boundaries remain authoritative.
- Failure, privacy, and bounds: search uses 20-item pages; directory resolve
  and scope resolve deduplicate and cap at 50 IDs. A stale cursor, unavailable
  projection, rejected capability, or malformed response is surfaced and does
  not broaden options. Responses expose only the frozen minimal labels and
  paths; browser JavaScript receives no bearer or Dev Session token.
- Concurrency and rollback: each selector ignores superseded asynchronous
  results and keeps selected resolution separate from search pagination. No
  selector result is treated as write authorization. Rollback is the previous
  toolchain/template version plus immutable AppVersion; no platform or catalog
  state is copied.
- Falsifiable verification: contract tests reject invalid source kind/type,
  missing resources, wrong label/enabled field types, unknown keys, and prove
  canonical digest stability. Template tests cover debounce, cursor paging,
  selected-ID resolve, errors, empty results, and zero RoleSession requests.
  Browser tests execute real mocked CRUD for school, college, and instrument
  roles using UUID college, user, and department values.

This slice does not add workflow, infer organizational college semantics, or
reintroduce static identity/organization/scope options.
