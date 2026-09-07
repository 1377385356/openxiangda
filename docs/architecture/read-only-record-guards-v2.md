# Read-only record guards v2

Status: Accepted for implementation on 2026-08-27.

## Evidence and owner

`record-assert` is intentionally paired with one update/delete/increment so it
can lock under that mutation's exact RLS claims. This makes a legitimate
cross-resource precondition impossible: a transaction cannot require a visible
policy record without also mutating it. Native Data API remains the owner of
bounded preconditions and row visibility.

## Invariants and contracts

- `record-exists` proves that one visible record ID exists.
- `record-match` proves existence plus 1-20 typed assertions.
- Both are read-only and never require a matching mutation. They run under the
  exact read authorization/RLS context and expose neither the row nor which
  assertion failed.
- Their semantic advisory `lockKey` coordinates with all other transaction
  guards. They do not claim a PostgreSQL write row lock or widen read policy.
- Mutation-bound `record-assert` retains its existing one-mutation invariant.

## Failure, bounds and rollback

Missing, invisible or mismatched rows return the declared 409 domain error and
roll back all operations. Guard/assertion limits are unchanged. Rollback removes
the two unpublished kinds from contracts and platform; no data migration or
1.x path changes.

## Falsifiable verification

1. A read-only guard can protect a mutation of a different resource.
2. No same-record mutation is required for `record-exists`/`record-match`.
3. Hidden and missing records are indistinguishable.
4. `record-assert` without exactly one paired mutation still fails.
