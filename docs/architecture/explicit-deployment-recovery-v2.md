# Explicit Deployment Recovery V2

## Problem evidence

On 2026-08-27 an immutable alpha.14 application image consistently failed its
Kubernetes readiness probe because the SDK guard rejected its infrastructure
health routes. The platform automatically reclaimed the same durable run until
its attempt counter reached 16. The run held the one-active-run application and
environment locks for about 27 minutes, while a corrected alpha.15 deployment
could only return `DELIVERY_RUN_ALREADY_ACTIVE`.

The platform already exposed idempotent cancel, explicit retry, and environment
start/stop APIs. Devkit and MCP exposed most of those capabilities, but the
public AI CLI omitted them. In addition, `status` without an ID read the compact
deployment list row, so `status` and `logs` returned an empty checkpoint array
even when the detail endpoint held checkpoints.

## Capability owners and invariants

- The platform database remains the only owner of DeploymentRun state, attempt
  fencing, application/environment exclusivity, immutable AppVersion activation,
  and environment runtime state.
- A queue dispatch executes a durable run once. A retryable failure becomes a
  visible terminal `failed` run; it is never automatically replayed as another
  semantic deployment attempt.
- Retry is an explicit, idempotent user/AI decision against the same run and
  immutable package. The platform increments and fences the attempt.
- Cancel is idempotent and remains limited to a run whose activation checkpoint
  has not committed. It does not edit Kubernetes desired state directly.
- Start and stop operate on the environment's current immutable Head and derive
  idempotency from the environment revision.
- `status` without an ID may use the list endpoint for discovery, but must hydrate
  the latest run through the detail endpoint before returning it to AI.

## Public contracts

The flat application CLI adds `cancel <deployment-id>`, `retry <deployment-id>`,
`start [--environment test|production]`, and
`stop [--environment test|production]`. Test maps to preproduction, matching
deploy and rollback. MCP adds the missing `cancel_deployment`; its existing
retry/start/stop tools keep the same Devkit owner.

`DELIVERY_RUN_ALREADY_ACTIVE` points AI to `openxiangda status`. A failed,
retryable status advertises `openxiangda retry <id>`; an active pre-activation
run advertises logs and cancel. No command accepts image coordinates, secrets,
raw environment IDs, RoleSession state, or an SDD bypass.

`DEVKIT_COMMANDS` is the single owner of the executable public command set. The
CLI launcher derives its rejection allowlist from that registry instead of
maintaining a second literal list. Release verification invokes
`openxiangda <command> --help` for every registered command, so top-level help
discovery cannot pass while the launcher still rejects a newly added command.

## Failure, concurrency, security, and rollback

Bull owns transport delivery only and uses one attempt. A worker crash can still
be recovered from durable non-terminal state, but an executor-captured domain or
readiness failure stays terminal until explicit retry. This prevents a broken
immutable candidate from holding the active-run unique indexes through repeated
semantic execution.

All mutations continue through authenticated platform APIs and existing manage
permission checks. Responses contain run IDs, bounded checkpoints, stable error
codes, and safe readiness summaries, never tokens, login tickets, or credentials.

Rollback is independent at both layers: restore the previous platform-server
queue policy to restore automatic queue retry, or restore the previous package
versions to remove the new AI commands. Neither rollback changes AppVersion data,
environment Heads, or OpenXiangda 1.x.

## Falsifiable verification

1. CLI discovery and generated reference docs list cancel/retry/start/stop.
2. MCP discovery lists `cancel_deployment` and marks every recovery mutation
   idempotent and non-read-only.
3. Default status performs list then detail and logs contain detail checkpoints.
4. Queue tests prove `attempts: 1` and failed jobs are removable for durable
   recovery; failed runs remain excluded from automatic pending-run recovery.
5. A real retryable readiness failure reaches `failed` once and releases the
   active-run lock; a later explicit retry or corrected deploy can proceed.
6. Every command in `DEVKIT_COMMANDS` crosses the packed launcher boundary and
   returns its command help instead of `OPENXIANGDA_COMMAND_NOT_FOUND`.
