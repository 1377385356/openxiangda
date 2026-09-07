# OpenXiangda 2.0 backend capacity contract

## Problem evidence

- A backend artifact can currently carry arbitrary Kubernetes `resources` and
  `replicas` metadata even though the application toolchain does not own cluster
  capacity.
- `runMode` and `runtimeProfile` currently mean namespace isolation, while the
  names imply a resource size. This makes generated packages ambiguous.
- A new immutable candidate runs beside the active workload until activation.
  Without a capacity preflight, namespace quota failure is discovered only
  after release state and Kubernetes resources have started changing.

## Capability owner and stable invariants

The platform deployment control plane is the only owner of Kubernetes resource
quantities, replica counts, quota evaluation, scaling and candidate cleanup.
An application may declare only:

- `backend.enabled`: whether an application backend exists;
- `backend.isolation`: `shared` or `dedicated` namespace isolation;
- `backend.resourceProfile`: `light` or `standard` platform resource profile.

The package contains one exact `metadata.backend` projection. The removed
`runMode`, `runtimeProfile`, `backendPresent`, raw `resources` and raw `replicas`
shapes are not accepted or migrated.

## Contracts and failure behavior

- Pure CRUD applications have no backend artifact and consume no application
  Pod resources.
- Backend candidates always use one replica. Scaling is a platform lifecycle
  operation, not application metadata.
- Before the first Kubernetes write, the platform resolves the named profile
  and checks every ResourceQuota in the shared namespace for Pod count, CPU and
  memory requests and limits. Insufficient capacity returns one retryable,
  structured failure and creates no partial workload.
- Starting a stopped backend performs the same preflight before scaling from
  zero to one.
- A failed candidate that passed preflight remains owned by the existing Native
  candidate cleanup reconciler. It may never delete the active Head workload.

## Concurrency, bounds and rollback

- Capacity is advisory until Kubernetes admission and may race with another
  deployment. Kubernetes remains authoritative; its later denial is retryable
  and the candidate reconciler removes the exact failed workload.
- Profiles and replicas are closed enums/bounds. Applications cannot inject raw
  Kubernetes quantities or request more replicas.
- This is a pre-release 2.0 breaking reset. Rollback is the source commit and
  platform deployment combination; there is no package compatibility branch.

## Falsifiable verification

1. A frontend-only package renders no Deployment.
2. A light backend resolves to the platform light quantities and one replica.
3. A package using a removed backend metadata shape is rejected.
4. A quota shortfall fails before the first server-side apply call.
5. Starting a zero-replica workload checks the same quota before scaling.
6. The existing failed-candidate reconciler still removes only non-Head
   workloads.
