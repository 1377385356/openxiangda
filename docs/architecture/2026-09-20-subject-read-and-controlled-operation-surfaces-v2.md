# Subject Read and Controlled Operation Surfaces V2

Date: 2026-09-20

Status: approved 2026-09-20; Batch A implemented and verified (unpublished and undeployed)

Approved decisions:

- Use generic platform contracts; do not encode contract-management or Tianyin domain
  behavior in the platform.
- Provider terminal-state reconciliation is a `controlled` operation with required
  idempotency. The application backend remains the owner of provider queries, the
  state machine, and compare-and-set persistence.
- External-file intents default to a five-minute TTL and a 100 MiB maximum.
- Reconciliation can be initiated only after the platform proves that the current
  user can read the parent subject record.

## 1. Problem evidence

The contract-management V3 application exposed three related gaps while building a
read-only contract detail page for a contract handler:

1. The user can read a `contracts` row through the existing Native row policy, but
   cannot read `contract-signings`, `contract-signers`, or `contract-documents`
   through that relationship without receiving global read capability on those
   resources.
2. `contract-documents` contains external `controlledFileId` metadata rather than a
   Native managed-file field. Native managed-file content and preview routes therefore
   cannot authorize or serve the external file.
3. A signing attempt with `SIGN_PROVIDER_STATUS_AMBIGUOUS` requires an authoritative
   provider query that may persist a terminal result. The application already owns the
   reconciliation logic, but the browser runtime has no declared, typed, capability-
   checked operation surface for invoking it.

Current platform evidence:

- Native Data API read and managed-file content already enforce current-user resource,
  field, and row authorization.
- `authz.relationshipGrantSources` materializes explicit user/role-to-record grants;
  it does not mean “if a parent row is readable, every child row referencing it is
  readable.” Using it for this case would require duplicating one grant row per user
  and child record.
- The application API gateway already delegates the current user to the active backend
  with a short-lived signed invocation. It forwards a runtime path, but the browser
  package does not expose a declared operation catalog or typed operation executor.
- Native managed-file preview is already safe for actual `file`/`image` fields. An
  external text identifier is not a Native file and must not be passed to that route.

This is a generic platform contract gap. The platform must not add contract-, signing-,
Tianyin-, or `controlledFileId`-specific code.

## 2. Capability owners and invariants

| Concern | Authoritative owner | Stable invariant |
| --- | --- | --- |
| Current user, role union, capabilities, and row visibility | Platform authorization service | A browser cannot expand authority with request fields, query parameters, or page state. |
| Parent-to-child read projection | Platform Native Data API | Child rows are readable only through a declared surface after the parent row is proven readable for the same user and environment head. |
| Provider status interpretation and state transition | Application backend | The platform never interprets provider states or writes application business state directly. |
| External controlled-file lookup and byte source | Application backend or declared source adapter | Internal storage identifiers never cross into browser data contracts. |
| Short-lived browser access intent | Platform gateway | The intent is opaque, user/session bound, purpose bound, environment-head bound, and expires quickly. |
| Application operation declaration and schema | Active immutable AppVersion | The browser can execute only an operation exposed by the active version and authorized for the current role union. |
| Idempotency and operation receipt | Platform gateway plus application backend | A controlled operation cannot be retried as an untracked second mutation. |

No second identity store, authorization store, business state store, or signing state
machine may be introduced.

## 3. Rejected designs

### 3.1 Grant global child-resource read and filter in React

Rejected. It exposes unrelated contracts through the API and makes the page the only
authorization boundary.

### 3.2 Treat parent visibility as an implicit transitive grant everywhere

Rejected. Unbounded transitive joins are difficult to audit, can cycle, and can change
the meaning of every existing resource query. The relationship must be explicit,
read-only, bounded, and scoped to a named surface.

### 3.3 Put one relationship-grant row behind every child record

Rejected for this use case. `relationshipGrantSources` remains correct for explicit
business grants, but materializing user-by-child duplicates would create high write
amplification and stale revocation windows.

### 3.4 Let the browser call an arbitrary application gateway path

Rejected as the public contract. The existing raw gateway remains an internal
transport. A browser-facing SDK must resolve an operation from the active declaration,
check capability and risk policy, validate schemas, and return a stable receipt.

### 3.5 Describe provider reconciliation as read-only

Rejected. Querying the provider may persist a new terminal fact. It is a controlled,
idempotent operation, even when the external HTTP method is GET.

### 3.6 Expose `controlledFileId` or a long-lived provider URL

Rejected. The browser receives only a short-lived platform intent. The application
backend resolves the record to its internal file locator after the intent is validated.

## 4. Proposed public contracts

### 4.1 Subject read surface declaration

Add `data.subjectReadSurfaces` to the V2 application declaration. A surface is an
explicit, bounded read projection rooted at one subject record:

```ts
{
  code: 'contract-signing-detail',
  name: '合同审批与签署只读详情',
  capability: 'app:contract-mgmt-v3:surface:contract-signing-detail:read',
  subject: {
    resourceCode: 'contracts',
    fields: ['contractNo', 'status', 'signingStatus', 'currentSigningAttemptId']
  },
  relations: [
    {
      code: 'signing-attempts',
      resourceCode: 'contract-signings',
      foreignKeyField: 'contract',
      fields: ['attemptNo', 'status', 'providerEnvironment', 'failureCode',
        'failureMessage', 'submittedAt', 'confirmedAt', 'signerSnapshot'],
      order: [{ field: 'created_at', direction: 'desc' }],
      limit: 50
    }
  ]
}
```

Contract rules:

- One subject resource, at most eight relation sections, at most 100 rows per section,
  and at most 400 related rows per response.
- A relation is a direct equality from a declared child field to the subject record ID.
  No arbitrary SQL, recursive traversal, client-supplied fields, or client-supplied sort.
- All selected fields must be declared and readable by the surface. Hidden fields are
  rejected unless explicitly allowed by a separate server-only projection flag; that
  flag is not part of the initial browser contract.
- The caller needs the surface capability and ordinary read access to the subject
  resource. The subject record must pass the current user's normal row predicate.
- Child-resource global read capability is not required. The surface declaration is
  the narrowly bounded child-read grant, and only the declared fields and equality
  relation are available through it.
- The server evaluates the subject proof and all relation reads in one repeatable-read
  transaction against one environment head.
- The response contains `schemaVersion`, `surfaceCode`, subject identity/revision,
  sections, per-section truncation metadata, and `environmentHeadRevision`. It never
  contains physical table names or authorization predicates.
- The default cache policy is `private, no-store`. Optional ETag support may use subject
  revision plus related maximum revision, but must never weaken authorization checks.

Endpoint and SDK:

```text
GET /openxiangda-api/v2/applications/:appCode/native/subjects/
    :subjectResourceCode/:subjectId/surfaces/:surfaceCode

loadSubjectReadSurface(subjectResourceCode, surfaceCode, subjectId, { signal })
```

The endpoint is generic. Contract V3 may later declare three related sections for
signing attempts, signers, and documents. Desensitized event data is ordinary declared
output data; the platform does not interpret signing events.

### 4.2 Browser operation exposure

Extend a backend operation declaration with an optional `browser` block:

```ts
browser: {
  exposure: 'authenticated',
  behavior: 'read' | 'controlled',
  idempotency: 'none' | 'required',
  subject: {
    resourceCode: 'contracts',
    inputField: 'contractId'
  },
  refreshTargets: [
    { kind: 'subject-surface', code: 'contract-signing-detail' }
  ]
}
```

Rules:

- `browser` is additive. Existing operations remain non-browser operations.
- The platform returns only operations whose declared capability is present in the
  current user's role union.
- A declared subject causes the platform to prove that the current user can read the
  supplied subject record before forwarding the request.
- Request and response bodies are validated against the immutable operation schemas at
  the gateway boundary. Unknown keys and oversized bodies fail closed.
- `controlled` requires a caller idempotency key. The platform forwards a platform-
  owned invocation ID and records a bounded receipt. Backend idempotency remains
  mandatory because the provider call and business transaction are backend-owned.
- Same-origin browser checks and CSRF protections apply. Cookie-authenticated cross-site
  calls fail before backend forwarding.
- The result includes a stable `operationId`, `replayed`, `changed`, declared
  `refreshTargets`, and the schema-validated application result. Provider error details
  are mapped to declared stable error codes; secrets and upstream payloads are removed.

Endpoints and SDK:

```text
GET  /openxiangda-api/v2/applications/:appCode/native/operation-surfaces
POST /openxiangda-api/v2/applications/:appCode/native/operation-surfaces/
     :operationCode/execute

loadApplicationOperationSurfaces()
executeApplicationOperation(operationSurface, input, { idempotencyKey, signal })
```

Contract V3 may later expose signing reconciliation as `controlled` and `required`.
The application backend continues to own provider querying, comparison, state-machine
validation, and persistence. Starting a new signing attempt remains forbidden while an
ambiguous active attempt is unresolved.

### 4.3 External controlled-file access intent

Native managed files continue using the existing authorized content and preview routes.
No new intent is required for those files.

For backend/external files, add a `fileIntent` specialization to browser operations:

```ts
browser: {
  exposure: 'authenticated',
  behavior: 'read',
  subject: { resourceCode: 'contracts', inputField: 'contractId' },
  fileIntent: {
    recordResourceCode: 'contract-documents',
    recordIdInputField: 'documentId',
    relationField: 'contract',
    purposes: ['preview', 'download'],
    maxTtlSeconds: 300,
    maxBytes: 104857600
  }
}
```

Issuance rules:

1. Prove current-user access to the subject row.
2. Prove the document record belongs to that subject through the declared relation.
3. Issue an opaque token bound to tenant, app, environment head, operation code,
   current user, login session, document record ID, purpose, and expiry.
4. Return only platform URLs plus `expiresAt`, `fileName`, `contentType`, and size. Do
   not return the external locator.
5. On use, revalidate the session and current authorization digest, then forward the
   document record ID and purpose to the active application backend. The backend resolves
   the current external locator and streams the bytes.

The token must be authenticated and opaque. It may be encrypted and self-contained;
the initial contract does not require a second durable token store. Preview/download
responses use `Cache-Control: private, no-store`, `Vary: Cookie, Authorization`,
`X-Content-Type-Options: nosniff`, a restrictive preview CSP, and a sanitized
`Content-Disposition`. Redirects and long-lived provider URLs are forbidden.

The dedicated streaming route must not reuse the current 20 MiB buffered application
gateway path. It needs bounded streaming, a declared maximum size, timeout/backpressure,
disconnect cancellation, and per-user/app rate limits.

## 5. Failure and concurrency behavior

- Missing surface/operation in the active head: `404 ..._NOT_DECLARED`.
- Missing capability or unreadable subject: `403 ..._FORBIDDEN`; do not reveal whether
  the child record or external file exists.
- Head changed between catalog load and execution: `409 ..._HEAD_CHANGED`; reload the
  surfaces before retrying.
- Required idempotency key absent: `400 ..._IDEMPOTENCY_REQUIRED`.
- Same key with different input digest: `409 ..._IDEMPOTENCY_CONFLICT`.
- Provider timeout or unavailable backend: stable `503`, retryable only when the
  declaration permits it. A controlled operation retry reuses the same key.
- Terminal reconciliation races use backend CAS. One result wins; a loser returns the
  existing receipt/state and must not create a second attempt.
- Expired, wrong-user, wrong-purpose, or stale-head file intent returns 403 without
  forwarding to the backend.
- Subject surfaces never degrade to global child-resource queries and never return
  partial unauthorized sections. Declaration/configuration errors fail the surface.

## 6. Security and resource bounds

- No browser-provided resource code, field list, runtime path, or provider locator.
- Exact schema validation at compile, publish, catalog, and execution boundaries.
- Bounded relation count, row count, JSON bytes, operation body size, file size, request
  time, and concurrent streams.
- Subject read and intent issuance are audited with user, app, environment head,
  surface/operation code, subject ID digest, decision, and request ID. File IDs, tokens,
  provider payloads, and secrets are not logged.
- Application backend receives a short-lived delegated user identity plus a platform
  assertion. It must not accept direct unauthenticated provider-status or file routes.
- Existing V1 applications and V2 applications without the new declarations retain
  byte-for-byte existing behavior.

## 7. Delivery batches and rollback

### Batch A: subject read surfaces

- Contracts/schema/compiler and declaration docs.
- Platform-server compilation/persistence and Native read endpoint.
- Browser SDK and type exports.
- Allow/deny, hidden-field, truncation, stale-head, and cross-tenant tests.

Rollback: stop declaring surfaces or revert the additive endpoint/package version.
No migration of business rows is required.

### Batch B: browser operation catalog and execution

- Additive operation declaration fields.
- Current-user capability/subject authorization at the gateway.
- Request/response validation, idempotency receipt, and typed browser SDK.
- Real Nest reference operation with allow/deny and replay tests.

Rollback: operations without `browser` remain unavailable; declared operations can be
removed in a later AppVersion. Existing raw gateway behavior is unchanged.

### Batch C: external file intents and streaming

- Opaque intent issue/verify contract.
- Bounded streaming gateway and security headers.
- Reference backend resolver and browser preview/download helpers.
- Expiry, revocation, stale-head, size, disconnect, traversal, and filename tests.

Rollback: remove the file-intent declaration. Metadata remains readable, and buttons
return to an explicit unavailable state. External files are not copied or deleted.

Application adoption is a later, separate release. It must not be mixed into these
platform commits.

## 8. Implementation status

### Batch A — implemented, not yet published or deployed

- `openxiangda-contracts` now carries the additive subject-surface declaration and
  response types plus bounded configuration and contract bundle schemas.
- `openxiangda-devkit-core` validates resource, field, relation, capability, ordering,
  per-section, and total-row invariants before producing deterministic bundles.
- Platform Server reads the declaration from the active immutable contract, proves
  normal parent capability, field access, and row policy in a repeatable-read read-only
  transaction, then executes only the fixed equality projections. Missing or unreadable
  parents share the same 403 result, and child global read capability is not granted.
- The sensitive cookie-authenticated GET requires an affirmative same-origin browser
  signal before opening a data transaction. Bearer-authenticated callers retain the
  existing verified-source exemption.
- `openxiangda` exports `loadSubjectReadSurface`; callers provide only parent resource,
  surface code, parent ID, and optional cancellation signal.
- The change adds no database migration and does not modify application business rows.
  npm publication, Platform Server dependency alignment, and test-environment rollout
  remain separate release steps.
- Verification passed: toolchain `pnpm verify:affected` completed 24/24 tasks;
  Platform Server build passed; the focused service/controller suites passed 36/36
  tests, including cross-site rejection before any data transaction.

### Batch B — implemented, not yet published or deployed

- Backend operations can opt into an authenticated browser catalog as either `read`
  with no idempotency key or `controlled` with a required idempotency key. Every
  declaration binds one required UUID request field to a declared parent resource and
  can name only subject-read refresh targets owned by that same parent.
- The browser SDK lists only capability-visible operations from the active immutable
  AppVersion and executes an operation by code plus the expected AppVersion/Head. It
  never accepts a runtime path, capability, parent resource, or refresh target from the
  caller.
- Platform Server revalidates the contract/configuration closure, same-origin and CSRF
  proofs, published current-user role union, ordinary parent read capability and RLS,
  request/response schemas, and the active backend target before dispatch. Connected
  Dev projections cannot widen this authorization path.
- Controlled execution serializes the actor/operation/idempotency tuple with a
  transaction advisory lock, forwards a platform-derived backend idempotency key, and
  stores one append-only receipt containing digests, declared refresh targets, and the
  schema-validated result. A repeated key replays the same receipt; a different input
  digest fails with a conflict before backend dispatch.
- The additive SQL migration is verified but has not been executed. Verification passed:
  toolchain `pnpm verify:affected` completed 24/24 tasks; Platform Server build and SQL
  migration verification passed; the focused catalog/execute, controller, and gateway
  suites passed 52/52 tests, including allow/deny, unreadable subject, stale Head,
  request/response failure, refresh-owner closure, replay, conflict, and sanitized
  dispatch behavior.
- No npm package was published, no Platform Server image was released, no customer
  environment was deployed, and no database migration or application business change
  was executed. Batch C file intents and bounded streaming remain pending.

## 8. Falsifiable verification

The platform work is not complete unless all of the following pass:

1. A contract handler can load the declared subject surface for one contract they can
   read, including only related attempts, signers, and document metadata.
2. The same handler receives 403 for another user's contract, and the response does not
   reveal which related records exist.
3. A handler without global child-resource read still succeeds through the surface;
   direct child-resource queries remain denied.
4. An administrator's existing direct Native queries remain unchanged.
5. A controlled reconcile operation checks subject visibility, accepts one idempotency
   key, replays it without a second provider call, persists at most one terminal
   transition, and returns declared refresh targets.
6. A new signing attempt stays forbidden while reconciliation is ambiguous or failed.
7. A file intent contains no external locator, expires within five minutes, fails for a
   different user/session/purpose/head, and is reauthorized before streaming.
8. Preview/download uses bounded streaming and security headers; oversized content and
   disconnects terminate without buffering the entire file in platform memory.
9. Contract V3 can consume the public SDK without adding a direct dependency on a
   platform-private package or constructing `/service` URLs by hand.
10. Full affected platform gates, packed-package browser tests, and one real
    preproduction allow/deny acceptance pass before release.

## 9. Approval questions

1. Confirm that the reusable generic platform contract above is preferred over a
   contract-specific endpoint.
2. Confirm that provider reconciliation is a `controlled` operation, not a read-only
   operation, because it may persist terminal state.
3. Confirm the default external file limits: five-minute intent TTL and 100 MiB maximum
   streamed content.
4. Confirm that contract handlers may request reconciliation only for contracts already
   readable through the parent row policy; administrators retain their existing wider
   access.

No runtime implementation or customer-server deployment should begin until these
decisions are approved.
