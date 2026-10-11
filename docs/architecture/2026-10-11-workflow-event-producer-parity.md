# Workflow event producer parity

Evidence: the owned lab initial test delivery failed NATIVE_CONTRACT_CLOSURE_MISMATCH because the developer generator and sealed compiler used different opt-in predicates for node.skipped and platform notifications. No runtime writes passed preflight.

Owner and invariant: the shared contract owns one event catalogue and one declaration selector used by both generators. Return-resume skipped visits are audit only; they do not invoke application event handlers. Approval empty-policy skips keep their existing public event. Notification is opt-in and does not declare application business-step events.

Failure and concurrency: invalid contract closure remains rejected before preparation. Removing resume event emission changes no task/result/visit transaction. Audit retains skipped status and evidence. No production publication. Verify developer generated artifact through the sealed compiler for return policies and notification, with ordinary corpus unchanged.
