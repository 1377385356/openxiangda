# Notification APP_ROUTE desktop/mobile pairing

Status: accepted, 2026-08-28

## Evidence and owner

`NotificationNavigationTargetV2.APP_ROUTE` previously carried one `routeCode`.
The platform therefore rendered one route and reused its path for desktop Todo,
mobile Todo, DingTalk cards, and work notices. Applications with independent PC
and mobile pages could not publish one logical notification that navigated each
device to its canonical page.

Notification Hub remains the sole owner of logical-message persistence and
delivery navigation. The active application Contract Bundle remains the sole
route catalog; applications must not duplicate messages by channel or resolve
routes in browser code.

## Decision

- `APP_ROUTE` requires `routeCodes.desktop` and `routeCodes.mobile`; the removed
  single `routeCode` shape is not accepted for this pre-release contract.
- `PLATFORM_ROUTE` continues to use one platform-owned `routeCode`, including
  `workflow.detail`. `EXTERNAL_URL` continues to use one authenticated HTTPS
  fallback URL.
- Both application routes share one bounded `pathParams` and `query` payload.
  Before a new logical message is stored, the platform loads the active Contract
  Bundle, proves both codes exist in the same application/environment, proves
  their parameter placeholder sets are identical, and renders both paths.
- The compiler-generated `appRoutes` catalog is the source for both codes. The
  generated contract exposes the exact route-code union so application code can
  bind notification targets to declared routes instead of stringly typed paths.
- Todo returns the resolved relative `desktopPath` and `mobilePath`. External
  delivery selects the already-resolved path by channel device; one message,
  idempotency key, recipient set, and revision are retained.

## Failure, bounds, and security

Missing, unknown, cross-application, malformed, or parameter-incompatible route
pairs fail before message creation. Existing stored single-route APP_ROUTE
messages remain visible but expose unavailable navigation. Each pair contains
exactly two stable route codes; existing path, parameter, query, URL, credential,
and external-host bounds remain enforced. Destination capability guards remain
owned by the application runtime.

## Concurrency, rollback, and blast radius

Message ordering, advisory locks, idempotent replay, and delivery leases are
unchanged. No database migration is required because navigation targets are
JSON. Rollback is the prior package/platform combination; messages created with
the paired shape become unavailable on the old runtime rather than being
misrouted. Existing alpha applications that send APP_ROUTE notifications must
adopt the paired shape; platform routes, workflow notifications, and external
URLs are unaffected.

## Falsifiable verification

1. Contract/type tests reject a single-code APP_ROUTE and compile a declared
   desktop/mobile pair from generated route codes.
2. Server tests reject missing/unknown/cross-app/placeholder-incompatible pairs
   before insert and keep one logical message.
3. Todo tests return distinct PC and mobile relative paths with shared params.
4. DingTalk snapshot tests select the mobile path while desktop delivery selects
   the desktop path, without credentials in either URL.
5. Release gates, packed-package checks, platform readiness, and authenticated
   PC/mobile Todo browser acceptance pass for the same immutable combination.
