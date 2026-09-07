# Generated resource semantic list values v2

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

Status: accepted for implementation on 2026-08-28.

## Problem evidence

The standard generated desktop list for the union reference app `union-groups` resource puts
`department.multiple` (`构成部门`) in the first visible column. The stored value
is the canonical array of department snapshots, but the cell displays
`[object Object],[object Object]`.

`SurfaceFieldValue` already owns canonical option and reference display. The
generated list bypasses that owner only for the first visible field when it
adds the detail link: the override calls `String(current)` instead of wrapping
the standard semantic renderer. The defect therefore applies to any canonical
object or array value selected as the first column, not only departments.

## Capability owner and stable invariants

- `openxiangda-field-kit` is the only owner of stored semantic-value display.
- `GeneratedResourcePage` owns list navigation, but it may only wrap the field
  renderer with navigation; it must not reinterpret the stored value.
- `option.*`, `user.*`, `department.*`, and `resource-ref.*` values continue to
  use their canonical `{ value, label, ...snapshot }` contracts. No application
  formatter, browser-side re-query, or storage change is introduced.
- User and department reference display is selected by semantic field type,
  not by a particular widget spelling. Widgets own edit interaction; types own
  stored value meaning.
- The same renderer remains shared by list, detail, audit, import preview,
  batch preview, desktop, and mobile surfaces.

## Affected contracts

1. The generated desktop and mobile lists render every field through
   `SurfaceFieldValue`, including the first detail-linked column.
2. The detail link wraps the semantic output and preserves the generated route
   contract; it never supplies a replacement value formatter.
3. `user.single|multiple` and `department.single|multiple` resolve their stored
   snapshots by field type. `resource-ref.single|multiple` keeps the same
   type-owned path.
4. Empty values remain `-`; `false` and `0` remain visible values. Canonical
   multiple values retain declaration order and render their snapshot labels
   without an authoritative directory or resource lookup.

## Failure, security, concurrency, and resource bounds

- Malformed non-canonical values do not trigger a privileged lookup or an
  application fallback. Existing fail-closed unavailable-value output remains
  authoritative for reference renderers.
- Rendering is read-only and introduces no cache, request, state store, lock,
  retry, or mutation path.
- Work per cell is linear in the already bounded stored array. No unbounded
  serialization or JSON expansion is added.
- Field-read, row, resource, and route capability checks are unchanged.

## Rollback boundary

Rollback is the previous independently published `openxiangda` root package.
There is no platform migration, stored-data rewrite, feature switch, or union reference app
application compatibility branch.

## Falsifiable verification

1. A generated standard list with `department.multiple` as its first linked
   column renders two department labels and never `[object Object]`.
2. The same real generated table renders canonical `department.single`,
   `user.multiple`, and `resource-ref.multiple` labels.
3. Clicking the semantic first-column cell still opens the generated detail
   path on both desktop and mobile.
4. Field Kit read-only and audit fixtures contain no `[object Object]` for any
   canonical semantic field value.
5. Table-driven tests cover canonical option arrays plus `false` and `0` so
   falsy business values never collapse to the empty placeholder.
6. Package checks, browser E2E, packed-template verification, independent
   reference application checks, and the complete release gate pass before
   publishing.
