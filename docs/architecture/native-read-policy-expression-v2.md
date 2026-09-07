# Native resource read-policy expressions

## Problem evidence

The Native authorization projection can materialize identity-derived row rules
and, with the composite-policy prerequisite, exact string constants. Its
policy-level `matchMode` is flat. It therefore cannot express the common portal
rule below without moving a security condition into a browser filter or an
application-specific API:

```text
status = PUBLISHED
AND publishAt <= database current time
AND (expireAt IS NULL OR expireAt > database current time)
```

Browser filters are only presentation input and are not an authorization
boundary. Application wall clocks are also not an authoritative operand for
row visibility.

## Capability owner and stable invariants

The authored Native authorization projection remains the declaration owner.
The platform compiler and immutable authorization revision remain the
materialization owner. PostgreSQL RLS through
`app_private.native_data_policy_allows` remains the only row-decision owner for
Native Data API reads.

- A policy keeps the existing flat `matchMode` plus `rules` as its base row
  boundary. An optional bounded `readExpression` is ANDed with that base only
  for reads. It never replaces or weakens create/update/delete scope checks.
- The expression language contains only `allOf`, `anyOf`, and existing policy
  rule leaves. It adds no client-provided SQL and no `not` operator.
- A policy with `readExpression` cannot declare `operations`; its base rules
  continue to govern all operations. If a resource intentionally has no row
  restriction for writes, it must declare `matchMode: 'AND'`, `rules: []`, and
  `writeBoundary: 'capability_only'` explicitly. Omitting that marker fails.
- Existing `current_user`, dimension, relationship, and exact string-constant
  leaves are reused. New leaves are `{ field, operator: 'is_null' }` and
  `{ field, operator: 'lt'|'lte'|'gt'|'gte', operand: 'db_now' }`.
- `db_now` is accepted only for declared `datetime` fields. PostgreSQL
  `statement_timestamp()` supplies one stable instant for the complete SQL
  statement. Native datetime writes already require an RFC 3339 `Z` or numeric
  offset and normalize to UTC; RLS independently rejects timezone-less or
  malformed values before comparing absolute instants. Browser, application,
  and database session timezones cannot change the decision.
- Missing, SQL-null, and JSON-null field values satisfy `is_null`; they never
  satisfy `is_not_null`, negative constants, or time comparisons.

## Materialized contract

The compiler preserves the canonical base policy and `readExpression` in the
authorization projection. The authorization materializer keeps base rules with
no `clauseIndex` and converts only `readExpression` to bounded conjunctive
normal form: every clause must match and any applicable rule in a clause may
match. Each read-expression occurrence receives a `clauseIndex`; existing flat
`AND` and `OR` rows keep their representation and semantics.

This is an additive pre-release 2.0 contract. It does not change 1.x packages,
business records, Workflow state, or the generated-page lifecycle. The Nest
Data SDK continues to send only business query filters; it does not receive an
API for overriding policy expressions or database time.

## Failure, concurrency, and security behavior

Unknown keys, ambiguous leaf sources, unsupported operators, non-`datetime`
`db_now` fields, `operations` mixed with `readExpression`, an implicit empty
write boundary, and invalid role/dimension/relation references fail compilation
before activation.
The database independently rejects malformed source/operand/clause rows.

Authorization revisions and environment Heads retain their immutable CAS
boundary. A time predicate is dynamic at query execution, but revision digests
remain stable because `db_now` is an operand marker rather than a compiled
timestamp. Retries of the same read may legitimately observe a later database
instant.

## Resource bounds and rollback

Expression depth is limited to 5, each group to 20 children, source leaves to
50, and normalized CNF to 50 clauses and 100 materialized rule occurrences.
Expansion beyond either bound fails before persistence. Constant sets retain
the prerequisite limit of 100 unique strings of at most 2,048 characters.

Rollback stops Native Data traffic, rejects activation of revisions using
`readExpression`, `is_null`, or `db_now`, restores the preceding RLS function
and constraints, and may leave additive nullable columns in place. No
application row migration or replay is required.

## Falsifiable verification

- A read policy for the formula above allows published rows at or after their
  publication instant, allows no-expiry rows, and excludes draft, future, and
  expired rows in PostgreSQL RLS even when a caller omits or forges filters.
- Adjacent instants use the declared inclusive/exclusive operators exactly.
- Null/missing datetime values fail closed except at an explicit `is_null`
  leaf.
- Existing flat `AND`/`OR`, current-user, dimension, relationship, constant,
  unrestricted-role, and connected-development authorization tests still pass.
- A scoped editor remains unable to create or update a row outside the base
  dimension/relation boundary after `readExpression` is added.
- Over-depth, over-expansion, mixed-form, wrong-field-type, and request-side
  policy override cases are rejected.
