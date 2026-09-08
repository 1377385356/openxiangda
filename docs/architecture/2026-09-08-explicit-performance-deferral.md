# Explicit performance deferral in business verification

## Problem evidence and owner

An actual successful TEST release with ten functional AC records cannot pass
`spec verify`: `verifyBusinessAcceptance` requires a nonempty performance array
and every measurement within budget. The user explicitly deferred performance
work, with previous over-budget evidence retained. Filling an invented passing
measurement or silently omitting the failed measurements would misstate the
result. Devkit owns the local delivery-record gate shared by CLI and MCP.

## Decision and stable invariants

Add optional `performanceDeferral` to the v1 report, with literal status
`deferred`, reason, follow-up, authorizing person, actual authorization time,
source reference and existing evidence references. It applies only to this
report's exact successful TEST run/package/change. Without it, all existing
measurement requirements and budget failures remain blocking. With it, an empty
array is allowed and actual over-budget measurements remain present and valid
as observations. Numeric validity and evidence checks never relax.

The verification result explicitly distinguishes performance `passed` from
`deferred`, and counts recorded and over-budget measurements. Production stage
details expose the same disposition. No functional AC may be failed, missing or
deferred by this field. Original TEST plan, source mainline, immutable package,
application permissions and deployment readiness checks remain authoritative.
Documentation and generated skills/MCP guidance must explain that structural
checks do not prove the authorization or observations are true.

## Failure, concurrency, security and resource bounds

Malformed/placeholder deferrals, missing evidence, invalid or future-relative-to-
report authorization timestamps, wrong version bindings and failed functional
ACs fail closed. Report/evidence path and symlink restrictions remain; report is
bounded at 1 MiB, 500 scenarios, 100 measurements and bounded deferral text/evidence.
No new network operation, persistent state store, runtime authorization or
shared platform mutation is introduced. An old tool rejects an empty report;
upgrading the published tool does not rebuild the original tested application.

## Scope and rollback

This is one additive V2 delivery-record topic, not performance optimization or
a blanket release bypass. V1 and backend runtime are unaffected. Existing V2
reports keep their old semantics. Rollback uses a later package version or the
old tool; published package bytes are immutable. Parent gitlink advances only
after the exact public commit is published. scz runtime need not change.

## Falsifiable verification

- Legacy passing records pass; empty or over-budget records without deferral fail.
- Explicit evidenced deferral passes with empty or actual failed measurements,
  and its public result/stage says deferred, never performance passed.
- Incomplete authorization, missing/symlink/escaping evidence, invalid numbers,
  failed/missing AC, wrong run/package or TEST source continue to fail.
- CLI/MCP use the same gate; formal package validation and published app adoption
  must demonstrate same-TEST-run production preflight without rebuilding.
