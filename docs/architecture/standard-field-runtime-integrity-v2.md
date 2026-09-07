# Standard Field Runtime Integrity v2

Status: accepted for implementation on 2026-08-25.

## Problem evidence

The current generated OpenXiangda 2.0 Web template violates six parts of the
standard CRUD field contract:

1. Selecting a dynamic resource value triggers a redundant source query once
   for a single selector and twice for a multiple selector. The selector query
   effects currently depend on selected values and on a newly allocated
   `bindings` object, although neither changes the open result set.
2. A required system UUID is rendered readonly/disabled but still receives an
   Ant Form required rule, so an empty create form reports a validation error
   for a value the user cannot provide.
3. The address client requests `/china-divisions/` at the public origin. nginx
   exposes platform controllers below `/service/`, so the request is handled by
   the runtime route and returns a redirect instead of the division envelope.
4. Native image references expose protected `thumbnailUrl` and `previewUrl`
   paths, but an `<img>` request cannot carry the active
   `x-openxiangda-role-session-id`. The same issue affects the canonical managed
   image URL stored inside rich text. Explicit preview works because it fetches
   the content with the active RoleSession and then creates a blob URL.
5. The standard audit page still reads the retired `actor.userId`, `before`,
   and `record` shape. The current platform audit contract exposes
   `actor.subjectId`, `changes[field].before/after`, and `projection`.
6. Passing the entire `{ before, after }` change object to a field renderer
   produces `[object Object]` for scalar fields and can crash structured field
   renderers such as resource references when a required display property is
   absent.

These failures apply to the current protocol. No historical audit, file, or
field value adapter is part of this decision.

## Capability owners

- The Native Data API remains the only owner of record values, source queries,
  audit facts, file authorization, and administrative-division data.
- `openxiangda-contracts` owns the public current audit value shape.
- The generated Web template owns query lifecycle, form validation, protected
  media materialization, and field-kind-aware audit rendering.
- nginx `/service/` remains the only public browser gateway to platform
  controllers. The application runtime must not add another proxy or data
  source.

## Stable invariants

1. A source query is caused only by opening the selector, changing its search
   text, paging, changing the operation/source declaration, or changing an
   actual declared binding value. Selecting or removing a result never causes
   another first-page query by itself.
2. A disabled or readonly control never emits an actionable UI validation
   error. The Native Data API remains authoritative for required and immutable
   values.
3. Administrative divisions use `/service/china-divisions/`; application code
   does not call a runtime-relative root endpoint.
4. Protected file bytes are rendered only after a RoleSession-bound fetch.
   Stored values retain stable file IDs/current canonical rich-text URLs;
   ephemeral blob URLs are never persisted and are revoked when replaced or
   unmounted.
5. Audit rendering consumes exactly the current `DataAuditEntry` contract.
   Each changed field renders its own `before` and `after` value through the
   same field renderer used by details. Large-value digests render a bounded
   summary rather than masquerading as a business field value.
6. Malformed current responses fail in a bounded field/audit surface and do not
   white-screen the application.

## Affected contracts

- `DataAuditEntry.actor` becomes `EventActor`.
- `DataAuditEntry.changes` becomes
  `Record<string, DataEventFieldChange>` and `projection` replaces the retired
  full `before`/`record` snapshots.
- Generated browser media helpers add an optional `thumbnail` variant to the
  existing authorized file-content fetch. No new public platform endpoint is
  introduced.
- Selector, address, validation, and media changes are implementation behavior;
  authored application declarations and PostgreSQL storage remain unchanged.

## Failure, concurrency, security, and resource bounds

- Selector request sequencing continues to discard stale responses. Stable
  dependency keys prevent duplicate requests without caching authorization
  decisions or results across identity epochs.
- Thumbnail and rich-text hydration ignore late responses after unmount, revoke
  every created object URL, and remain bounded by the declared file `maxCount`
  and the 20-image rich-text limit.
- Direct protected URLs are not used as browser image sources. Every byte fetch
  passes through the existing Native file authorization boundary with the
  active RoleSession and environment.
- Audit rendering never resolves identities for non-user actors and never
  interprets digest metadata as HTML or a field snapshot.
- No tokens, RoleSession IDs, raw identities, file bytes, or audit payloads are
  logged or persisted outside their existing owners.

## Rollback and blast radius

The rollback unit is the `openxiangda-contracts` and `openxiangda-cli` package
release containing this template. Rolling back restores the previous generated
Web behavior; it does not roll back a platform database, Native Head, or
deployed application automatically. Existing generated applications adopt the
change only after regeneration/rebuild/redeployment.

OpenXiangda 1.x, other tenants' stored rows, production Heads, and the platform
event/RabbitMQ implementation are outside this change. There is deliberately no
historical-value compatibility branch.

## Falsifiable verification

The change is closed only when all of the following pass:

1. Desktop source-selector acceptance observes one initial query and zero
   selection-triggered queries for both single and multiple values.
2. Submitting a create form with an empty disabled required UUID produces no
   UUID validation error.
3. Address tests assert `/service/china-divisions/` and reject the public-root
   path.
4. Image thumbnails and current canonical rich-text images resolve to blob URLs
   after authorized content requests; no protected Native URL is assigned
   directly to a rendered `<img>`.
5. Created, updated, and deleted audit entries render scalar, boolean, option,
   resource, directory, address/location, file/image, rich-text, JSON/subtable,
   signature, and digest before/after values without `[object Object]` or an
   uncaught error.
6. Contract tests, generated Web tests/check/build, and `pnpm verify:affected`
   pass from the repository-pinned toolchain.
