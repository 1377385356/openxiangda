# Standard list query and display preferences

## Evidence and owner

The reviewed standard list has a flat filter form, one sorter, a modal mixing
column settings, and selection actions visible with no records selected. The
user requests nested conditions, reorderable frozen columns, independent sort
controls and explicit saving of changed display preferences.

The existing Data API owns query semantics and authorization. The Refine adapter
must forward the entire ordered sorter array; query and export use the same
DataWhere tree. The existing current-account list preference endpoint owns saved
display state. No local storage, new query service or appearance settings.

## Contracts and invariants

- Add optional `where` and `sorts` to GenericResourceQuery; preserve `sort` for
  direct consumers. Generated lists use the ordered array. Keyword and advanced
  conditions compose with AND. Backend field types and current read permissions
  remain authoritative; hidden/internal fields never become choices.
- Version 1 preferences gain optional column `fixed: left` and filters `where`;
  column array order is display order. Preview column edits immediately, persist
  only on explicit Save. Failed saves retain the dirty state; Reset uses the
  existing endpoint. Preferences are per-account UI state, last saved wins.
- Toolbar contributions declare `requiresSelection`; only these contributions
  disappear for empty selection. Built-in batch actions keep the same rule.
- Empty sorts clear user ordering and use backend deterministic pagination.
  Maximum ten sort rules, no duplicate fields. Nested filter UI reserves one
  depth level for keyword composition and obeys the existing 50-predicate bound.

## Failure and bounds

Invalid unfinished conditions are reported before applying. Preference load
failure keeps usable defaults. Removed/unreadable persisted fields are excluded;
an invalid stored condition tree is cleared as a whole, never partly broadened.
Selection clears when query/page/sort changes. No new business mutations.

## Verification and rollback

Verify nested AND/OR requests, false/zero/empty values, multi-sort precedence,
query/export parity, pinning and reordering, save failure/reload/reset, and zero
selection behavior in packed browser tests. Existing CRUD regression remains.
This runtime-only commit is independently reversible; no schema migration,
1.x runtime changes, tenant mutation, registry publication or deployment.
