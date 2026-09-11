# Anonymous public record reads v2

Status: confirmed for implementation on 2026-09-11

## Decision

- Problem evidence: anonymous public access can submit and read a visitor's own
  records, but it cannot publish a deliberately selected resource such as a
  public catalogue, announcement index, or availability list to an external
  browser.
- Capability owner: Platform Server owns public row selection, fixed ordering,
  cursor pagination, field projection, rate limits, and fail-closed authorization.
  The application declaration is the only place that opts a resource into public
  reads and names the fields that may leave the platform.
- Stable invariants:
  1. `public.list` and `public.read` are separate allow-list operations; they do
     not grant draft, create, update, delete, own-record, or generic Data API
     access.
  2. `publicRecordFields` is mandatory for public-read policies and is a subset
     of the policy fields and the resource schema. Managed attachments, images,
     and sanitized rich text are allowed; signatures remain excluded. A public
     subtable field must have an explicit `publicSubtableFields` entry naming
     the child fields that may leave the platform.
  3. Public list reads all rows of the explicitly selected resource in the
     current tenant/application/environment; the declaration is an intentional
     publication decision and never inherits a user's roles or filters.
  4. The caller may provide only an opaque bounded cursor and page size. The
     server owns a stable `(created_at DESC, id DESC)` order and projection.
  5. Public detail accepts only a UUID and returns the same 404 for a missing row
     or an invalid/unauthorized request. System ownership and audit fields are
     never included in the public field projection.
  6. Managed file values never contain an object-storage URL. Public file and
     image references use the dedicated anonymous content route, which checks
     tenant, application, environment, public policy, record/field binding and
     file state on every request. Rich-text HTML is the already-sanitized value;
     every managed inline image must resolve to a file in that same public
     record and declared rich-text field.
  7. Subtables are projected from their child resource, never from an unbounded
     JSON value in the parent. The declaration selects child fields with
     `publicSubtableFields`; nested subtables are rejected, child rows are
     ordered by the declared order field, and the existing child row/field
     bounds remain in force.
  8. Public reads use the existing anonymous browser credential; mutation
     endpoints retain same-origin checks. The credential is not accepted by
     normal Native Data API routes.
- Failure and resource bounds: page size is 1..50, public records select at most
  64 fields, child projections at most 64 fields and 100 rows per parent, and
  rich text/file limits remain those of Native Data API. No unbounded search,
  aggregate, export, or caller SQL is introduced.
- Rollback boundary: removing `public.list`/`public.read` or the policy from a
  later immutable application version blocks the dedicated endpoints immediately;
  existing authenticated CRUD and anonymous submission policies are unchanged.
  The SQL authorization branch is additive and can remain during binary rollback.
- Falsifiable verification: a policy with explicit public fields compiles and
  generates client methods; an unauthenticated browser can page and read those
  fields; another policy/resource or undeclared field is rejected; arbitrary
  where/order/projection/count parameters have no effect and are not accepted;
  generic Native Data API requests remain 401; a policy without public operations
  remains owner-only.

## Contract

```ts
frontend: {
  publicAccess: {
    policies: [{
      code: 'catalog-public',
      routeCode: 'catalog',
      mode: 'anonymous',
      resourceCode: 'catalog-items',
      operations: ['public.list', 'public.read'],
      fields: ['name', 'cover', 'description', 'items'],
      publicRecordFields: ['name', 'cover', 'description', 'items'],
      publicSubtableFields: { items: ['sku', 'quantity'] },
    }],
  },
}
```

The browser uses `createAnonymousPublicClient({ routeCode: 'catalog' })`, calls
`bootstrap()`, then `listPublic({ pageSize, cursor })` and `getPublic(recordId)`.
Public file references are consumed through `fileContentUrl(fileId,
disposition, variant)`; the URL is a platform authorization route and may return
404 after a record or field is no longer public. A public subtable is returned as
a bounded array of child record data selected by `publicSubtableFields`.
Public reads do not require a draft. Submission still requires a draft because
the draft is the platform-owned transaction boundary for partial data, CAS
resume, required-field validation, file binding, duplicate guards, and
idempotent final create; a public read is a separate read-only path.
