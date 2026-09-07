# Standard resource entry presentation

Evidence: alpha.96 wraps every desktop resource route in Shell, even direct create/edit links; resource routes bypass the viewport policy used by workflow routes. Detail links navigate to a different layout. Closing dirty drawers asks for confirmation rejected by the user.

Owner: openxiangda application routing owns shell/device selection. Standard resource components own entry/read presentation and lifecycle. No app-specific CSS or alternate route/data/auth stores.

Decision: direct create/edit/detail routes render independent surfaces; list routes retain admin Shell. Independent resource entry controls react to the existing manifest viewport policy (explicit mobile routes remain mobile). Preserve independent form instance and values on viewport changes. List route families remain explicit (/admin and /m/admin), so resizing a desktop list cannot unmount its active drawer and discard input. Desktop list detail actions open a read-only drawer using the same sections, grid and field widths as entry, with real read-capability checks. Explicit detail-view field selections and audit/contribution access remain authoritative. Closing an entry drawer discards only unsaved UI changes immediately; persisted drafts remain and in-flight writes still block close.

Bounds: no permission widening, data migration, new services or tenant writes. Existing field visibility and read permissions remain mandatory, including child rows and managed files. No writes occur in readonly rendering. 1.x and already-built applications are unaffected; consumers opt in by package upgrade.

Rollback: revert SDK package and redeploy the prior immutable Demo version, retaining data/drafts. Verification: generated direct create has no Shell/back-list; 390px viewport uses mobile controls; resizing preserves form values; list detail opens read-only drawer with section layout; close after typing has no discard confirmation; draft and mutation conflict behavior remains covered.
