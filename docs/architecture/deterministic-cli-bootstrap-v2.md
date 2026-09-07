# OpenXiangda 2.0 deterministic CLI bootstrap

## Problem evidence

The final low-capability-model black-box run followed the public Skill command
`pnpm dlx openxiangda-cli@latest`, but pnpm started `2.0.0-alpha.60` after
`2.0.0-alpha.78` had been published and verified. The registry tag was correct;
the moving tag had been resolved through existing pnpm dlx and registry metadata
state. pnpm documents a one-day default dlx cache. Clearing local caches would
hide the failure on one machine without making application initialization
deterministic.

Reference: <https://pnpm.io/settings/node-modules#dlxcachemaxage>

## Capability owner and stable invariants

- The released OpenXiangda 2.0 Skill owns the exact bootstrap CLI coordinate.
- The CLI package manifest owns the coordinate version.
- `release:version` synchronizes the Skill after Changesets materialize package
  versions; humans and models do not calculate or guess the next alpha version.
- A CLI Changeset must include a Skill Kit Changeset in the same release unit.
- Once a workspace exists, its exact `package.json` and lockfile remain the only
  CLI owner. Bootstrap commands never participate in normal workspace commands.

## Public contract

The installable Skill uses an exact coordinate such as
`pnpm dlx openxiangda-cli@2.0.0-alpha.78`. It does not use `latest`, `alpha`, a
semver range, a global binary, a cache-clearing command or a compatibility alias.

The generated application README does not tell developers to bootstrap another
application with the version that happened to generate it. Creation guidance
belongs to the current Skill; the application README starts at the locked
workspace commands.

## Failure, concurrency and resource behavior

- Version materialization fails before release if a CLI Changeset omits the
  Skill Kit package.
- Orchestration verification fails when the exact coordinate differs from the
  current CLI manifest or when an active bootstrap surface contains `@latest`.
- Concurrent releases remain serialized by the existing clean authoritative
  master and release receipt gates.
- The solution performs no cache deletion and does not mutate global pnpm
  configuration. Normal content-addressed package reuse remains available.

## Security and blast radius

An exact coordinate prevents moving-tag drift and makes the package selected by
the Skill reviewable. Existing application lockfiles, platform runtime, 1.x,
business data and deployed workloads are unchanged. No package-signing or hash
protocol is added to the developer workflow.

## Rollback boundary

Rollback is the independently versioned Skill Kit and CLI release pair. There is
no migration path and no fallback to an older CLI. Failed initialization creates
no accepted 2.0 workspace.

## Falsifiable verification

1. The current Skill contains the exact current CLI manifest version.
2. No active Skill or template bootstrap guidance contains
   `openxiangda-cli@latest`.
3. A release-version test proves CLI-only Changesets are rejected and a paired
   CLI/Skill release rewrites the exact coordinate.
4. With a stale dlx cache still present, the exact public command reports the
   intended CLI version and creates a fresh application pinned to that version.
5. The fresh application passes check/test/build without compatibility code.
