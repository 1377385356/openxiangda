# Standard Authorization Projection v2

## Decision status

Accepted for the OpenXiangda 2.0 pre-release contract. This decision adds no
OpenXiangda 1.x compatibility and no application-specific behavior.

## Problem evidence and owner

The Native authorization kernel already evaluates package roles through
`app_role_memberships_v2` and resource relationships through
`app_resource_relationship_grants_v2`. Application authors can only maintain
those facts imperatively today. A declared business membership resource can
therefore drift from the authorization facts, deleting or disabling a source
row has no standard revocation behavior, and a failed projection cannot be
rebuilt through the SDK.

The immutable application configuration owns the mapping. The platform Native
authorization kernel remains the sole owner and reader of effective role
membership and relationship-grant facts. Native Data Resources own only the
business source rows.

## Public contract

`authz.roleMembershipSources` maps a declared Native resource to package role
memberships. Each source declares a stable code, user semantic field path,
package role, optional enabled and validity fields, and a failure mode.

`authz.relationshipGrantSources` maps a declared Native resource to canonical
RelationshipGrant facts. Each source declares a user or role-membership
subject, relation code, target resource, resource-id semantic field path,
bounded constant operations, optional enabled and validity fields, and strict
failure behavior.

The compiler rejects unknown keys and validates every referenced source and
target resource, field, role, subject kind and operation. Source codes are
unique across both arrays. There are no expressions, callbacks, SQL fragments,
current-user substitutions or environment identifiers in the package.

The application SDK exposes read-only projection health plus explicit rebuild
and dead-letter recovery commands. Those commands require the existing Native
authorization management capability at the server; they do not mint a user,
role session or application principal.

## Stable invariants

- Canonical authorization reads continue to use only
  `app_role_memberships_v2` and
  `app_resource_relationship_grants_v2`.
- Projection state, job and receipt records are recovery metadata, never an
  authorization source or fallback.
- Projected facts carry a deterministic `openxiangda.projection.<sourceCode>`
  owner. A projector never adopts or revokes a manual fact or another source's
  fact. An ownership collision fails closed.
- One source generation describes the complete desired fact set. A missing,
  disabled, expired or deleted source row revokes only that source's facts.
- Removing a declaration creates an empty retirement generation. Readiness is
  false until both current sources and retirements converge.
- The same generation, rebuild request or recovery request is idempotent.

## Concurrency, failure and recovery

Native Data API mutations advance the affected source generation and create a
unique projection job in the same PostgreSQL transaction as the business row.
The queue is only a wake-up path. Workers claim jobs with a lease and
`FOR UPDATE SKIP LOCKED`, materialize one complete desired set transactionally,
advance authorization versions only when facts changed, and write an immutable
receipt. A stale generation cannot replace a newer one.

Lease expiry, retry wait, bounded dead-letter replay, explicit environment
rebuild and periodic PostgreSQL recovery scans make broker or worker loss
recoverable. Source scans, declarations, operations, values, attempts and lease
duration are bounded. Projection failure always closes authorization readiness;
there is no last-known-good mode for facts that can grant access.

## Rollback boundary

Stop the projector, remove the declarations in a later immutable revision, and
wait for retirement generations to revoke projector-owned facts before rolling
back the compiler or SDK. Business rows, immutable configuration revisions,
manual facts and revoked fact history remain intact. Projection recovery
metadata may then be dropped by a later migration; published migrations are
never edited.

## Falsifiable acceptance

- compiler and schema tests accept both mappings and reject unknown resources,
  fields, roles, subject kinds, duplicate source codes, unknown keys and
  unbounded operations;
- one generation applied twice produces one canonical fact set and one
  immutable receipt;
- update, disable and delete revoke only projector-owned facts;
- a manual ownership collision changes no authorization row;
- an idempotent rebuild advances every current source generation, only explicit
  recovery replays a dead letter, and an expired lease is reclaimable;
- SDK tests prove the health, rebuild and recovery requests and response
  contracts without a user-token or impersonation parameter.
