# Permission review from sealed application declarations

Date: 2026-09-05

## Evidence and owner

`OpenXiangdaApplicationServices.contractDescribe()` already owns the compiled
contract exposed by the MCP `contract_describe` tool and the workspace contracts
resource. It exposes page and capability catalogs, but a reviewer cannot follow
those to sealed role grants, explicit field restrictions, raw data scope rules,
or workflow participant bindings without separately inspecting authored config.
The existing `testing.runPermissionMatrix` runs caller-supplied authorization
fixtures; it is not a projection of an application's declarations.

The devkit compiler owns a new pure `buildPermissionReview` projection over the
paired sealed `ConfigurationBundleV3` and `ContractBundleV3`. The application
service emits it as `permissionReview`; MCP consumes that same owner. Business
approval of the intended roles remains in the application's appspec. Platform
authorization, membership, data policies and Workflow Task Surface remain the
runtime authorities.

Review metadata is `schemaVersion: openxiangda.permission-review/v2`,
`authority: declaration-projection`, and `runtimeAuthorizationRequired: true`.
This schema identifier is independent from package release versions.

## Invariants and contracts

- This is declaration review, never a runtime allow result or generated grant.
- Sealed role capability sets are stored once. The runtime uses the current
  user's role union. Authoring `deniedCapabilities` is local subtraction before
  sealing; another role's grant is not incorrectly presented as a global deny.
- Pages refer to resource/view or workflow codes. Field policies are stored
  once per resource. Explicit empty field policies remain deny even when a role
  has the resource capability; hidden UI fields do not imply denial.
- Existing Perspective declarations remain read projections, never an active
  role or a replacement mutation/workflow principal.
- Raw row-policy expressions, scope sources, unrestricted roles and write
  boundaries retain their declared values. Dynamic participant bindings,
  condition nodes and task field policies remain conditions for runtime review.
- Catalogs are normalized: no role × target × field materialization. Capability,
  resource, view, workflow, version and binding keys provide stable references.
- Review content pins configuration and contract digests; a mismatched pair
  fails before projection. No compiler inputs are mutated.
- The output is additive to `contractDescribe`; no runtime wire bundle, Data API,
  authorization evaluation, page generation or application backend is changed.

## Failure, concurrency and bounds

Projection has no writes, credentials, network calls or evaluation of expressions.
There is no new concurrent state to reconcile. It copies only review-relevant
sealed declarations and grows with the declared catalogs and field/rule counts,
not the cross product of roles and targets. It omits backend secret declarations
and operation input/output schema bodies. Invalid pairing fails with
`PERMISSION_REVIEW_CONFIG_MISMATCH`.

## Blast radius and rollback

Only 2.0 devkit/MCP introspection gains the review object. Existing runtime
permissions, 1.x, other tenants, published packages and production are unchanged
until the later unified release. Reverting this additive source unit removes the
projection without migrating data or changing any grants.

## Falsifiable verification

Compile a neutral application with named views, explicit roles, an empty field
write policy, hidden writable fields, raw data scope rules and an activated
workflow. Assert exact role subtraction, shared resource references, preserved
empty denial and raw dynamic conditions, digest pairing and immutability. Add
many roles and assert that field and page catalogs do not grow with them. Verify
the MCP resource and tool return the identical review. Run affected package
type checks and `verify:affected`; remote role/browser acceptance remains part
of the unified release acceptance.

## Verification recorded

The six focused projection cases and the devkit strict type check passed.
`pnpm verify:affected` passed all 20 tasks, including 213 devkit tests, 9 MCP
tests (the resource/tool projection equality check), and the CLI lifecycle
blackbox fixture. No package publication, deployment or remote business-role
acceptance was performed in this source unit.
