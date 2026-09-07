# Workflow launch contract canonical equality

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

## Problem evidence

The standard Workflow launch page compares the generated application contract
with the production launch Surface before rendering a form. The comparison
used `JSON.stringify` directly. PostgreSQL `jsonb` does not preserve object key
insertion order, so a semantically identical named-operation mapping can return
with a different key order and be rejected as
`OPENXIANGDA_WORKFLOW_LAUNCH_CONTRACT_MISMATCH`. union reference app membership join exposes
this with its multi-field `inputs` mapping.

## Capability owner

`openxiangda` owns standard Workflow launch rendering and the client-side
contract integrity check. Applications continue to declare the launch contract
once; they must not reorder declarations or add a fallback page to accommodate
storage serialization details.

## Stable invariants and affected contract

- Generated and runtime launch contracts must still match exactly by value.
- JSON object key order is not semantic; JSON array order remains semantic.
- Operation code, HTTP method, path, capability and schema digests retain their
  existing scalar comparisons.
- The change affects only the equality check for named-operation `inputs`,
  `output`, and launch `context`; it does not change their wire schemas.

## Failure, concurrency, and security bounds

The comparison remains fail-closed for missing, additional, or changed values.
Canonicalization is deterministic and side-effect free. Existing server limits
bound named-operation inputs to 64 and launch context to 16, so sorting object
keys does not create an unbounded client workload. The check does not read or
persist identity, authorization, business data, or Workflow state.

## Rollback boundary

Rollback is the prior `openxiangda` package version. No platform database,
application contract, or Workflow data migration is required.

## Falsifiable verification

- A generated launch intent and a JSONB-reordered Surface compare equal.
- A changed nested field binding still compares unequal.
- A reordered context array still compares unequal.
- `pnpm verify:affected` passes before versioning and publishing.

