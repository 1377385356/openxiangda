# OpenXiangda 2.0 explicit AI actions and stable aggregate MCP

## Problem evidence

- The compiler currently exposes every backend operation as an AI action and
  infers risk from the HTTP method. A backend route is not automatically a safe
  or meaningful AI capability.
- Generated create schemas describe the record fields directly, while the
  platform preview executor expects a nested `data` object. The published
  contract and runtime therefore disagree.
- Generated mutation confirmation calls single-record endpoints and does not
  use the canonical idempotent Data Transaction path.
- The aggregate MCP registers one tool per capability. Tool count grows with
  every application and resource instead of presenting a stable platform
  protocol to the outer AI.

## Capability owners and invariants

- An application operation is exposed to AI only when its source declaration
  contains an explicit `ai` block. The application owns its business meaning,
  schemas and handler; the platform owns discovery, current-user authorization,
  preview/confirmation, version binding and invocation routing.
- Generated CRUD remains derived only from active resource declarations. Its
  field schemas are reduced by the exact read/create/update permissions; there
  is no `write` alias or legacy resource-code grammar.
- Every custom action publishes an immutable binding to one declared operation
  code, HTTP method and static application path. The platform never accepts a
  caller-supplied URL.
- Read actions execute immediately. All write, destructive and external
  actions require a short-lived one-use preview and a principal/Head-bound
  confirmation.
- Generated writes execute through the canonical idempotent Data Transaction.
  Custom writes carry a platform-generated idempotency key through the signed
  application gateway; the Nest handler rechecks its declared capability.
- The aggregate MCP exposes a fixed vocabulary regardless of application
  count: application search, resource description, record query/get/create/
  update/delete, custom action invocation and mutation confirmation.

There is no automatic backend exposure, inferred action risk, process-local
authorization shortcut or compatibility interpretation.

## Affected contracts

`AppApiOperationDeclaration.ai` contains the localized name/description,
explicit risk, touched resources, side effects, concurrency policy and timeout.
`AiCapability` custom actions contain an `app-api` binding; generated CRUD
contains `generatedFrom`. The two source kinds are mutually exclusive.

The application-scoped MCP may still expose the application's catalog as
individual tools. The platform aggregate MCP uses stable dispatch tools with
`appCode`, `resourceCode` or `capabilityCode` arguments and routes to the owning
catalog/executor without merging identities or permissions. It reloads the
current-user application set for every invocation, and confirmation carries
`appCode`; the adapter therefore stores neither a stale Catalog snapshot nor a
process-local preview routing table.

## Failure, concurrency, security, bounds and rollback

- Catalog publication rejects undeclared resources, missing capabilities,
  invalid risk/method combinations, mutable paths and unbounded schemas.
- Catalog reads filter custom actions against the current role-union
  capability set; application Gateway and Nest guards remain authoritative at
  execution time.
- Preview records are bounded to five minutes, one principal, one application,
  one AppVersion and one Head revision. They are consumed once.
- Query limits remain 100 rows, action timeouts 100 to 30000 ms and catalogs
  500 capabilities. The aggregate search returns at most 20 applications.
- The rollback boundary is the paired toolchain/platform commit. OpenXiangda
  2.0 has no compatibility mode.

## Falsifiable verification

1. A backend operation without `ai` never appears in the catalog.
2. An explicit custom action has the exact declared risk, resources, schemas
   and immutable app-api binding.
3. A generated create accepts the direct field object published by its schema
   and confirms through one Data Transaction idempotency key.
4. A custom write produces no side effect during preview and invokes only its
   bound route once after confirmation.
5. Changed Head, principal or capability prevents confirmation.
6. Aggregate MCP tool names and count remain constant as applications and
   resources are added.
