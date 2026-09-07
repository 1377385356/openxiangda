# Single resource declaration contract

## Problem evidence

The final low-capability-model black-box run created a clean application with
the published CLI, but failed before tests because it placed labels, required
state, Surface options and file limits beside each storage field. The current
application contract instead requires the same field to be described once in
`schema.fields`, again in `surface.fields`, and sometimes a third time in
`fieldPolicies`. The generated README also directs developers to a
`platform/data` directory that the clean template does not contain. This is a
contract-design failure: the most direct interpretation of “declare a resource
and its fields” is currently invalid.

## Capability owner and stable invariants

The OpenXiangda compiler remains the only owner of application declarations.
The platform remains the owner of physical schema, authorization and Native
Data execution. A source field is declared exactly once. The compiler projects
that declaration into the strict platform DataResource and the generated
desktop/mobile Surface. Generated CRUD continues to use Native Data directly;
NestJS remains reserved for named transactional business actions.

The new source contract is intentionally breaking. Application source no
longer supplies `schemaVersion`, `appCode`, `schema`, `capabilities`, `surface`
or resource-level `fieldPolicies`. It supplies `code`, `name`, `fields` and
optional list/layout/data-policy settings. Every field supplies its semantic
type and label together. `required` owns logical Data API validation and the
form hint; authored business columns remain physically nullable. `access` owns
field read/create/update authorization. File and reference metadata stay on
that same field.

## Derived contracts

For resource `R` in application `A`, the compiler deterministically owns the
four capabilities `app:A:data:R:{read,create,update,delete}`. An unrestricted
field explicitly receives those resource capabilities for read/create/update;
an access override receives the declared all-of capabilities; `false` becomes
an empty deny set. Surface writability consumes capability arrays, so it has the
same all-of semantics as the platform instead of a separate single-capability
approximation.

A current-user row rule has one form only:
`{ subject: 'current_user', field, roleCodes? }`. Operator/value spellings are
not part of the application contract.

## Failure, security and resource bounds

Unknown resource or field properties fail compilation. References retain the
stable ID type rules. File limits remain bounded by the Native contract. A
field without an access override is writable only when the caller has the
resource operation capability; it is not public. Empty access arrays fail
closed. The change adds no runtime, database, pod or state owner.

## Blast radius and rollback boundary

This changes only the pre-1.0 OpenXiangda 2.0 application source contract,
compiler, generated template, public Skill and generated Surface types. It does
not change OpenXiangda 1.x or production data tables. Existing 2.0 source is not
migrated or accepted; fresh applications are regenerated. Rollback is the
toolchain/package release and its root gitlink, independently of the platform
runtime.

## Falsifiable verification

1. The compiler rejects the former `schema`/`surface`/`fieldPolicies` source
   shape and accepts one-field declarations for text, number, date, directory,
   resource and managed-file controls.
2. The normalized config contains only strict platform DataResource keys and
   generated field policies exactly match Surface capability arrays.
3. Generated template check, unit tests, build, packed-distribution smoke and
   full release verification pass.
4. A fresh low-capability-model workspace passes check/test/build/E2E, exposes
   the matching MCP AI catalog, deploys, becomes healthy and completes the
   visitor duplicate-reservation regression.
