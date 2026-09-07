# Authenticated user role ownership

Date: 2026-08-31

## Problem evidence

Application v2 currently treats an authenticated user with no materialized
application role membership as `unassigned`. The React runtime stops before
route rendering, and the platform Data API, business-action gateway, Workflow,
directory and todo services all require the same membership-backed user union.
Removing a route capability or inventing a browser-side role therefore cannot
make a general employee portal usable and would split authorization ownership.

Some applications intentionally require explicit administrator assignment,
while employee portals need every active, logged-in platform user to receive a
bounded application role. A platform-global fallback would open the former
class of applications and is not acceptable.

## Contract and capability owner

The application may declare one optional `authz.authenticatedUserRoleCode`.
The value references one package role in the same immutable configuration.
Absence preserves the existing authenticated-unassigned behavior. The platform
remains the only owner of login identity, role membership, authorization union,
data RLS, Workflow identity and application environment state.

This changes the compiler-owned configuration meaning, so the compiler
contract becomes `native-4`. Older active application Heads remain readable,
but a new deployment must use a toolchain and platform that agree on the
`native-4` tuple. The v3 application source and configuration-bundle schema
names do not change.

The authenticated-user role cannot also be owned by a declared
`roleMembershipSource`. The former is an application-entry audience and the
latter is a business-fact projection; assigning both owners to the same role
would create conflicting role facts.

## Runtime decision

After verifying the platform login session and resolving the active
application/environment Head, the platform checks whether the declared role is
already effective for the current user. If not, one bounded PostgreSQL
statement idempotently inserts a real package role membership with the reserved
source `openxiangda.authenticated-user`, then increments the user's role-subject
set version. The authorization resolver rereads the version stamp before it
caches or returns the union, so the first request returns `active` and never
exposes an intermediate 403.

A membership of the same role from another owner already satisfies the
declaration and is not rewritten. A conflicting active-but-ineffective row
fails closed with a stable platform error instead of returning a fabricated
principal. Platform-owned authenticated-user memberships cannot be edited or
revoked through manual authorization management.

When an application changes or removes the declaration, activation revokes
only active memberships with the reserved source whose role no longer matches,
revokes relationship grants bound to those membership IDs, and increments the
affected subject versions in the same authorization-state transaction. Manual
memberships, projected business memberships, super-admin grants and completed
Workflow history are not rewritten.

## Failure, concurrency and bounds

The declaration is optional and contains one bounded stable role code. The
first-access write is unique by environment, user and role, uses conflict-safe
insertion and does not scan the tenant directory. Concurrent first requests
converge on one active row. A database or authorization dependency failure is a
retryable platform error; no browser fallback role is created.

The role grants only its declared capabilities and remains subject to field
policies and RLS. It is not anonymous access, application super-admin, a role
selector or a second identity path.

## Security and blast radius

Only Application v2 deployments that explicitly declare the field change
behavior. Stable 1.x applications, anonymous public access and Application v2
deployments without the declaration retain their current behavior. The
platform does not hard-code a role name such as `applicant` or `member`.

## Rollback boundary

Rollback first removes the declaration from affected application versions,
which revokes the platform-owned automatic memberships during activation.
The platform image and toolchain can then return to the preceding immutable
release. No business data migration or manual-role rewrite is required.

## Falsifiable verification

- contract and compiler tests accept one existing package role, reject a
  missing role and reject duplicate projection ownership;
- a logged-in user with no prior membership receives the role and capabilities
  on the first authorization request;
- repeated and concurrent requests create no duplicate membership;
- existing manual or projected memberships are unioned and never overwritten;
- changing/removing the declaration revokes only reserved-source rows and
  invalidates affected cached unions;
- an undeclared application still returns authenticated-unassigned;
- Native Data/RLS and Workflow initiation accept the materialized role while
  denied capabilities and rows remain denied;
- the compatibility corpus and published package smoke tests use `native-4`.
