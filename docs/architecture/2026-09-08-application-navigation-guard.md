# Application Navigation Guard

Status: decided before implementation after inspecting installed React Router 7.8.2.

The public application currently owns BrowserRouter, which does not support
React Router's useBlocker. Applications cannot register dirty navigation state
without replacing or patching the platform router. The meeting draft therefore
has an unprotected browser-history departure path.

OpenXiangdaApplication remains the sole router/lifecycle owner. Internally use a
single createBrowserRouter wildcard root and RouterProvider, with live React
children supplied by context to preserve existing Routes, providers and component
identity. Export useUnsavedChangesGuard({when, message}). One owner-level blocker
aggregates registered guards; hooks register/unregister, not user data. No custom
history implementation, second router or durable draft state is introduced.

Use a single accessible modal for internal Link/navigate/POP transitions, and
native beforeunload for reload/closing. Native browser restrictions prevent custom
beforeunload text. The first pending destination remains authoritative while the
modal is open; retain its library-provided proceed/reset callbacks and let React
Router own history restoration. Extra POP and redirect attempts must be tested,
not assumed safe. Save clearing dirty state or unmounting removes registration.
Stay preserves the route, history position and edited fields; leave executes the
original navigation once. No modal/field-local state operation triggers a guard.

Test the actual application router at its basename with desktop/mobile viewports:
Link, imperative push/replace, back/forward/multi-step POP, repeated attempts while
prompting, cancellation, same-location state, saving/unmount, no-dirty navigation,
device route negotiation and auth-return. Confirm focus/keyboard dialog behavior
and absence of remount/data loss. Full existing browser route suite is required.
No platform schema or V1 runtime change. Package/app-artifact rollback restores
the original BrowserRouter behavior and the known unprotected departure path.

Lifecycle detail: create/dispose the single data router in the owning component's
layout effect, rendering its provider after initialization. This avoids render-time
browser listeners leaking through StrictMode's discarded initializers. Its wildcard
element reads the live child tree from context; ordinary parent re-renders must not
recreate the router or remount the form. The basename stays with this router.

Use only the public useBlocker contract. Its blocked snapshot includes the original
proceed/reset closure (POP waits for the router's own history restoration). Retain
the first snapshot while the dialog is open, then clear before proceeding once.
Subsequent attempts remain blocked; never patch history, manipulate POP deltas, or
use private router internals. Installed 7.8.2 supports blocked-to-proceeding and
blocked-to-unblocked transitions through these public callbacks. Real repeated
POP tests remain the falsifier; any failure must be repaired at this owner before
publishing. Unmanaged raw history.pushState is outside the supported app API.

Guard registrations carry only a dirty boolean and optional display message,
registered in a layout effect with a stable key and cleanup. A single beforeunload
listener reads the current registry; success/unmount removes registration before
the application's later navigation effect. If every guard clears while prompting,
reset the pending departure and dismiss the prompt. No restored command or draft
payload is copied into the guard. The standard Modal offers cancel/leave and focus
trapping on PC/mobile. Browser-origin refresh/close uses the native prompt.

## Candidate verification

The actual application router passed ten new browser cases plus existing direct
route/device/basename negotiation. This covers StrictMode and parent redraw without
form remount, PUSH/replace and repeated POP, multistep back/forward, first pending
destination, focus/Escape, native beforeunload cancellation, multiple registrations,
unmount, success effect ordering and a narrow mobile dialog. A settling latch keeps
React Router's asynchronously published reset/proceed from recapturing an obsolete
blocked snapshot. No private router or browser history mutation is used.

Affected gate: 12/12 tasks. The old static composition assertion now names the
single ApplicationRouter wrapper; full packed browser route regression is required
for the frozen release. Do not run a workspace build concurrently with a browser
harness serving its dist files: hot replacement can split React context instances.
