# Deterministic multi-entry browser release gate

Status: Accepted, 2026-08-27

## Evidence and owner

The formal `verify:release` fresh-application gate started two Playwright
workers against one Vite development server. One worker had already rendered
the Field Kit page, while a later navigation from the other active HTML graph
received no mounted fields (`38` expected, `0` rendered). All non-browser
package tests and nineteen other browser cases passed. A retry could therefore
hide a mutable dependency-optimizer race and make release success probabilistic.

The OpenXiangda CLI template owns the browser acceptance process. Vite remains
the only development module graph owner; application runtime code and the
platform server do not coordinate test workers.

## Stable invariant and public contract

- Every shipped E2E HTML entry remains listed in `optimizeDeps.entries`.
- One Playwright worker consumes the Vite graph at a time. Test files may keep
  independent contexts, but cannot concurrently invalidate the shared optimizer
  generation.
- A release failure is terminal evidence. The release command never retries a
  failed browser case automatically and never publishes from a failed receipt.
- The change affects only generated acceptance infrastructure. Production Web
  concurrency, application data, authorization, and the 1.x toolchain are
  unchanged.

## Failure, bounds, and rollback

Serial execution adds only the bounded duration of the existing twenty browser
cases and uses no extra process, port, credential, or state store. A browser
failure still preserves its Playwright trace and returns a non-zero gate.

Rollback restores multiple workers only after a replacement server contract
can prove immutable per-entry dependency graphs. No application or platform
data migration is involved.

## Falsifiable acceptance

1. Template contract tests require all E2E HTML entries and `workers: 1`.
2. Fresh packed-app Playwright acceptance passes all non-live cases from the
   actual root and capsule tarballs.
3. `verify:release` produces a validated receipt without retrying a failed test.

