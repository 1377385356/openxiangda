# Explicit optional rejection comments

Status: implementation decision. V2 only; existing defaults remain required.

The instrument V1 service and its PC/mobile forms permit an empty rejection opinion. The V2 definition contract currently rejects `operationPolicy.reject.commentRequired: false`; the administration editor, Surface schema and decision executor also force a nonblank comment. Supplying invented text in the application would change business meaning.

Workflow owns this rule. Permit explicit `false` on the immutable approval-node definition; omitted rejection policy retains `true`, omitted approval policy retains `false`. A runtime administrator may tighten an optional policy and restore the explicitly optional code baseline, but may never relax a required code baseline (including the implicit legacy rejection default). Freeze the effective policy when each task is entered; subsequent definition/configuration changes never rewrite an active task's rule.

A shared resolver supplies the same default to contract validation, editor, Surface and command execution. Optional comments accept omission or empty/whitespace strings; supplied values still require strings of at most 4000 characters and are trimmed for the existing audit representation. Never manufacture an opinion. Other operations retain required reasons and administrative overrides retain their separate contract. Receipts resolve before current validation and do not rewrite history on replay.

Add `workflow.optional-rejection-comment@1.0.0` to the sealed requirements only for definitions that explicitly opt out, preventing an older runtime from accepting the declaration without its semantics. No new identity, permission store, schema migration, V1 change or external messages. Production/default flows are unchanged. Rollback must first retire new optional definitions/in-flight instances or use a runtime that retains this capability; code rollback does not undo decisions.

Verification must cover absent/true/false code defaults, permitted tightening and forbidden administrative relaxation, frozen-task behavior, invalid supplied values, Surface/direct-command equivalence, repeated receipts and downstream rollback. The application additionally needs real HTTP and three-device empty-rejection behavior under authentic local roles. Package tests and versioning are separate from npm/production release; this task uses the complete official local SDK exporter only.
