# Canonical current-user display name

Date: 2026-09-04  
Status: accepted

## Evidence and owner

Application business actions currently receive `OpenXiangdaCurrentUser.userId`
but no human-readable identity. Applications have consequently persisted the
opaque platform user id as the `label` of `user.*` snapshots. The Platform
Identity service is the only owner of a user's canonical display name; an
application-side directory lookup or UI substitution would create a second
identity path and would not repair newly written data.

## Stable contract and invariants

- Every verified user `NativePrincipal` carries a non-empty `displayName`
  resolved by the platform from the same tenant and user as `userId`.
- The Nest SDK exposes that value as the required
  `OpenXiangdaCurrentUser.displayName`; `userId` remains the stable stored
  value and `displayName` is only its current display snapshot.
- Connected Development obtains the same value from the platform-projected
  `subjectProfile`; browser headers and application payloads cannot supply or
  override it.
- The SDK rejects a missing, blank, or opaque-id-equivalent display name at the
  transport boundary. Business code therefore never needs a UUID/user-id
  fallback and cannot silently persist one as a label.

## Failure, concurrency, security, and bounds

Profile resolution happens while the platform revalidates the live user role
union for an invocation. A missing user profile, cross-tenant row, or invalid
display snapshot fails the invocation closed. The extra lookup is a bounded
single-row read and adds no cache, token claim, application table, or new
authorization path. Concurrent name changes are ordinary display snapshots:
each action records the name resolved for that invocation while identity and
authorization continue to bind to `userId`.

## Rollback and falsifiable verification

Rollback reverts the platform principal projection and the independently
versioned Contracts/Nest packages. Existing business records remain valid;
their historical labels are repaired separately with audited CAS writes where
available.

Verification must prove the wire schema requires `displayName`, Gateway and
Connected Development reject invalid projections, both SDK current-user paths
return the canonical name, the platform sanitizes internal-id fallbacks, and
representative application actions persist `{ value: userId, label:
displayName }`.
