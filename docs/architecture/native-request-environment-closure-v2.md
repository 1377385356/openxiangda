# Native Request Environment Closure V2

## Problem evidence

The OpenXiangda Nest module is configured with one exact application
environment, but its Native Data client did not serialize that environment on
query, record, file, audit, or transaction requests. Browser CRUD supplied the
environment explicitly and worked. The same operation forwarded by a custom
Nest action omitted it and failed before the platform could resolve the
interactive Connected Dev principal.

The platform correctly requires an explicit environment for interactive
selectors, but its controller recognized only a hand-maintained subset of
OpenXiangda error prefixes. The deterministic missing-environment error was
therefore reported as an opaque internal error.

## Capability owner

`OpenXiangdaPlatformClient` owns serialization of the module-bound environment
on every Native Data request. The platform Native controller owns the stable
HTTP mapping of all OpenXiangda domain errors. Applications do not choose or
forward an environment per operation.

## Stable invariants

1. One Nest module instance is bound to exactly one `environmentKey`.
2. Every Native Data query, record read/write, audit, managed-file, aggregate,
   and transaction request serializes that bound environment.
3. Caller payloads cannot override the module-bound environment.
4. The platform still compares the serialized environment with the verified
   principal and active Head; mismatch fails closed.
5. Any syntactically valid `OPENXIANGDA_*` domain error preserves its code and
   declared status. Unknown runtime and database errors remain redacted as
   internal failures.
6. OpenXiangda 2.0 has no environment inference fallback and no compatibility
   branch for requests that omit the environment.

## Affected contracts

- `OpenXiangdaPlatformClient` Native Data methods
- `OpenXiangdaDataApiService`
- `OpenXiangdaApplicationDataApiService`
- Connected-development custom Nest actions
- Deployed application backends and requestless workers
- Native Data controller error mapping

The application-facing SDK method signatures do not gain an environment
parameter. Environment ownership remains at module configuration level.

## Failure and concurrency behavior

Environment serialization is deterministic and occurs before the network
request. A mismatch is rejected before mutation or transaction receipt
creation. Concurrent requests from one module instance therefore cannot drift
between environments.

## Security and resource bounds

The environment value is restricted by module configuration and is placed last
when request bodies are constructed, so caller data cannot replace it. Error
mapping exposes only bounded OpenXiangda error identifiers and existing safe
metadata; arbitrary database messages remain redacted.

## Rollback boundary

The Nest package and platform error-mapping release are independently
reversible, but full correctness requires both. There is no persisted schema
change and no compatibility flag.

## Falsifiable verification

- Tests inspect every Native Data request URL or JSON body and find the module
  environment exactly once.
- Supplying a conflicting environment in a transaction object cannot override
  the module value.
- A raw request without an environment returns
  `OPENXIANGDA_SELECTOR_ENVIRONMENT_REQUIRED` with status 400 rather than 500.
- Fresh visitor, meeting, and course custom actions succeed in connected
  development and after deployment without application code passing an
  environment argument.
