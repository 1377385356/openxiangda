# Delegated role management SDK v2

## Decision

Custom OpenXiangda 2.0 pages may manage the current application's role
memberships through `openxiangda/core`. The SDK is a current-user, same-origin
client for the platform-owned Native authorization management API; applications
must not create a role table, permission table, proxy credential or NestJS
impersonation endpoint.

The platform attaches a role-management grant to a business role. It limits
that role to all application roles or named target role codes and to explicit
membership/delegation actions. Effective authority is the union of the current
user's active application roles. Application and platform super administrators
are unrestricted.

Delegation is monotonic: a business manager needs `management.delegate` for the
recipient role and every target role, and can pass on only target roles and
actions already present in its own effective authority. Requests cannot select
an actor or active role.

## Public contract

`openxiangda-contracts/browser` owns role-management grant, authority,
membership-maintainability and mutation-receipt types and schemas.
`openxiangda/core` exposes catalog, membership, management-directory,
role-management-grant and receipt operations. Every mutation takes a UUID
`operationId`, a human-readable `reason`, and `expectedRevision` when changing
or revoking an existing row.

## Failure and lifecycle

The platform rechecks the current user on every request. Unauthorized target
roles fail with 403, stale revisions and changed idempotency payloads fail with
409, and platform-owned projected memberships are read-only. Page code must
reload after 409 and must not infer success from hidden buttons.

The feature is additive to OpenXiangda 2.0 and does not affect 1.x. A rollback
can stop exposing the new endpoints and SDK functions while leaving additive
grant/audit rows inert.

## Verification

Package tests cover exports, exact URLs/bodies, schemas and errors. Platform
acceptance proves a super administrator can delegate a selected role, a
business manager cannot exceed that ceiling, and a second delegated business
role can operate only inside the passed-on subset.
