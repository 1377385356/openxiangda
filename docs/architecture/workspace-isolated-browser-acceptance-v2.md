# Workspace-isolated browser acceptance

## Problem evidence

Three independent visitor, meeting, and course workspaces passed `openxiangda check`, but concurrent `pnpm test:e2e` runs contended for the template's fixed port `4173`. One run passed and the other two failed before executing a browser assertion.

## Capability owner and invariants

The generated application template owns local browser-test process isolation. Every workspace derives its default E2E port from its absolute workspace identity; CI may provide one explicit `OPENXIANGDA_E2E_PORT`. The browser base URL and Vite server port are always derived from the same value. An external `OPENXIANGDA_E2E_BASE_URL` remains the sole owner when supplied.

There is no legacy fixed-port behavior and no fallback to an already-running server. Invalid explicit ports fail before Playwright starts, and one test run never attaches to another application's process.

## Contracts and failure behavior

- Default port: deterministic FNV-1a hash of `process.cwd()`, mapped to `30000..59999`.
- Override: integer `1024..65535` through `OPENXIANGDA_E2E_PORT`.
- Remote browser target: `OPENXIANGDA_E2E_BASE_URL`, with no local server.
- Local server reuse remains disabled so stale or foreign processes cannot satisfy readiness.

The port space is bounded to 30,000 values and adds no service, state store, background process, or deployment resource. A rare hash collision fails visibly as a port conflict and can be resolved through the explicit override; it cannot cause cross-application assertions because server reuse is disabled.

## Rollback boundary and blast radius

Rollback is the CLI template version. Existing source workspaces change only when they intentionally adopt the new config. Platform runtime, 1.x applications, remote data, authorization, and deployed application behavior are unaffected.

## Falsifiable verification

1. A generated workspace contains no fixed `4173` browser-test endpoint.
2. Invalid explicit ports fail before browser startup.
3. Visitor, meeting, and course workspaces can run their full three-scenario Playwright suites concurrently.
4. The packed fresh-application release gate still passes with the generated default port.
