# OpenXiangda 2.0 atomic business transaction guards

## Problem evidence

- The standard meeting and visitor actions query for conflicts before opening
  the Native Data transaction. Two concurrent requests can both observe an
  empty result and then both commit.
- Course selection creates the selection in the same transaction as the
  course revision update, but its duplicate check is outside that transaction.
- Application-local locks would only protect one process and would fail after
  scaling, restart or retry. A second business database would duplicate the
  platform's authoritative data owner.

## Capability owner and invariants

The Native Data API remains the only owner of business data, row visibility,
field authorization, idempotency and transaction boundaries. A transaction may
declare bounded `query-empty` guards which the platform evaluates before its
mutations in the same PostgreSQL transaction.

- A guard references one declared resource and ordinary declared filters. It
  cannot contain SQL, table names, relations or executable expressions.
- Guard reads use the same exact environment Head, AppVersion, principal,
  readable-field checks and resource RLS policy as ordinary reads.
- All guard lock keys are scoped by tenant, application and environment,
  sorted, deduplicated and acquired as transaction advisory locks before any
  guard query or mutation.
- A matching visible record rejects the entire request. Empty results permit
  the existing create/update/delete operations to run atomically.
- Business helpers declare semantic lock keys and filters; they never query and
  decide conflicts outside the transaction.

There is no process-local fallback, legacy query-before-write mode or
compatibility alias.

## Affected contracts

`DataTransactionRequest` gains an optional array of 1 to 20 guards. Each guard
contains `kind: query-empty`, a canonical resource code, a bounded semantic
lock key and 1 to 20 ordinary Data API filters. The request digest includes
guards and operations, so an idempotency key cannot be replayed with different
business preconditions.

Meeting reservations lock a room and reject overlapping active reservations.
Visitor reservations lock their canonical duplicate business key and reject an
active duplicate. Course selections lock the course, reject the same
student/course pair, and retain the course revision update as the capacity
compare-and-set.

## Failure, concurrency, resource bounds and rollback

- A failed guard returns HTTP 409 with only the guard index, resource code and
  guard kind. It does not expose SQL or hidden records.
- At most 20 guards, 20 filters per guard, 100 values per `in` filter and 100
  mutations bound request cost and lock duration.
- Sorted advisory-lock acquisition prevents cross-resource lock-order
  deadlocks. PostgreSQL releases every lock at transaction end.
- The database transaction is the rollback boundary for the idempotency claim,
  guard evaluation, mutations, audit events and scope projections.
- Rollback is the paired toolchain/platform commit. OpenXiangda 2.0 has no
  historical compatibility branch.

## Falsifiable verification

1. A matching guard rejects all mutations and reports its exact bounded index.
2. Guard locks are acquired before guard reads and mutations.
3. Guard filters cannot read undeclared or forbidden fields.
4. Reusing an idempotency key with changed guards is rejected.
5. Meeting and visitor standard helpers perform no pre-transaction query.
6. Course selection submits its duplicate guard, course CAS update and new
   selection in one transaction request.
