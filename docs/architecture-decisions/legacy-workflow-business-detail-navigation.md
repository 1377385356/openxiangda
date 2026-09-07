# Legacy Workflow business-detail navigation

## Evidence and owner

Workflow instances created before logical data revisions were recorded can
return an authoritative Surface whose `presentation.businessDetail` is
`unavailable` with `WORKFLOW_V2_SUBJECT_DATA_BINDING_REQUIRED`.

The first implementation exposed a `resource_record` `navigationTarget` by
mechanically rendering `/<resourceCode>/<recordId>`. Real applications can
declare a different business route, for example
`/club-funding/applications/:applicationId`. The guessed URL is syntactically
valid but has no registered component, so the user leaves a healthy Workflow
page for an empty application page without an HTTP or console error.

The Workflow Detail Reader remains the only owner of revision-consistent
business-detail projection. The application compiler owns the resource-to-page
mapping, the immutable active Contract Bundle owns its published value, the
platform Workflow route resolver owns path rendering, and the standard React
Workflow page owns only how the returned Surface is presented.

## Decision and invariants

- Never synthesize `dataLogicalRevisionId`, query current data as a substitute,
  or reinterpret an unavailable projection as ready.
- A resource may explicitly declare one paired `detailRouteCode` with desktop
  and mobile frontend route codes. The compiler validates both references,
  their user surfaces, and exactly one bounded dynamic record parameter, then
  emits the mapping on that resource in the Contract Bundle.
- The platform resolves `navigationTarget` only from the active immutable
  Contract Bundle. It substitutes `recordId` into the declared parameter; it
  never derives a URL from `resourceCode`, route naming conventions, generated
  admin pages, or application-specific aliases.
- One contract read resolves both Workflow detail navigation and resource
  record navigation, so a Surface never mixes route declarations from two
  environment-head revisions.
- When and only when the detail status is `unavailable` and the same Surface
  contains a `resource_record` navigation target, render a normal business
  explanation and link to the platform-provided desktop or mobile path.
- Keep `missing` and `forbidden` unchanged. Keep `unavailable` without a target
  fail-closed.
- The destination repeats platform authentication, resource capability, field
  policy and row-policy checks. The browser does not construct a resource URL.

An application or older Contract Bundle without `detailRouteCode` receives a
null `navigationTarget`. A malformed published mapping fails the Workflow
Surface read with a stable platform error instead of falling back to a guessed
path. The resolver has bounded resource, route and item counts and accepts no
query, fragment, wildcard, traversal or multi-parameter route. It performs no
writes and introduces no second identity or authorization path.

This is an additive application contract and presentation behavior. It changes
no Workflow state, Data storage, authorization, or 1.x contract and creates no
concurrent write path. Existing 2.0 applications remain valid, but receive no
record navigation until they deliberately declare and publish the mapping.

## Rollback and verification

The change is independently reversible at three boundaries: the application
can remove its mapping, the platform server can revert the contract resolver,
and the `openxiangda` renderer can revert to warning-only presentation. None of
those rollbacks mutates stored Workflow instances or business records.

Tests must prove compiler emission and rejection of missing, wrong-surface,
multi-parameter and malformed mappings; platform desktop/mobile rendering from
one active contract; null behavior when the mapping is absent; fail-closed
behavior for malformed active contracts; absence of guessed resource paths;
renderer path selection; preservation of `missing` and `forbidden`; and the
warning-only fallback when no navigation target exists. Release verification,
package registry readback, platform deployment, and clicking a real older
instance through to a non-empty business page remain separate delivery gates.
