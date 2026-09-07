---
"openxiangda-admin": patch
"create-openxiangda": patch
---

Stabilize the standard resource table field projections so preference hydration
runs only when the resource definition or active identity actually changes.

Architecture decision for this implementation round:

- Evidence: the standard-template Chromium test reaches all expected pages but
  records `Maximum update depth exceeded` while opening list settings and
  navigating away from standard resource tables; React subsequently reports a
  concurrent-render recovery as a page error.
- Capability owner: `openxiangda-admin` remains the sole owner of standard
  resource-table preferences and field projection. Applications must not patch
  or duplicate this lifecycle.
- Stable invariants: platform identity, capability checks, Data API queries,
  persisted preference shape, field policy, and the 1.x boundary do not change.
- Affected contracts: no wire or public component contract changes. The
  generated application template only adopts the patched Admin package.
- Failure and concurrency: preference hydration still reruns on an identity,
  resource, field definition, or storage-key change; ordinary local state
  renders no longer create a new hydration dependency and cannot self-loop.
- Security and resources: authorization remains server-owned and independently
  enforced. No new cache, state store, request, timer, or resource allowance is
  introduced.
- Rollback: revert the Admin/create package pair or reactivate the prior
  immutable application version; no data or platform rollback is required.
- Falsifiable verification: Admin check/test/build, official fresh-application
  Chromium, independent reference application, and the standard-template
  desktop test must finish without page errors or maximum-update-depth output.
