# Workflow named-operation submission surface v2

Status: accepted for implementation on 2026-09-02.

This decision extends
`workflow-launch-and-application-todo-surfaces-v2.md`. It does not change the
Workflow task, instance, detail, work-center or todo Surface contracts.

## Problem evidence

The existing standard launch page owns a Native Data create/update mutation and
atomically seals that mutation with a compiler-generated
`openxiangda.workflow.<workflowCode>.submit` process operation. That contract is
correct only when the platform Native Data API is the business mutation owner.

Action-owned applications already expose named operations that validate
identity, related records, time windows, conflicts, quotas and application
state before atomically committing the business record and optional Workflow
intent. Sending those workflows through the Native mutation launch path would
bypass the authoritative operation. Keeping them `work-center-only`, however,
means the compiler cannot expose the standard desktop and mobile submission
routes.

The standard launch contract must therefore separate two decisions:

- `launch.mode` owns route visibility (`standalone`, `hidden-handoff`,
  `custom-page` or `work-center-only`);
- `launch.submission` owns how the standard route submits business data.

## Capability owner and public contract

- The application named operation remains the only owner of business
  validation, mutation, idempotency and conditional approval. The standard
  React page never recreates those rules and never writes the subject directly.
- A `standalone` or `hidden-handoff` workflow may declare a
  `named-operation` submission. An absent submission retains the existing
  compiler-owned `standard-process` behavior.
- A named submission declares independent `create` and `existing` intents. At
  least one is required. Each intent references one POST named operation and
  binds every required top-level request property to exactly one bounded source:
  a subject form field, platform-generated idempotency key, current-user
  reference, selected subject id, selected subject revision or current request
  time.
- Each intent declares top-level response properties for the authoritative
  subject id, optional subject revision and optional durable process command.
  A missing or null process command is a valid `completed-without-workflow`
  outcome; the standard page must not synthesize a Workflow instance.
- Explicit context declarations map allowlisted query parameters such as
  `activityId`, `clubId` or `venueId` to declared form fields. Resource-reference
  values are resolved through the authoritative Native Data read API before
  being placed in the form. Undeclared parameters are ignored.
- The compiler resolves the named operation method, application API path,
  capability and request/response schema digests into the immutable Native
  contract. The Workflow launch Surface projects only that sealed resolution.
- The route manifest continues to expose
  `/workflows/:workflowCode/start` and
  `/m/workflows/:workflowCode/start`; consumers continue to use
  `workflowLaunchPath` rather than duplicating paths.
- Both launch routes are standalone authenticated user pages. Desktop never
  mounts the admin Shell, sidebar, breadcrumb, or history tabs; mobile never
  mounts an application-owned business header. Started-command navigation is
  projected from the generated Workflow instance route instead of a hard-coded
  admin path.

## Stable invariants

1. `custom-page` and `work-center-only` never acquire a standard launch route
   merely because an operation exists. Applications opt in with
   `standalone` or `hidden-handoff` plus the named submission declaration.
2. A named submission operation must exist in the same immutable application
   contract, use POST, and declare `platformAccess.workflow.codes` containing
   the target workflow. The compiler and platform launch Surface both verify
   that relationship.
3. The generated route capability is the selected named operation capability.
   The same-origin application API gateway still performs authenticated
   capability, request-schema and business-action checks at execution time.
4. The standard page generates the idempotency key. Query parameters, form
   values and application code cannot replace it. Repeated UI submission reuses
   one in-flight promise and the named operation remains the replay authority.
5. `create` never binds selected subject identity or revision. `existing`
   requires both, loads the record through the authorized Data API and forwards
   its exact positive revision to the named operation.
6. Form fields are rendered only from the subject resource's generated field
   Surface. Every bound field and context target must exist and be non-system;
   arbitrary JSON request editors are not generated.
7. The page may synthesize a current-user display reference only from the
   authenticated `SubjectProfile`. The named operation derives and validates
   the real initiator on the server and must not trust the display snapshot as
   identity authority.
8. A returned process command is accepted only when its schema, application,
   environment, workflow code and subject id match the launch Surface and named
   operation result. Polling/retry/awaiting-input behavior then reuses the
   existing `ProcessCommandSurface` lifecycle.
9. A completed-without-workflow result is rendered as business submission
   success and may link to the standard subject detail route. It is never
   reported as a started or approved Workflow.

## Failure, concurrency, security and bounds

- Compilation fails for an unknown operation, GET/destructive transport,
  missing workflow platform access, duplicate input source, unmapped required
  request property, unknown/system subject field, invalid context parameter or
  response-property mismatch.
- The launch Surface fails closed if the active Workflow Head and Native Head
  disagree or the sealed operation contract cannot be resolved exactly.
- Context declarations are bounded to 16 entries. Query names, field codes and
  values are length bounded; only the first value is consumed. Reference
  prefill performs one authorized record read per unique declared field.
- Existing-record search uses the subject resource's generated searchable/list
  Surface with bounded pages. Selecting a record reloads its current revision;
  stale revisions remain a named-operation conflict, not an automatic retry.
- The browser disables duplicate submission while one request is in flight.
  Network failure never falls back to a Native Data mutation or direct Workflow
  start.
- Request and response mappings are top-level in this protocol version. Nested
  JSON Pointer mappings require a later reviewed contract rather than implicit
  path interpretation.

## Affected contracts

- native Workflow launch declaration and compiled Workflow contract;
- configuration validation and route/admin-page compiler;
- generated workflow definitions and route manifest;
- public Workflow launch Surface schema and browser/NestJS clients;
- platform Workflow launch Surface projection;
- standard desktop/mobile Workflow submission page;
- OpenXiangda Workflow documentation, templates, tests and Changesets.

No SQL migration is required. OpenXiangda 1.x remains outside this contract.

## Rollback boundary

The change is additive for existing applications. Workflows without
`launch.submission` retain the exact standard-process path. Removing a named
submission declaration (or restoring `work-center-only`) removes its generated
routes on the next application build without changing business records or
Workflow instances. Rolling back the platform server and package train removes
the new Surface projection; already accepted named-operation commands remain
owned by the application and durable business-process services.

## Falsifiable verification

1. Compiler tests cover create-only, existing-only and create-or-existing named
   submissions, exact generated PC/mobile launch routes, operation capability,
   context mapping and all fail-closed declaration errors.
2. Launch Surface tests prove exact active operation resolution and rejection of
   missing workflow access, non-POST operations, stale/mismatched Heads and
   nonstandard launch modes.
3. Browser tests prove form binding, authoritative context prefill,
   current-user/idempotency injection, existing-record revision forwarding,
   duplicate-submit suppression and named-operation error display.
4. Browser tests prove both returned durable-command polling and the explicit
   completed-without-workflow result without calling `standard-commands`.
5. Existing standard-process launch, task/instance detail, custom detail routes,
   work center and application todo suites remain green.
6. Packed reference installation and `pnpm verify:release` pass before package
   publication; platform server focused tests and release gates pass before
   deployment.
