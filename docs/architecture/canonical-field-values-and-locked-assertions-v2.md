# Canonical Field Values And Locked Assertions V2

Status: Accepted on 2026-08-23.

## Evidence and problem

The first deployed `record-assert` course-capacity regression could query a
course whose status was `open`, but the transaction guard reported
`OPENXIANGDA_COURSE_NOT_OPEN`. The guard issued `SELECT ... FOR UPDATE` under a
read-only RLS context. A PostgreSQL row lock participates in the write-policy
boundary, so an otherwise readable row was hidden from the guard. Separately,
direct TypeORM mutation responses returned PostgreSQL `numeric` values as
strings while PostgREST query responses returned numbers. One Native Data
contract therefore had two runtime value representations.

## Owners and invariants

- The active resource schema is the sole owner of field value types at every
  Native Data response and assertion boundary.
- `integer` and `decimal` fields are JSON numbers in query, get, mutation,
  audit and transaction-derived records. Invalid stored numeric values fail
  closed instead of leaking a transport-specific string.
- A `record-assert` is a precondition for exactly one mutation of the same
  resource and record in the same transaction. It is not a general-purpose
  compatibility query.
- The row is locked under that mutation's exact operation, record and writable
  field context. The same locked row is independently checked against the
  caller's read authorization before any assertion is evaluated.
- Assertions use the declared field types and one bounded evaluator. A failed
  assertion, an invisible row and a missing row return the guard's declared
  domain error without exposing record contents.
- Idempotency lookup binds the submitted idempotency key exactly; no principal
  identifier may occupy its SQL parameter.

## Contracts and failure behavior

Every `record-assert` must match exactly one `update`, `delete` or `increment`
operation by `resourceCode` and `id`. Zero or multiple matches are rejected as
an invalid transaction before opening the transaction. `increment` remains
restricted to a declared integer field and still requires a matching
`record-assert`.

Value assertions support only the bounded public filter operators and apply
type-aware equality, ordering, membership, SQL-like string patterns and JSON
containment/overlap. Field-to-field assertions require compatible declared
types. Invalid operator/type combinations are contract errors, not false
business predicates.

The guard first acquires the row lock through the mutation RLS context, then
calls the authoritative read authorization function with the locked row. A
permission failure is indistinguishable from the configured guard failure to
the caller. The enclosing database transaction and advisory business lock are
unchanged, so a failure rolls back the idempotency claim, locks and mutations.

## Security and resource bounds

No SQL, table name or cast is supplied by application code. Resources and
fields remain declared identifiers; guards remain limited to 20 and assertions
to 20 per guard. JSON containment is recursive only across already-bounded
request and row values. The evaluator never returns the locked row.

## Rollback and falsifiable verification

Rollback is one platform commit and the previous immutable backend release;
there is no schema migration and no data rewrite.

- a readable and writable `open` course passes the locked status assertion;
- the same course increments `enrolledCount` and creates one selection in one
  transaction;
- replay of the same key returns the stored result after capacity is full;
- another student receives `OPENXIANGDA_CAPACITY_EXCEEDED` and no increment;
- a closed course receives `OPENXIANGDA_COURSE_NOT_OPEN`;
- an unpaired or ambiguous `record-assert` is rejected before mutation;
- TypeORM create/update results and PostgREST queries both return numeric JSON
  values for integer and decimal fields;
- audit `before`, `record` and `changes` use the same canonical values.
