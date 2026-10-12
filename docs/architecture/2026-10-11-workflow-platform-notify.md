# Platform notification preset

Claude P1 basis: inline platform.notify v1, one durable event per visit, bounded recipients, no pending business-step row, Notification Hub delivery ownership. Use the canonical action node with fixed handler platform-notify-v1, mode reconciled-effect, fixed text input/empty output schemas and a constrained notification recipient selector. The capability is named platform.notify in the visit proof. This identifier fits existing handler syntax while remaining a platform preset.

Owner: Workflow V2 resolves known tenant-active recipients through the existing assignment owner and emits node.notified in the same transition transaction; the existing workflow event inbox and Notification Hub projector own messages, channels, delivery and retries. No direct send in a nested transaction and no extra read grant from notification.

Limits and authorization: APP_MANAGE remains canvas authority; the preset allows applicant, fixed users, a released app role or a declared user fact, max 50. Text is bounded plain text; navigation is the existing authenticated workflow route. It has no custom backend endpoint, tool execution or arbitrary URL.

Runtime: planner continues inline, visit stores capability/version/input digest/event id, no business-step row or backend subscription. Resume requires scoped visit evidence and emits nothing, even when text/recipients change; replay enters a new visit and emits once. Unknown event delivery remains Hub-owned, not workflow re-execution.

Compatibility: new capability/schema opt-in, V1 and ordinary steps unchanged. Existing source rollback must retain the preset and event projection while recorded visits exist; no production release here. Verify canonical/backend-independent compilation, typed recipient bounds, one event per visit with transaction rollback, Hub dedupe/projection, no CC read grant, resume reuse and real notification readback separately.
