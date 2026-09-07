# Instrument query field boundary v2

Status: Accepted

- Problem evidence: the live golden application successfully creates an
  instrument, then its list repeatedly sends `order: [{ field: 'updatedAt',
  direction: 'desc' }]` to the Native Data query endpoint. `updatedAt` is not a
  declared field of the `instruments` resource, so the platform correctly
  rejects the request with
  `OPENXIANGDA_NATIVE_DATA_FIELD_NOT_DECLARED:updatedAt`. The platform response
  exposes its system timestamp as `updated_at`; that response column is not an
  application-declared query field either.
- Capability owner: the application resource declaration owns queryable field
  names. The platform remains authoritative and must not accept aliases or
  undeclared system columns. The template Data API adapter owns the final
  request body sent by the browser.
- Stable invariants: every `filters[].field` and `order[].field` sent for the
  instrument resource is present in `instruments.schema.fields`. The default
  order is the declared `instrumentCode` field. `updated_at` remains a
  display-only system value and the update-time column is not sortable.
- Contract and failure behavior: the frontend record uses the response key
  `updated_at`. The adapter validates every outgoing query field against the
  frontend resource-field catalog and fails before `fetch` if a future UI or
  caller supplies an undeclared field. No camel/snake alias mapping and no
  platform fallback are introduced.
- Concurrency, security, and resource bounds: validation is a synchronous set
  lookup over at most the bounded Data Query filter/order arrays. It adds no
  state, credentials, retries, extra requests, or cross-tenant behavior.
- Blast radius and rollback: this changes only the unpublished 2.0 application
  template packaged by `openxiangda-cli`. Stable 1.x applications, the platform
  contract, deployed data, and production state are untouched. Reverting this
  commit restores only the incorrect template query behavior.
- Falsifiable verification: adapter tests compare all emitted filter/order
  fields with the source resource declaration and prove an undeclared sorter
  causes zero query requests. Browser tests execute create, list, detail,
  update, and delete while asserting every list query stays within the same
  declaration. Source-template and packed-application checks must continue to
  pass.

Adjacent findings remain separate: the fresh-create Head/dev remediation, the
form validation unhandled Promise, and static fixture user IDs need their own
architecture slices.
