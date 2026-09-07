# Resource CRUD generator hardening v2

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

## Problem evidence

- A fresh application copied the instrument/instrument reference app golden-module files, routes,
  resources, backend controller, and tests.
- Resource code validation accepted only underscore identifiers while app codes
  used kebab-case, so a normal resource such as `meeting-rooms` could not be
  declared.
- Generated pages had a generic renderer, but directory and resource references
  were not represented by one contract; applications fell back to text fields.
- A generic record update capability allowed ordinary roles to write identity,
  status, subject, and derived business fields unless every field was manually
  restricted.
- Meeting overlap, course capacity, and visitor duplicate rules require an
  application operation and an atomic transaction; plain CRUD cannot guarantee
  them.

## Decisions and stable invariants

1. The application template is a clean CRUD scaffold. It contains no business
   resource, instrument reference app fixture, sample identity, or instrument-specific backend.
2. Resource codes use the same canonical kebab-case grammar as app codes. The
   compiler emits the canonical code unchanged in API paths and generated
   contracts. OpenXiangda 2.0 does not accept or migrate legacy underscore
   resource declarations.
3. A field declaration owns both storage type and its standard widget. A single
   member or department reference uses `user.single`/`department.single`;
   multi-value variants use `user.multiple`/`department.multiple`; same-app
   dynamic references use `resource-ref.single`/`resource-ref.multiple` plus a
   declaration-owned `source`. Desktop and mobile persist complete display
   snapshots and compare their stable `value` keys.
4. Generic record updates are denied for ordinary roles unless a field has an
   explicit create/update capability. Application-admin roles retain the
   declared bypass and platform audit trail.
5. Complex invariants are standard App API operation templates. Each operation
   is capability guarded, validates the current RoleSession, and uses the
   restricted Data API transaction with an idempotency key.

## Owners and contracts

- Contracts and validation: `packages/contracts`.
- Compiler normalization and generated declarations:
  `packages/devkit-core/src/compiler`.
- Standard desktop/mobile CRUD: `templates/application/apps/web`.
- Application business operation templates: `templates/application/apps/server`.
- The platform remains the sole owner of identity, authorization, and native
  data persistence; generated apps do not create a second store.

## Failure, concurrency, and security bounds

- Invalid resource/reference declarations fail at `openxiangda check`.
- Selector failures fail closed and never accept a display label as an ID.
- Writes carry `expectedRevision`; business operations additionally carry an
  idempotency key and use one restricted transaction.
- Overlap/capacity/duplicate checks are performed inside the transaction so a
  retry or concurrent request cannot bypass them.
- No default role receives unrestricted writes to identity, status, relation,
  or derived fields.

## Rollback boundary and falsifiable verification

- This change is limited to the 2.0 toolchain and clean application template;
  existing deployed applications and the platform server are not mutated.
- Rollback is the previous `tools/openxiangda-v2` mainline commit and package
  version.
- Verification must prove: clean create has no instrument reference app markers; dynamic tests pass
  for zero, one, and multiple resources; canonical resource codes compile;
  selector widgets are emitted for references; ordinary role writes are
  rejected by policy tests; the three operation templates compile and their
  transaction/idempotency contracts are present; release verification passes.
