# Anonymous public draft access v2

Status: confirmed for implementation on 2026-08-30

## Decision

- Problem evidence: OpenXiangda 2.0 runtime and Native Data API currently require a
  logged-in platform user. Public forms can neither safely resume a partially
  completed submission nor upload files without accidentally exposing the general
  list/detail/query surface. A browser fingerprint or IP address is not a stable or
  secret identity and cannot be used as an authorization credential.
- Capability owner: Platform Server owns anonymous browser credentials, public
  sessions, drafts, validation, file ownership, final submission and rate limits.
  The application declaration only selects an exact route, resource, fields and
  named validations. React never derives authority from local storage, IP address
  or fingerprint data.
- Stable invariants:
  1. an anonymous principal means the current holder of one platform-issued browser
     credential, not a verified natural person;
  2. the credential is a 256-bit random HttpOnly host-only cookie and only its hash
     is persisted;
  3. public callers may list and read records whose immutable `created_by` equals
     the current anonymous subject and whose submitted-draft receipt belongs to
     the current live public policy, but have no cross-subject list, arbitrary
     filter, arbitrary detail, update or delete capability;
  4. a public route can access only its current active draft, its own submitted
     records and the exact named validation declarations;
  5. final submission repeats all required-field and duplicate guards inside the
     same transaction that creates the business record;
  6. IP address and user-agent/fingerprint-like signals are audit and rate-limit
     inputs only. They never recover, merge or transfer ownership;
  7. internal current-user authorization and anonymous public authorization remain
     separate fail-closed entry points.
- Affected contracts: `frontend.publicAccess` in `ConfigurationBundleV3`; the
  configuration JSON schema and compiler; platform runtime configuration mirror;
  anonymous public HTTP and browser-client contracts; managed-file ownership and
  the platform SQL schema.
- Failure and concurrency: draft writes require `expectedRevision` CAS and return
  409 on stale writers. One partial unique index permits only one active draft for
  `(tenant, app, environment, policy, browser subject)`. Submission requires an
  idempotency key, locks the draft, repeats named duplicate guards, creates the
  business row and marks the draft submitted in one database transaction. Any
  failure leaves the active draft resumable and creates no business row.
- Security and resource bounds: default browser/draft inactivity TTL is 30 days;
  one active draft per public policy; draft JSON is at most 256 KiB; session
  bootstrap and draft endpoints use bounded inputs and deny undeclared fields;
  validation returns only a configured boolean outcome and never record ids,
  values, counts or timing-dependent detail. The first contract supports at most
  16 policies per application, 64 fields and 16 validations per policy. Rate
  limiting is fail closed and uses both a browser-subject bucket and a coarser
  network bucket within each tenant, app and operation, so rotating the anonymous
  cookie does not remove all abuse bounds. CAPTCHA is an additive future control,
  not an identity source.
- Rollback boundary: removing or disabling a public policy in a later application
  version immediately blocks new public sessions, draft reads/writes, validation,
  upload and submission. Existing drafts and unreferenced objects remain inaccessible
  and expire through bounded cleanup. Internal application routes and Native Data
  API contracts are unchanged. The additive schema can remain during binary
  rollback; it is dropped only after public traffic is stopped and draft/file
  retention has drained.
- Falsifiable verification: an unauthenticated declared public route renders; the
  same browser resumes exactly one draft and can page through and read only the
  formal records it submitted; a new browser sees an empty own-record collection
  and cannot read the first browser's records; caller-selected filters and
  cross-subject detail fail; stale revisions conflict; undeclared fields and validation
  codes fail; duplicate preflight discloses no data and final concurrent duplicate
  submissions admit at most one; draft-owned uploads cannot be attached by another
  browser; clearing the cookie loses access; disabling the policy fails closed;
  existing authenticated CRUD and managed-file tests remain green.

## Configuration contract

Public authority is an explicit part of the immutable application version:

```ts
frontend: {
  routes: [
    { code: "visitor-apply", path: "/visitor/apply", surface: "user", ... }
  ],
  publicAccess: {
    policies: [{
      code: "visitor-apply-public",
      routeCode: "visitor-apply",
      mode: "anonymous",
      resourceCode: "visitor-reservations",
      operations: [
        "draft.read", "draft.update", "validate", "create",
        "own.list", "own.read"
      ],
      fields: ["name", "mobile", "visitDate", "photo"],
      requiredFields: ["name", "mobile", "visitDate", "photo"],
      draft: {
        enabled: true,
        inactivityTtlSeconds: 2_592_000,
        maxBytes: 262_144
      },
      validations: [{
        code: "identity-unused",
        kind: "duplicate",
        fields: ["identityNumber"],
        result: "availability"
      }]
    }]
  }
}
```

Compiler rules are deliberately narrow:

- `routeCode` must resolve to one static user route; authentication surfaces and
  dynamic/wildcard routes cannot be public.
- `resourceCode` and every field must resolve in the same immutable bundle.
- operations are an allow-list; the first version accepts only `draft.read`,
  `draft.update`, `validate`, `create`, `own.list` and `own.read`.
- `requiredFields` is a subset of `fields`. Progress is the number of required
  fields with a non-empty value divided by the declared count; the
  browser cannot submit its own percentage.
- each duplicate validation uses only its declared field tuple. It cannot supply
  an arbitrary query, projection, order, count or page size.
- draft resumption requires both `draft.read` and `draft.update`; final submission
  requires `create`; submitted-record history requires `own.list`, and opening one
  item requires `own.read`.

## Browser credential and public session

The public bootstrap endpoint resolves the exact deployed route and policy before
issuing authority. It generates a 32-byte random browser secret when the host-only
cookie is absent, derives an application-scoped subject id using a server-side
pepper, and persists only a non-reversible hash. HTTPS uses a Secure HttpOnly
SameSite=Lax cookie. Explicit insecure local development uses a separately named
non-Secure cookie; request headers never downgrade the policy.

The production `/view` gateway continues to expose the immutable SPA shell and its
hashed build assets, as it already does for application login. That does not grant
data authority: the runtime establishes an anonymous session only when the current
path exactly matches a declared public route, and all draft, validation, file and
record access still goes through the dedicated policy-scoped endpoints. The
preproduction `/dev` gateway additionally admits only the exact public route or a
bounded hashed asset path resolved by the platform middleware.

The secret proves only possession by the same browser profile. Cookie deletion,
private browsing, another browser or another device creates another anonymous
subject and there is no recovery. A later WeChat or DingTalk identity design may
claim or merge a draft through a separate audited contract; this version never
guesses such a relationship from IP, user-agent or fingerprint similarity.

The public access token/cookie is short lived and restricted to the dedicated
anonymous endpoints. `JwtMiddleware` must not turn it into a normal platform user
or accept it on internal Data API routes.

## Draft lifecycle

`app_anonymous_public_drafts_v2` is the sole partial-data store. It contains the
environment/application version and head revision that granted the draft, policy
and resource codes, browser subject hash, bounded JSON values, monotonic revision,
status, expiry and final record id. It never becomes an alternative business data
table: only `active` drafts can change and `submitted` drafts cannot be reopened.

The dedicated surface is intentionally non-RESTful with respect to arbitrary
records:

- bootstrap the exact route policy;
- get-or-create `current` draft;
- save `current` with expected revision;
- run one named validation against current/proposed declared fields;
- upload/complete a file bound to the current draft and declared file field;
- submit `current` with expected revision and idempotency key;
- page through own submitted records using a platform cursor and fixed server order;
- read one own submitted record by id after the server applies the anonymous owner
  predicate.

No endpoint accepts a caller-selected draft id. The own-record detail endpoint may
accept a record id, but the database authorization function requires all of: the
requested id, the current anonymous subject's immutable `created_by`, and a
submitted-draft receipt for the current live policy. A miss returns the same 404
for absent, other-owned, or other-policy records. The own-record collection accepts
only a bounded cursor and page size. It does not accept where/order/projection/count
expressions, so the browser cannot turn ownership access into general Data API
query authority.

Final create attributes the business record as
`created_by = anonymous:<application-scoped-subject-id>`. That value never comes
from form data. Own list/detail always inject the same server-derived value. The
application may configure which declared fields are returned, but cannot expose
system ownership values or use a client filter to widen scope. Submitted records
are kept even after the browser credential expires or a public policy is replaced;
they simply become unreachable from the anonymous surface unless the same policy
is active or a later, separately designed verified-identity claim flow transfers
them.

Expiry is sliding but bounded: successful declared draft access may extend it up to
the policy TTL; unauthenticated probes and validation failures do not. Cleanup uses
leases and batches, first marks expired drafts and associated unreferenced files, then
uses the existing managed-file deletion worker. It never deletes submitted business
records.

## Duplicate validation and final submission

Preflight validation is a convenience signal, not a uniqueness guarantee. The
server normalizes declared field values with the resource schema, applies the exact
deployed named validation and returns only:

```json
{ "code": "identity-unused", "result": "available" }
```

Invalid or incomplete input returns a generic validation outcome without disclosing
whether another record exists. Responses must not contain matching ids, field
values, counts or query errors. Rate-limit outcomes are likewise generic.

Final submission locks the draft and executes the same duplicate predicate as a
`query-empty` guard together with the Native Data create operation. Required-field
validation, file ownership/binding, guard evaluation, create, draft status change
and idempotency receipt commit atomically. A unique database constraint remains the
preferred last line of defence for rules that are true domain uniqueness; named
validation does not replace it.

## Managed files

Anonymous upload initiation requires an active current draft and a declared file
field. Managed-file metadata records the anonymous principal plus the draft id; the
object key is never accepted from the browser. Complete, attach and cleanup
revalidate the live policy, draft status, field, subject and environment.

On final submission, only ready files owned by the same anonymous subject and draft
may be normalized and bound. Transaction rollback leaves them attached to the
active draft; draft expiry moves them into existing orphan cleanup. Public buckets,
anonymous object-store credentials and filename-based ownership are forbidden.

## Explicitly not included

- identifying or verifying a natural person;
- cross-browser/device recovery or draft transfer;
- WeChat, DingTalk, SMS or email login;
- external self-registration or automatic platform-account creation;
- cross-subject list, search, caller-defined filters/projections/order/count,
  other-owned detail, update or delete;
- fingerprint/IP-derived ownership or silent draft merging;
- application-defined SQL, arbitrary filters or record-disclosing validation.

## AI discoverability and release closure

The capability is not complete when only runtime code and a buried frontend note
exist. The canonical `openxiangda-v2` Skill must route external-user, no-account,
anonymous/guest, public-form, resumable-draft, public-upload and own-record requests
to `references/public-access.md`. The same invariant is embedded in every generated
workspace `AGENTS.md`, while `docs/public-access.md` and `docs/llms.txt` provide the
developer and AI documentation entrypoints.

Release verification must fail if the Skill route, required nested reference,
workspace agent contract, generated template copy or documentation inventory drifts.
The packed `openxiangda` artifact must carry the reference, and local Skill install
acceptance must prove that the installed copy contains `frontend.publicAccess`,
`createAnonymousPublicClient`, `own.list` and `own.read` guidance.
