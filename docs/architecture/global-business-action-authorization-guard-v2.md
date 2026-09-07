# Global business-action authorization guard v2

## Problem evidence

A real preproduction acceptance identity with only the `lab-technician` role
reached a Nest controller protected by `@OpenXiangdaOperation` even though its
published role union did not include the operation capability. The immutable
operation metadata and `OpenXiangdaAuthzGuard` implementation were present, but
`OpenXiangdaModule.forRoot()` registered that guard only as an injectable
provider. Only the Gateway transport guard was global, so the operation guard
never ran unless an application added its own undocumented wiring.

The first published global-guard candidate then exposed a second real
preproduction failure: the global authorization guard also rejected the SDK's
Kubernetes health and readiness endpoints with 401. A concurrently deployed
application entered `CrashLoopBackOff`, because those infrastructure routes do
not and must not carry a user business-action capability.

## Capability owner and stable invariants

- The published AppVersion owns the operation code and required capability.
- The platform Gateway owns the short-lived invocation, exact application,
  environment, AppVersion, DeploymentRun, Head and initiating-user binding.
- `openxiangda-nest` owns the one mandatory business-action capability check at
  the Nest App API ingress. Application code only declares
  `@OpenXiangdaOperation(operation)` and must not add `authorizationJSON`, a
  RoleSession, or a second authorization store.
- After the ingress check succeeds, `OpenXiangdaBusinessDataApiService` remains
  trusted for the exact application and environment and is not re-limited by
  the user's resource, row or field permissions. Audit retains the initiating
  user and immutable operation proof.

## Contract and failure behavior

`OpenXiangdaModule.forRoot()` registers two ordered global guards:

1. `OpenXiangdaGatewayTransportGuard` verifies the signed Gateway assertion and
   resolves the immutable invocation context.
2. `OpenXiangdaAuthzGuard` resolves the route's
   `@OpenXiangdaOperation` metadata and rejects missing or ungranted capability
   before the controller executes.

SDK-owned infrastructure controllers are registered in a module-private
allowlist. Health/readiness/version remain protected by the local Kubernetes
network boundary; event and assignee-provider callbacks remain protected by
their signed transport protocols. The allowlist is not exported from the
public package and application controllers cannot opt themselves out.

Missing Gateway context fails with 401. A valid role union without the required
operation capability fails with 403. A trusted application invocation must have
`app:invoke` plus the exact published operation capability. Health, readiness
and other explicitly exempt platform routes keep their existing transport
behavior.

The change introduces no additional state, lock, retry or concurrency path.
It closes a fail-open authorization path and does not change the transaction
semantics of a successfully authorized business action.

## Security bounds, blast radius and rollback

The blast radius is every 2.0 Nest application using `OpenXiangdaModule`. This
is the documented pre-release behavior, so no compatibility bypass is added.
OpenXiangda 1.x and platform CRUD/Data API authorization are unaffected.

Rollback is a package-version rollback plus reuse of the prior immutable
application version. Because rollback would re-open the fail-open path, it is
only an emergency recovery boundary and must not be treated as an acceptable
steady state.

## Falsifiable verification

- The SDK test must prove the transport guard is registered first and the
  operation authorization guard second as `APP_GUARD` providers.
- Existing guard tests must prove a verified role union without the declared
  capability receives `OPENXIANGDA_CAPABILITY_DENIED`.
- The SDK test must prove health, event delivery and assignee-provider
  infrastructure controllers bypass only the business-action guard, while an
  unmarked route without Gateway context still receives 401.
- A fresh packed-package application build must pass package tests and release
  verification.
- Real preproduction browser acceptance must prove a technician receives 403,
  while an authorized manager reaches application request validation without
  mutating data.
