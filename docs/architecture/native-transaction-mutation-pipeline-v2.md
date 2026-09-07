# Native Transaction Mutation Pipeline V2

## Problem evidence

A freshly generated visitor application could create a reservation through the
standard single-record Data API, but the same principal, resource, and fields
were rejected by PostgreSQL RLS when the application used the atomic
transaction API. The transaction implementation authorized the base operation
and constructed mutation claims, but did not derive the operation-and-field
restricted membership union or run the canonical before/after mutation
authorization used by ordinary CRUD.

This was not an application permission problem. It was a split platform write
pipeline whose two entrypoints produced different database claims.

## Capability owner

The Native Data API service owns one mutation authorization pipeline for both
single-record CRUD and atomic transaction operations. PostgreSQL RLS remains
the final enforcement boundary. Application backends only declare the desired
guards and mutations; they cannot construct or weaken authorization claims.

## Stable invariants

1. A mutation has identical authorization semantics whether invoked as a
   single-record request or as one item in an atomic transaction.
2. Every membership-union mutation is narrowed to memberships that jointly
   grant the operation and every requested field before database claims are
   created.
3. Every mutation evaluates the canonical before/after authorization contract
   before its SQL statement. PostgreSQL RLS independently enforces the same
   contract.
4. Transaction guards use read-restricted membership claims; transaction
   mutations use mutation-restricted membership claims. Neither may reuse an
   unrestricted principal context.
5. OpenXiangda 2.0 has no fallback transaction path and no compatibility mode
   for the former incomplete claims.

## Affected contracts

- `OpenXiangdaNativeDataApiV2Service.transaction`
- Native transaction create, update, and delete operations
- Connected-development `developer` principals
- Deployed interactive `user_union` principals
- `openxiangda-nest` standard atomic operation helpers

The public request and result schemas do not change. This is a correction of
the authorization semantics already promised by those schemas.

## Failure and concurrency behavior

Operation-and-field authorization is compiled before the operation SQL runs.
An unauthorized item aborts the database transaction, so no prior item, event,
file binding, idempotency receipt, or scope projection survives. Advisory locks
and optimistic revisions keep their existing ordering and atomicity.

## Security and resource bounds

Membership narrowing can only remove memberships from the authenticated
principal. It never synthesizes capabilities. The transaction limits remain
20 guards and 100 operations, and field evaluation is bounded by each declared
resource schema.

## Rollback boundary

The transaction authorization correction and its regression tests form one
platform-server release unit. Rollback is the previous platform-server image;
there is no persisted data migration and no compatibility switch.

## Falsifiable verification

- A developer or user-union principal that can create through standard CRUD can
  create the same record through a one-item transaction.
- Transaction claims contain the exact operation and requested field codes.
- A role that lacks any requested field is rejected before SQL mutation.
- Update and delete transaction items evaluate the same before/after contract
  as their single-record counterparts.
- A real visitor reservation succeeds through connected development, replaying
  the idempotency key returns the prior result, and a duplicate guard rejects a
  second reservation without partial writes.
