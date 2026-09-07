# Platform-owned CRUD shell experience v2

Status: accepted for the OpenXiangda 2.0 pre-release line.

## Evidence and problem

- The generated Shell renders internal role codes and invents `当前用户 / 平台用户` when the runtime authorization contract omits a subject profile.
- The sidebar makes the Ant Design `Menu` itself the scroll container, so a route render may reset its internal scroll position.
- Form and detail renderers iterate `surface.fields`. Canonical JSON sorts object keys, so declaration order is lost even when the application declared related fields together.
- The standard form displays permission implementation commentary to end users.
- The list requires users to choose one search field, and expands every secondary filter inline. This makes the search intent unclear and lets the filter area grow beyond two rows.

## Capability ownership

- The platform runtime authorization response owns the current user's profile and human-readable application role summaries.
- `openxiangda/react` owns the Shell, account popover, sidebar lifecycle, CRUD surfaces, filter interaction and avatar editor UI.
- `openxiangda-contracts` and the compiler own deterministic form/detail field order. Applications declare fields once; renderers never recover order from object keys.
- The platform server owns current-user-only avatar storage and persistence. An application cannot update another user's profile.

## Stable invariants

1. Published applications use the logged-in user's application-role union and never create, select or transmit a RoleSession.
2. The account trigger never substitutes generic product copy for missing identity data. It renders the authoritative profile or an explicit unavailable state.
3. Role codes remain machine identifiers. End-user UI renders role names only.
4. Form and detail order is an explicit compiled array and is stable across canonical JSON serialization.
5. Sidebar scroll belongs to a persistent wrapper and survives client-side route changes.
6. The desktop filter surface has at most two rows: one primary action row and one applied-condition row. Secondary fields live in a centered modal with an isolated draft until Apply.
7. One keyword searches the union of all readable declared searchable fields. Undeclared fields never enter a query.
8. Permission enforcement remains in the platform API. Removing explanatory copy does not remove field, row or capability checks.

## Failure and concurrency behaviour

- Profile/role load failure keeps authorization fail-closed and shows an explicit profile-unavailable fallback; it does not invent identity.
- Avatar completion verifies the uploaded object, current tenant and current user before the compare-and-update. Replacing an avatar is last-write-wins for the same user; the previous platform-owned object is deleted only after the new URL is persisted.
- Closing the filter modal discards its draft. Apply atomically replaces the additional filter set and starts at page one.
- Removing an applied chip updates both draft and active query in one event. Stale route state is ignored for fields absent from the next resource.
- Scroll restoration is scheduled after navigation and scoped to the mounted Shell; reloads do not promise cross-session restoration.

## Security and resource bounds

- Avatar input is an image only, at most 5 MiB, with a generated tenant/user-scoped object name. Completion rejects missing, oversized or non-image objects.
- The browser receives a masked account identifier. It does not receive phone, email or internal membership identifiers.
- Keyword OR width is bounded by the compiler's searchable-field list; filter width is bounded by declared filter fields.
- Directory queries retain their existing pagination and tenant bounds and require a valid current-user role union.

## Rollback boundary

- Contracts/compiler/React changes ship as one independently versioned OpenXiangda alpha.
- Platform identity, directory and avatar changes ship as one platform-server commit and image.
- Rolling back either unit restores the previous pre-release behaviour; OpenXiangda 1.x packages and applications are untouched.

## Falsifiable verification

- Contract tests prove serialized surfaces retain declaration order explicitly.
- Query tests prove one keyword emits OR predicates over all declared searchable fields.
- Browser tests prove no role code or permission commentary is visible, a large modal owns additional filters, cancelling does not apply it, and the sidebar scroll offset survives navigation.
- Platform tests prove directory reads accept the current-user union without RoleSession and reject unassigned users.
- Platform tests prove the current authorization response includes a subject profile and role names, and avatar completion cannot update a different user.
- A packed independent application must pass build and browser acceptance before publication.
