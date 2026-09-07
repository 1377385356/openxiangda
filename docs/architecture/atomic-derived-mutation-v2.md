# Atomic Derived Mutation V2

## Problem evidence

A fresh course application completed the first enrollment, but replaying the
same idempotency key returned `OPENXIANGDA_CAPACITY_EXCEEDED`. The standard
Nest operation read the course, checked status and capacity, calculated an
absolute enrolled count, and only then submitted the platform transaction.
After the first success that pre-read observed different mutable state, so an
identical business command no longer produced an identical transaction body
and could be rejected before the platform idempotency receipt was consulted.

This is not a course-page defect. It is a missing platform primitive for a
bounded, derived mutation whose preconditions and numeric update must share the
same lock, authorization decision, database transaction, and idempotency
receipt.

## Capability owner

The Native Data API transaction kernel is the sole owner of atomic business
preconditions and derived numeric mutations. Application backends declare
record assertions, duplicate-query assertions, stable domain error codes, and
bounded increments. They do not pre-read mutable business state or calculate
an absolute replacement value.

## Stable invariants

1. A transaction request is a stable command. Replaying the same idempotency
   key with the same request body returns the recorded result before any guard
   or mutation is evaluated.
2. Every `increment` operation is paired with at least one `record-assert`
   guard for the same resource and record. The guard locks that row before the
   increment executes.
3. Record assertions may compare a declared field with a bounded literal or
   compare two declared fields. They never accept SQL, table names, functions,
   expressions, or unbounded operators.
4. Guard fields require ordinary read permission. Increment fields require
   ordinary update and field-write permission. Canonical before/after row
   authorization and PostgreSQL RLS remain mandatory.
5. Guard failures return the exact declared `OPENXIANGDA_*` domain code. The
   platform does not expose arbitrary error text and applications cannot choose
   non-platform error namespaces.
6. OpenXiangda 2.0 replaces the old guard shape. There is no compatibility
   parser, implicit default error code, pre-read fallback, or optimistic-CAS
   emulation for derived mutations.

## Affected contracts

- `DataTransactionGuard` becomes a discriminated union of `query-empty` and
  `record-assert`, both with a required bounded `errorCode`.
- `DataTransactionOperation` adds `increment` with one declared integer field
  and a bounded non-zero integer amount.
- `DataTransactionResult.items[].operation` includes `increment`.
- Native Data API transaction validation, authorization, locking, execution,
  event/audit emission, and result serialization.
- The standard visitor, meeting, and course Nest operations.

## Failure and concurrency behavior

The platform first claims or replays the idempotency receipt, then acquires
sorted advisory locks. `record-assert` additionally reads its exact row with
`FOR UPDATE`. Any missing row or failed assertion aborts with its declared
domain code. `increment` updates the locked row, advances revision once, emits
one normal update event containing the numeric before/after value, and aborts
the whole transaction if authorization or RLS rejects it.

Concurrent enrollment commands for one course serialize on the same business
lock and row lock. At most the declared capacity can succeed. A duplicate
student command fails before any count is changed. A failed transaction leaves
no data mutation, audit event, projection job, or successful receipt.

## Security and resource bounds

- At most 20 guards, 20 assertions per record guard, and 100 operations.
- Literal assertions reuse the bounded Data API filter operators.
- Field-to-field assertions allow only `eq`, `neq`, `lt`, `lte`, `gt`, and
  `gte`.
- Increment amounts are safe non-zero integers with absolute value no greater
  than 1,000,000, and targets must be declared `integer` fields.
- Identifiers are resolved only from the active resource declaration and are
  always quoted by the platform.

## Rollback boundary

The contracts package, Nest package, CLI template, platform-server image, and
three acceptance applications form one release unit. Because 2.0 has no
historical applications, rollback means restoring the preceding complete
release unit; no dual parser or compatibility switch is retained.

## Falsifiable verification

- The course standard operation performs no Data API read before transaction.
- First enrollment succeeds and increments the count from 0 to 1.
- Replaying the identical idempotency key returns `replayed: true` even though
  the course is now full.
- The same student with a new key returns
  `OPENXIANGDA_COURSE_ALREADY_SELECTED` without incrementing again.
- A different student on the full course returns
  `OPENXIANGDA_CAPACITY_EXCEEDED` without creating a selection.
- Closed courses return `OPENXIANGDA_COURSE_NOT_OPEN`.
- Missing record guards, undeclared/non-integer increment fields, arbitrary
  error namespaces, and arbitrary SQL-shaped input are rejected by contract
  and platform validation.
- Visitor and meeting duplicate/conflict guards return their declared Chinese
  application domain codes through connected development and deployed runtime.
