---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-compiler": minor
"openxiangda-cli": minor
"openxiangda-mcp": minor
"openxiangda-nest": minor
"openxiangda-admin": minor
"openxiangda-skill-kit": patch
"openxiangda-testing": patch
"openxiangda-workflow": patch
"create-openxiangda": minor
---

Split the Native local runtime from remote delivery. Remote deployments now have exactly two environments: application provisioning atomically returns their stable UUIDs, AppPackages deploy only to preproduction, the same immutable AppVersion promotes only to production, and rollback targets either remote environment. Local Admin, NestJS, Data, OAuth2, Secret, Event and Workflow fixtures use the non-deployable `local` runtime mode instead of pretending to be a remote development environment. `openxiangda dev` now supervises one workspace-scoped local session with dynamic ports, readiness checks, browser launch, persisted diagnostics, captured logs and process-group cleanup. Full mode runs the local platform as an independent loopback process shared by the browser and NestJS, while the explicit UI-only fallback remains non-persistent and ineligible as release evidence.
