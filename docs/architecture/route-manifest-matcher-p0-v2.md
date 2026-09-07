# Standard route-manifest matcher P0 v2

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

Status: accepted for implementation on 2026-08-30.

## Problem evidence

The generated union reference app route manifest contains ten `workflow-launch` entries. Each
desktop route embeds a different workflow code, while every mobile route uses
the shared `/m/workflows/:workflowCode/start` pattern. In the alpha.49 runtime,
`negotiateStandardRoute` selected the first pathname-pattern match before
using the capture or the entry metadata. A read-only run of the published
helper therefore mapped only one of ten mobile launch paths correctly; the
other nine resolved to `activity-publication-approval`. Query and hash values
survived, but the workflow target was wrong.

The defect is in the platform runtime matcher. It is not an union reference app declaration
problem and must not be repaired in the union reference app application or in the 1.x
platform.

## Objective and actors

- Objective: make a standard desktop/mobile route negotiation select the one
  manifest entry whose static segments, dynamic captures and semantic metadata
  describe the current location, or fail closed when that identity cannot be
  proven.
- Actors: the compiler emits the immutable route manifest; the browser runtime
  matches and projects one paired route; applications only consume generated
  entries; the user may resize a browser or revisit a deep link.
- Positive scenarios: each workflow launch switches in both directions, task
  and instance captures are carried to their paired route, and query/hash/router
  state are retained.
- Negative scenarios: an ambiguous same-pattern entry, an unknown semantic
  capture, a mismatched paired parameter, an already-target-device route, and a
  non-standard path produce no navigation.

## Owner and invariants

The `openxiangda` browser runtime owns matching and replacement. The compiler
and `AppRouteManifestV2` own route paths, `pathParams`, paired surface metadata
and `workflowCode` semantic metadata. No application, server endpoint or
union reference app-specific branch may provide a second route catalog or disambiguation rule.

1. Matching is performed against the router-relative pathname only; query and
   hash are carried as opaque suffixes.
2. A candidate must satisfy both its path pattern and all available semantic
   metadata. A `workflowCode` capture must equal that entry's `workflowCode`
   (with URL encoding normalized); a pair with dynamic parameters may project
   only same-named parameters. Positional or first-entry fallback is forbidden.
3. When multiple entries share a pattern, exactly one semantically compatible
   entry may win. Zero or multiple compatible entries fail closed.
4. Projection may fill a target `workflowCode` only from the entry metadata
   when the source route is static. It never invents a value for an unrelated
   target parameter.
5. Switching is a bounded `replace` navigation. The current device pair,
   non-standard routes, and equal target path do nothing; preserving router
   state is the application runtime's responsibility at the single Router
   boundary.
6. The shared viewport boundary remains `<=768px` mobile and `>=769px`
   desktop. Manifest paths are relative to the Router basename; the matcher
   neither strips nor adds a basename.

## Affected contracts and blast radius

Affected: `packages/openxiangda` route-manifest matching, its browser export and
focused tests, the route-composition architecture evidence, and the root
package release candidate. This is a pre-release 2.0 contract replacement with
no compatibility alias. It changes no Data/API/schema/authentication contract,
no platform-server code, no union reference app application code, and no OpenXiangda 1.x
runtime or data.

## Failure, concurrency, security and bounds

The matcher is pure, deterministic and bounded by the compiler route limit. It
does not read network state, identity, authorization or browser storage. An
ambiguous or unsafe capture returns `undefined` and leaves the current history
entry untouched. The effect guard remains idempotent across resize and route
updates, so a replace cannot loop or overwrite a newer user navigation.

## Rollback boundary

Before publication, revert the `openxiangda` source and package candidate to
the previous master commit. After publication, applications must redeploy the
matching prior immutable package and generated contracts together. No database
repair or platform-server rollback is involved.

## Falsifiable verification

1. Focused matcher tests cover desktop/mobile negotiation for all ten shared
   mobile workflow-launch patterns, same-pattern ambiguity, semantic and paired
   dynamic captures, URL encoding, query/hash and unknown paths.
2. Runtime/source tests prove `replace`, router `state`, basename-relative
   paths, no-loop behavior, and the 768/769 device boundary.
3. The independent package test, `pnpm verify:affected`, a fresh packed
   reference-app smoke, and the full release validation gate pass from a clean
   authoritative `master`; the publish train remains limited to OpenXiangda 2.0
   packages.
