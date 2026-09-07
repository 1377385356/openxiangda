# Workflow detail action and member-selection presentation

The user's three live mobile screenshots show a duplicated terminal status banner,
separate footer rows for decisions and close/edit, edit before completion, and an
operation drawer taller than the viewport. Transfer and CC currently build a
search-only Select instead of consuming the shared member field.

The standard Workflow renderer owns this presentation correction across resource,
task, instance, Todo and Message entries. Keep the single title status, show the
current-node information only while there is an active node in an unfinished
instance, remove the Workflow footer Close button, and align More/decisions/edit
in one mobile row. Offer ordinary administrative editing only for a terminal
instance. This is a visibility rule; existing server authorization, edit CAS and
completed workflow facts remain authoritative and unchanged.

Use PlatformDirectoryPicker with the explicit surface device. Its staged
selection, department browsing, search, paging, disabled members and cancellation
remain shared. The Workflow adapter retains display snapshots only and emits the
existing string userId / string[] userIds command values. Schema-required and
maxItems validation remain in the operation form. No new identity cache, API,
permission, application override or persistent state is introduced.

Bound the bottom operation drawer to the dynamic viewport, keep its header and
submit control visible, scroll only its body, and preserve the command-in-flight
close guard. Verify the nested member sheet in short and narrow viewports; do
not compensate with application/body scrolling or global CSS.

This optional 2.0 UI change does not alter 1.x, data schemas, Workflow commands or
other tenant authorization. Rollback is the prior package/application frontend
version. Tests must cover pending/terminal visibility, one-row button geometry,
no duplicate status, bounded dialogs, standard PC/mobile member selection and
cancel/reopen, and exact single/multiple ID payloads. Publish a Changeset-selected
version after affected and release gates, then verify the real Demo with its
existing dedicated test identities and isolated synthetic records.
