# Authenticated public fields with scoped management reads

Status: accepted for local implementation under existing platform-repair and
function-equivalent migration authorization. One topic; independent of actor
transaction authority. No school or npm publication.

## Evidence and owner

ZJNU requires its existing authenticated catalogue fields to remain readable to
the baseline user, while maintenance private fields and management instrument
options follow college/current instrument-admin scope. The authoritative CLI
check b91fbb47-9d61-48b4-b8ba-ce7d0bde15cf correctly rejects baseline app-user in
unrestrictedRoleCodes. Native already filters a request's entire field set to
the same eligible membership before RLS; its compiled public projections are
therefore a supported runtime mechanism but cannot currently be declared with
explicit closed public-field intent. Do not replace the guard with a tautological
rule, duplicate baseline role, guessed scope list, anonymous API or app read proxy.

Platform UserUnion/Native own eligible memberships, Perspective and RLS.
The application owns its authenticated public business-field projection. This
does not make an anonymous endpoint or confer sensitive mutation/approval rights.

## Additive contract and invariants

Add dataPolicy.publicRead:{fields:string[]} for explicitly read-only policies
(operations exactly ['read']; no readExpression/writeBoundary). Its role is the
single declared authenticatedUserRoleCode; the application cannot supply an
actor, another role or a capability. Fields are unique declared business fields,
1–1000; subtable fields are unsupported and fail closed. All baseline-readable
business fields must appear explicitly. Every field outside the public list must
already deny the baseline through its authoritative read policy: read:false or
at least one declared required capability absent from that role. Public fields
must be baseline-readable. When private fields exist, change-history access must
also deny that role. Deny a source policy's direct baseline unrestricted role as
before. Capability requirements include the baseline role’s explicit denies;
public access cannot borrow a manager’s field capabilities.

Use one pure contract helper for declaration and canonical Native validation.
After successful proof, normalization adds the baseline to the policy's read
unrestrictedRoleCodes and retains the explicit publicRead fields in immutable
configuration; Native validation independently re-proves every field/capability
and requires this intent before accepting the baseline exception. Tampering with
field policies, roles, bindings or public fields invalidates the sealed contract.
No dynamic frontend scope calculations, IAM table, per-query DB lookup or second
state owner. Existing Native same-member field eligibility and RLS remain the
runtime authority; Perspective can further narrow read roles. Writes are always
the original user union and use independent transaction authorization.

Require data.authenticated-public-projection@1.0.0. Preserve old policy behavior
without the opt-in; only the previously invalid baseline-unrestricted declaration
needs the explicit contract. No V1 engine, migration SQL or database shape change.
All compilers, strict schemas, capability catalog and docs ship from one source.

## Failure, resource and rollback boundaries

Malformed/empty/unknown/duplicate fields, baseline capability expansion into a
private field, public subtable, writable policy or unsafe history access fail
before any platform configuration or business write. Query/filter/sort/aggregate
and export all continue to require the same member's full field capability set;
raw private requests cannot borrow the public role's all-row scope. Public APIs
and ordinary authenticated reads remain separate.

Bounded static proof only; no per-row calls or caches. Existing read pagination,
query bytes and Native locks do not change. Rollback removes opt-in declarations
before SDK/compiler rollback; retain business rows and original failed candidate.

## Falsifiable verification

Both compilers preserve explicit publicRead, derive the capability and agree on
the canonical policy. Plain baseline unrestricted remains rejected. Malformed,
private-field widening, all-capability baseline, unsafe history, subtable and
writable policies reject. Canonical tampering is independently rejected by the
installed platform compiler. Actual ZJNU checks use two scoped managers plus
public-only users: public fields retain the existing all-row projection; private
list/aggregate/export follow only the complete eligible managing membership;
capability-only and scope-only members cannot compose. The official maintenance
Perspective scopes instrument choices; portal union is restored on leaving.
Type/unit/source gates are not app/browser acceptance or full migration closure.
