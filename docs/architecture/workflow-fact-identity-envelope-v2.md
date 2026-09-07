# Workflow Fact Identity Envelope V2

## Decision

Every platform-owned Workflow fact v2 uses one immutable identity envelope:
`workflowCode`, `definitionVersion`, `bindingVersion`, `instanceId`,
`generation`, `businessKey`, `instanceSequence`, `revision`, `dataRef`, and
`dataRevision`, plus `actor` and `cause`.

The Workflow Kernel derives this envelope from the instance snapshot for every
started, task, participant, and terminal fact. Event-specific data cannot
override it. Consumers never read the current Head to infer which workflow
contract emitted a historical fact.

## Failure and ordering

Missing identity fails before persistence. Facts and outbox pointers remain
atomic. Consumers order by `instanceId + instanceSequence`, apply idempotently
by event ID, and let terminal instance facts dominate stale task or participant
facts.

## Acceptance

The public JSON schema requires the complete envelope. Platform tests cover
started, completed, rejected, withdrawn, and terminated construction plus
immutable persistence and delivery without field loss.
