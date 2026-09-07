# Generated Resource Surface Contract Alignment v2

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

## Problem evidence

The v2 resource generator emits `surface.form.fieldOrder` and
`surface.detail.fieldOrder` from the declaration order. Platform deployment
first rejected the form property and, after that validator gap was repaired,
replacement DeploymentRun `38a941dc...` failed at
`/config/data/resources/0/surface/detail/fieldOrder` with
`NATIVE_PROPERTY_UNKNOWN`. This proves that generated output, the public JSON
Schema and the platform semantic validator were being maintained as separate
property inventories.

A full inventory also found that `DataFieldSurface` and both generator paths
emit `maxLength`, `precision`, `scale`, `maxSizeMb`, `serial` and `subtable`,
while the public `dataResourceSchema` omitted those six already-public field
surface properties.

## Capability owner and stable invariants

`openxiangda-contracts` owns the public `DataResourceSurface` type and JSON
Schema. The devkit compiler owns deterministic generation from resource
declarations. The platform Native configuration compiler remains the sole
authority that admits a bundle into an immutable configuration revision.

- The TypeScript surface type, public JSON Schema and generator must describe
  the same legal property tree: resource, field, list, default sort, form,
  detail and mobile.
- Form and detail share the same layout contract. Their optional `fieldOrder`
  arrays preserve declaration order and contain only fields declared by that
  resource.
- Adding known properties must not make the contract open-ended. Every object
  continues to declare `additionalProperties: false`; unknown siblings fail
  closed at the platform boundary.
- Existing numeric, cardinality and string bounds remain authoritative. This
  change does not infer fields from object-key order or enlarge package/runtime
  budgets.

## Affected public contract

The JSON Schema becomes consistent with the already-exported
`DataFieldSurface` interface and generator output by declaring the six missing
field projection properties. No TypeScript property, field type or renderer is
introduced. A patch changeset is required because schema consumers previously
rejected values that the same package generated and typed as legal.

The platform keeps a separate semantic validator for resource-local
references, type/widget compatibility and projection equality. A cross-repo
inventory gate compares the public Schema's legal key sets with the exact
whitelists used by that validator.

## Failure, concurrency, security and resource bounds

Schema validation and semantic validation remain deterministic, bounded tree
walks. Unknown keys, duplicate field order entries, non-string entries,
undeclared resource fields and incompatible projections fail before a
configuration revision is persisted. The change performs no network access,
authorization lookup or mutable write and creates no new concurrency path.

## Rollback boundary and blast radius

The contract change is additive and independently reversible. Rolling it back
causes affected generated artifacts to fail validation again but does not
rewrite packages, configuration revisions or business data. OpenXiangda 1.x,
union reference app-specific code, tenant authorization and runtime CRUD APIs are unchanged.

## Falsifiable verification

- A public-schema fixture containing every legal generated surface sibling is
  accepted, including both form and detail field order.
- Removing any of the declared contract keys from the public Schema makes the
  contract inventory test fail.
- Adding an unknown sibling at every object level remains rejected because
  `additionalProperties` stays false.
- Generator tests prove form and detail arrays preserve resource declaration
  order; package build, checks and affected verification pass.
