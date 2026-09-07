# OpenXiangda 2.0 standard batch data contract

## Problem evidence

- The Native transaction endpoint is already atomic and bounded, but the normal
  interactive user principal is rejected because it represents the union of all
  current application memberships.
- Generated resource lists expose no row selection, batch mutation or import
  preview, so applications implement these common behaviors inconsistently.
- The Native transaction result uses a private schema name even though the
  public NestJS contract already declares `openxiangda.data-transaction-result/v2`.

## Capability owner and invariants

The Native Data API owns one canonical transaction contract. Generated admin
surfaces and application backends are clients of that contract; they do not
implement independent batch semantics.

- One request contains 1 to 100 declared `create`, `update` or `delete`
  operations.
- The whole request commits or rolls back atomically.
- Every operation uses the same field, row, scope and revision checks as a
  single-record mutation.
- The current user's application memberships are evaluated as one union
  principal. Each operation must still be allowed by at least one eligible
  membership; capabilities from unrelated memberships cannot be combined to
  bypass one field or row rule.
- An idempotency key belongs to one authenticated principal and one exact
  operation list.

There is no legacy transaction schema or compatibility alias.

## Generated admin behavior

- Row selection enables atomic batch update and delete for at most 100 visible
  records.
- Batch update asks for one writable field and one value. Records already equal
  to that value are omitted so no empty audit revision is produced.
- CSV/XLS/XLSX import maps exact declared field labels or field codes, validates
  every cell, previews errors, and creates at most 100 rows in one transaction.
- File fields are not imported as arbitrary URLs. They continue to use the
  platform managed-file flow.
- Import never submits while any preview error exists. A retry reuses the same
  idempotency key.

## Failure, concurrency, bounds and rollback

- A revision conflict, permission denial, invalid row or database error rolls
  back every operation and returns the failing operation index.
- Concurrent edits are detected by each record's expected revision.
- The 100-operation ceiling bounds lock duration, request size, audit fan-out
  and browser preview cost.
- Rollback is the paired toolchain/platform commit. 2.0 has no historical app
  compatibility branch.

## Falsifiable verification

1. A normal current-user union principal can execute an allowed transaction.
2. A denied field or row rolls back all earlier operations in the request.
3. Replaying the same key and payload returns the stored result; changing the
   payload returns an idempotency conflict.
4. Generated batch delete and update submit revisions for every selected row.
5. A valid 100-row CSV/XLSX preview imports atomically; 101 rows, unknown
   headers, invalid values and file fields are rejected before submission.
