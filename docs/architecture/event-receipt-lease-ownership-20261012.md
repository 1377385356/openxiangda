# Receipt lease ownership regression, 2026-10-12

This change belongs to the unreleased PLT-040 worker-effect candidate at
`a83a67c4a4ef7a608815abd615fb5a815393cd4f`. It does not update authoritative
master gitlinks, publish SDK packages, or modify the school sealed release.

`PlatformOpenXiangdaEventReceiptStore` now keeps a claim token in a WeakMap
keyed by the exact handler receipt object. Equal event/delivery protocol fields
can belong to overlapping attempts after an expired lease is reclaimed. An old
handler can no longer borrow, complete, release, or erase a newer handler token.
The in-memory duplicate receipt key and wire identity remain unchanged.

The five behavior regressions failed on the original Map implementation. After
the change, all five passed. Together with original event-handler scope,
native-event actor, workflow-business-step and event-worker-effect tests,
22 focused Nest tests passed, with test concurrency 1. Nest TypeScript noEmit
also passed. No verification was attributed to a published artifact or a prior
release-train receipt.

Command run in `packages/nest`:

```sh
../../node_modules/.bin/tsx --test --test-concurrency=1   test/event-receipt-lease-ownership.test.ts   test/event-worker-effect.test.ts test/event-handler-scope.test.ts   test/native-event-actor.test.ts test/workflow-business-step.test.ts
../../node_modules/.bin/tsc -p tsconfig.json --noEmit
```

The companion clean server candidate is
`/home/yuxing/lowcode-main/platform-worker-effect-v2-wt` at
`72aad1ebe9b3786b3eef4715b694c5d251f63dc7`. Its new SQL policy harness tests
actual candidate migration SQL in a fresh isolated PostgreSQL 15.14 database.
20 policy/schema/RLS cases passed. The task-only container is
`codex-zjnu-worker-effect-pg-20261012`, WSL loopback port 15443, memory 384 MiB,
CPU 0.5; credentials are private task env-file contents and are never output.
Existing project containers were left running.

Evidence: `/home/yuxing/.cache/zjnu-worker-effect-20261012/pg-policy-evidence.json`.
The database name and migration digest are in that file. No full Native executor,
platform HTTP integration, frozen intent concurrency/atomic commit/response-loss
recovery, or official release-train pass is claimed by the SQL policy harness.
Those remain required before enabling timers or releasing PLT-040.

The server candidate's frozen dependency still points to
`vendor/openxiangda-contracts-2.75.0.tgz`, which does not contain the worker-effect
exports. Frozen dependency installation succeeded using 1173 cached packages
and 4 pinned downloads; the lockfile and vendor artifacts were not changed.
The original offline miss was `esbuild@0.25.12`, then resolved by normal locked
installation. A proper candidate SDK/contracts release and matching server vendor
sync are still needed for complete platform compilation and end-to-end evidence.

12 real-PG component scenarios additionally passed using the actual candidate effect service and shared contract validators. Evidence: `/home/yuxing/.cache/zjnu-worker-effect-20261012/pg-component-evidence.json`. Catalog context and Native executor are explicit fixture adapters backed by real PG/RLS; this is not full Native engine, HTTP or formal SDK train evidence. The candidate contracts were rebuilt from their isolated source for these tests, without replacing vendor/lockfiles or published artifacts. School is now moving to the separate public 2.62.1/2.78.0 release, so this older candidate must integrate into that authoritative baseline with a new Changeset before release.
