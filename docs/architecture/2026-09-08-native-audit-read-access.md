# Native audit read access

Status: implementation decision for the full-development acceptance audit.

## Evidence and ownership

A user authorized only for a busy-time projection receives the original actor ID
through Native record `created_by` and `updated_by`. Business field policies are
applied, but the API unconditionally includes every public system column. The
record audit endpoint also exposes actor and correlation facts. Hiding these in
application UI cannot enforce the confirmed privacy boundary.

The existing Native Data API, field policies and row authorization remain the
sole owners. Add optional model/resource `audit: { read: false | string[] }`.
Strings are existing application capability requirements, with the same
conjunction and role-membership rules as business fields. Omission preserves
existing applications. The compiler projects one audit rule to read-only policies
for `created_by`, `updated_by`, `created_at`, `updated_at`; these columns are not
redeclared as business fields. `id` and `revision` remain protocol fields.

## Invariants and affected contracts

- Normal record/query/export/aggregate and explicit select/filter/order use the
  same readable-field set. An unauthorized audit column is omitted by default
  and refused when explicitly requested. No inference through sorting/filtering.
- Current-user role union never combines one membership's field grant with
  another membership's row scope. System audit fields participate in the
  existing membership restriction and PostgreSQL row-policy evaluation.
- Reading record audit history requires a membership authorized for all audit
  metadata as well as the specific historical row. Explicit denial returns 403
  before reading event history. Workflow subject access remains separately owned
  by Workflow; its audit adapter also enforces the explicit metadata restriction.
- Trusted application principals and existing application super-admin authority
  keep their existing scope semantics. This setting restricts user read access,
  not stored provenance or the append-only audit log.
- Standard detail UI shows its history entry only when the returned record
  contains all four authorized metadata fields; server authorization is decisive.
- A dedicated additive platform capability is required only by declarations using
  audit policies, so an older platform fails before accepting the application.
  Shared validators accept only read policies for these four system columns;
  policies on `id`/`revision`, write/mask policies and malformed grants are rejected.

## Failure, resources and rollback

No new identity store, database columns, migration, event mutation, background
job or query is introduced. Work is bounded by the existing fields/memberships
and the audit endpoint's existing 500-fact scan. Invalid declarations fail
locally and at platform compilation; authorization denial has no side effects.
V1 is untouched. V2 applications omitting the rule retain behavior.

Before application adoption the code is independently reversible. After a
restricted application is active, rolling the backend back to an implementation
that ignores system policies is unsafe: retain the compatible complete platform
combination, or explicitly revoke the application's user access before rollback.
Do not silently remove the application privacy declaration to make a rollback pass.

## Falsifiable verification

Check model/direct-resource compilation, shared validation and required capability
round trips; reject invalid policy keys, protected protocol columns and writes.
Exercise plain/user-union/default/explicit/aggregate/export reads, same-membership
row restriction, audit and workflow audit denial, trusted application and admin
behavior. Confirm metadata remains in storage while unauthorized responses exclude
it. Real application acceptance must query busy-time records as the unrelated
employee, probe forbidden filters/order/export/history, then read as an authorized
manager. Browser detail history must agree with the response on PC and mobile.
