# Application work and message centers

## Decision, 2026-09-06

The standard work center only exposed two task lists. Completed task filtering
missed users who had already acted on still-running approvals. Created and CC
views must come from the Workflow owner, not a client-side union or message
search. Workflow's server work-center query supplies pending/handled/created/cc,
counts, authorized business titles and canonical detail navigation.

The default desktop Shell prepends the enabled standard work center and message
center, in that order. Their availability is derived from the existing compiled
route manifest; no app-specific menu, new route store or expanded grants are
required. User-defined resource/operation navigation retains its declaration.
The optional Notification Hub center uses its existing recipient-scoped `/todos`
query with the additive `all` view, unread/search filters, and read/click receipts.
Workflow CC is a Workflow fact and read grant; it is not inferred from a
notification. The server has a separate decision for command authority and
event projection. Messages and work items navigate to the same detail renderer
as resource lists, respecting explicit custom routes.

The current-user union, application and environment stay server authoritative.
The browser never requests another user's inbox or modifies a business record
to simulate a task. Query changes discard stale responses; errors clear old
items and allow retry. Pagination remains bounded and generated role/session
internals do not appear as business labels. Rolling back the browser package
reverses the default navigation and presentation independently of immutable
Workflow and Notification Hub facts. Stable 1.x code and stores are untouched.

Verify four work views with real command facts, current-user message isolation,
unread interaction receipts, PC/mobile routes and default navigation order.
Check that opening any item reaches the same shared detail frame and that an
unavailable/forbidden detail cannot fall back to a broader Native read.
