# Disable Refine runtime telemetry

## Decision

- **Problem evidence:** An OpenXiangda application startup sends a GET request
  to `https://telemetry.refine.dev/telemetry`. Its decoded payload contains the
  enabled Refine providers, Refine version and registered resource count.
- **Objective:** OpenXiangda Web applications must make no Refine telemetry
  request during startup.
- **Capability owner:** `OpenXiangdaApplication` owns the single Refine runtime
  composition for every generated application and therefore owns this setting.
- **Stable invariants:** Application identity, authorization, Data API traffic,
  routes, resources and rendering behavior remain unchanged. Applications do
  not own or override the telemetry policy.
- **Affected contract:** The `openxiangda/react` runtime now always passes
  `options.disableTelemetry: true` to Refine. No application declaration or
  platform API contract changes.
- **Failure and concurrency:** The setting removes one fire-and-forget external
  image request. It adds no state, retry, queue or concurrency behavior.
- **Security and resource bounds:** No startup metadata leaves the application
  through Refine telemetry, and one external network request is eliminated.
- **Blast radius:** Only OpenXiangda 2.0 applications using the canonical React
  runtime are affected. Stable 1.x applications, tenant data and production
  platform services are outside the change.
- **Rollback:** Revert the runtime option and its regression assertion.
- **Verification:** The package test asserts that the sole canonical Refine
  instance receives the fixed option; type checking and the affected-package
  gate must pass. Browser acceptance verifies that no request to
  `telemetry.refine.dev` appears during application startup.
