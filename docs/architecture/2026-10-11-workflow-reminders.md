# Durable workflow reminders

Claude P1 basis: reminders to current handlers, snapshotted at task entry, max ten sends. Applies to approval, handling and applicant correction tasks including return/resume. Administrators may configure timing on the shared canvas; it follows E for an open task.

Owner: the existing workflow deadline table and worker own scheduling, locks, retries and cancellation; Notification Hub owns delivery. Expand the same table with kind completion/reminder, uniqueness (task_id,kind), and a successful-send counter separate from transient retry attempts. Existing completion rows default to completion and retain their approve-only rule. No second timer service.

Invariant: one accepted event per (row,successful ordinal), persisted in the same transaction as counter and schedule. At most ten accepted reminder events; no automatic vote or flow advancement. Finishing a task cancels both row kinds. Rules are immutable E snapshots. Only currently active participant users are recipients, <=200, existing normal pending-assignment failures are retried. No extra read grant.

Concurrency/failure: configuration shared lock -> instance lock -> deadline/task locks, matching human commands and adoption. Database time decides due state. A due reminder with no active recipient is retried under the existing bounded failure policy. Next reminder is scheduled from database now to avoid a burst after downtime; successful count survives restart. Outbox/Hub owns delivery retries.

Compatibility and rollback: additive SQL-only migration, old completion semantics unchanged. Rollback retains a compatible worker for reminder-enabled versions and existing scheduled rows; no destructive down. Verify both compiler formats, row-kind coexistence, open-task E preservation, bounded repeats, cancellation, transaction rollback and lock order, then owned-lab event/message readback. No production deployment.
