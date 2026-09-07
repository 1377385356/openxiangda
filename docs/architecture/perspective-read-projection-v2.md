# OpenXiangda 2.0 Perspective Read Projection

Status: approved for implementation on 2026-08-27.

## Problem evidence

OpenXiangda 2.0 now authorizes every interactive application request with the
current user's complete active application-role union. The retired
identity-switching contract conflicts with that model, but remnants still exist in packages,
platform endpoints, database schema, historical documentation, tests and AI
skills.

Applications still need a focused way for one multi-role user to view the
system as, for example, an instrument manager or a college manager. Implementing
that behavior as browser-only search conditions would make list, detail,
export, aggregate, selectors and NestJS-backed pages disagree. Restoring an
identity-switching credential would incorrectly turn a presentation concern back into a second
identity and authorization state.

## Capability owners

- The platform authorization kernel exclusively owns the current user's real
  identity and complete application-role union.
- The application declaration and compiler own stable Perspective definitions.
- The application Runtime owns the user's selected Perspective preference.
- Native Data API owns the authoritative read projection for standard data.
- The App API gateway transports the selected Perspective without treating it
  as a credential.
- `openxiangda/nest` exposes the verified request Perspective and makes the
  request-scoped Data Client inherit it.
- Custom NestJS code owns the semantics of direct SQL, external data and other
  reads that do not use the standard Data Client.

No second identity, authorization store or role-session lifecycle is allowed.

## Stable invariants

1. The real principal is always the current user's active application-role
   union. A Perspective never changes the user or grants a capability.
2. A Perspective is an optional read-only projection based on one or more roles
   the current user already has.
3. Effective standard reads are:

   `authorized user union AND Perspective projection AND caller query`.

4. Omitting a Perspective preserves the full authorized union.
5. A Perspective can only remove visible pages, fields or rows. It cannot make
   an unauthorized page, field or row visible.
6. The same projection applies to list, get/detail, export, aggregate, audit,
   reference sources and managed-file reads where those paths expose resource
   data.
7. Create, update, delete, workflow commands and custom business actions remain
   authorized by the full user union. Perspective-provided defaults are UX
   defaults, never write authorization.
8. Standard pages never reconstruct role filters in React. Existing role
   capabilities and data policies are projected by the compiler and Data API.
9. Application code never creates, restores, persists or transmits an
   identity-switching credential.

## Public contracts

Applications may declare Perspectives in `openxiangda.config.ts`:

```ts
perspectives: [
  {
    code: 'college-management',
    name: '学院管理员视角',
    roleCodes: ['college_admin'],
    default: true,
  },
  {
    code: 'instrument-management',
    name: '仪器管理员视角',
    roleCodes: ['instrument_admin'],
  },
],
```

The compiler validates referenced roles, permits at most one default and emits
a canonical Perspective contract containing the role basis and derived
capability projection. A Perspective may group multiple roles; roles and
Perspectives are not the same product concept.

The browser Runtime exposes the available and selected Perspectives and stores
only a user preference scoped by app, environment and user. The standard client
transports the selected code as `X-OpenXiangda-Perspective`. The header is
bounded, validated and included in the App API gateway assertion, but it is not
an authentication or authorization credential.

Native Data API resolves the code against the active application version and
filters the request's read memberships to the Perspective role basis. Existing
capability, field-policy and row-policy evaluation then produces the read
projection without duplicating business predicates.

## Page and custom-backend semantics

- Standard resource navigation is visible when the projected roles grant the
  resource read capability.
- Declared custom routes use their existing page capability as the projection
  input. Routes without a capability remain perspective-neutral.
- Action buttons continue to use the full runtime capability union.
- A request-scoped NestJS Data Client automatically forwards the Perspective
  for reads. Background/application-credential clients have no Perspective.
- Direct SQL and external reads must explicitly consume the request Perspective
  or declare themselves perspective-neutral; the platform cannot infer custom
  aggregation semantics.

## Failure, concurrency and cache behavior

- Unknown, malformed or unavailable Perspective codes fail with a stable 4xx
  protocol error; they never silently fall back to a broader read.
- A valid Perspective that has no read capability for a resource fails as a
  projection-unavailable read, rather than borrowing a capability from another
  role in the union.
- Runtime selection changes invalidate resource queries, reference lookups and
  page caches before rendering the next view.
- Perspective code and active app/authz revision participate in server and
  client cache keys. Responses may echo the applied Perspective for diagnostics.
- In-flight requests retain the Perspective captured when they started; their
  result is discarded if the Runtime selection changed meanwhile.

## Security and resource bounds

- Codes use the stable application-code pattern and are bounded to 128 bytes.
- Applications may declare at most 100 Perspectives, each referencing at most
  20 roles.
- The selected Perspective must be declared by the active app version and must
  intersect the current user's active roles. Super-admin behavior is explicit;
  it does not synthesize missing membership scope values.
- PostgreSQL RLS for the full user union remains active. The Perspective role
  subset is an additional read restriction, so malformed projections cannot
  expand access.
- Logs and audit metadata record Perspective codes only, never raw membership,
  scope or identity secrets.

## Identity-switching retirement boundary

Remove the retired switching contract from all OpenXiangda 2.0 public packages, templates, current
platform controllers/services, capability catalogs, active schema and current
documentation/skills. Published SQL migrations remain immutable audit history;
a later SQL migration retires live switching tables and obsolete nullable
columns after current Workflow/Data paths no longer depend on them. Stable 1.x
repositories and endpoints are outside this change.

## Rollback boundary

The package contract and platform implementation are independently reversible
before production activation. Rollback disables Perspective transport and
returns reads to the full role union. It must never restore identity switching.
Database retirement is a separate, explicit migration boundary and requires a
pre-migration dependency check.

## Falsifiable verification

1. Contract validation rejects duplicate/default-invalid/unknown-role
   Perspectives and produces deterministic bundles.
2. A two-role user without a Perspective receives the authorized union.
3. The same user under each Perspective receives only that role's page, field
   and row projection for query/get/export/aggregate/reference reads.
4. Search predicates only narrow the selected projection.
5. Write and workflow authorization remain the complete user union.
6. A tampered Perspective never expands access and fails closed when invalid.
7. App API gateway/Nest request context and request-scoped Data Client preserve
   the Perspective; background clients do not synthesize one.
8. Public package exports, templates, current docs and skills contain no usable
   identity-switching API or header instructions.
9. Repository retired-identity inventory contains only immutable migrations,
   explicitly superseded historical records and 1.x-owned code.
