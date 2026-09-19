# Ant Design Mobile runtime CSS prelude v2

Status: accepted for implementation on 2026-09-20.

## Problem evidence

- A real Vite application using `openxiangda@2.21.3` still reports
  `[antd-mobile: Global] The px tester is not rendering properly` while
  evaluating its dependency-optimized `openxiangda/react` entry.
- The optimized entry imports the shared chunk containing Ant Design Mobile's
  `convert-px` module before the entry body runs. That module creates and checks
  `.adm-px-tester` elements immediately; the current JavaScript initializer is
  later in the entry body, so it cannot satisfy the first check.
- After the warning, the current runtime style is present and both tester
  elements compute to `position: fixed`. The failure is therefore ordering,
  not a missing final style or an application declaration problem.
- The existing Node mock proves only that a style element is appended. It does
  not exercise Vite dependency optimization or browser module evaluation.

## Capability owner and stable invariants

- `openxiangda/react` owns browser runtime preparation required by the mobile
  components that it transitively exposes. Applications must not add a direct
  `antd-mobile` dependency or import a private upstream global entry.
- Runtime measurement CSS must be available before Ant Design Mobile evaluates
  `convert-px`. A JavaScript statement in the public entry body is not an
  ordering boundary for its statically imported dependency graph.
- The prelude contains only the `.adm-px-tester` measurement rule. It must not
  introduce upstream `html`, `body`, link, button, theme, or color defaults.
- Visual mobile defaults remain scoped to `.oxa-mobile-scope`; current theme,
  application lifecycle, identity, authorization, data, and routing contracts
  are unchanged.
- The touch listener remains idempotent and browser-only. Server-side imports
  must continue to work without a `document`.

## Affected contracts and blast radius

- The published `openxiangda/react` JavaScript entry and packed CSS assets are
  affected. `openxiangda/mobile` remains a component export boundary and does
  not become a second runtime owner.
- The fix is additive for V2 browser applications and does not affect the V1
  maintenance engine, platform-server, other tenants, database schemas, or
  deployed application data.
- Development and production bundlers may split dependencies differently, so
  the acceptance test must run through a real Vite dependency-optimization
  path instead of relying only on source import order.

## Failure, concurrency, security, and resource bounds

- Repeated imports or React strict-mode rendering must not add duplicate
  listeners or change the measurement rule.
- The CSS is static, contains no user data or URL, and performs no network,
  storage, authentication, or DOM traversal beyond the two upstream tester
  elements.
- Failure remains visible as the upstream console error and incorrect tester
  geometry; no warning suppression or fallback conversion is introduced.

## Rollback boundary

- Roll back the independently published `openxiangda` package to the preceding
  version. No platform image, SQL migration, application configuration, or
  compatibility switch is required.
- The JavaScript initializer is retained for its idempotent touch listener and
  direct source tests until a separately reviewed change proves it redundant.

## Falsifiable verification

1. A focused source test proves the prelude contains only the reviewed tester
   mechanics and is shipped beside the compiled browser entry.
2. A real Chromium page begins collecting console messages before navigation,
   imports the packed candidate through Vite, and observes zero
   `[antd-mobile: Global]` errors.
3. The page contains both `.adm-px-tester` elements; both compute to
   `position: fixed`, and the tester with `--size: 10` has a 10 px height.
4. The existing package test, type check, build, packed browser gate, and
   `pnpm verify:affected` pass before publication.
